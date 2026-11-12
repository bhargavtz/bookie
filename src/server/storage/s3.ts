import { createHash } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
  type S3ClientConfig,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "node:stream";
import { assertSafeKey } from "./keys";
import { resolveRange } from "./range";
import {
  StorageLimitError,
  StorageNotFoundError,
  StorageRangeError,
  type GetOptions,
  type PutBody,
  type PutMeta,
  type PutResult,
  type StatResult,
  type StorageDriver,
  type StorageObject,
} from "./types";

export type S3DriverConfig = {
  bucket: string;
  region: string;
  endpoint?: string;
  forcePathStyle?: boolean;
  credentials?: { accessKeyId: string; secretAccessKey: string };
};

const MAX_GET_TTL = 60;
const MAX_PUT_TTL = 900;

function isNotFound(error: unknown): boolean {
  if (!(error instanceof S3ServiceException)) return false;
  return error.name === "NotFound" || error.name === "NoSuchKey" || error.$metadata.httpStatusCode === 404;
}

/** Content-Disposition for presigned downloads: ASCII fallback plus RFC 5987 filename*. */
function attachmentDisposition(filename: string): string {
  const cleaned = filename.replace(/[\u0000-\u001f\u007f"\\/]/g, "").slice(0, 200) || "download";
  const ascii = cleaned.replace(/[^\x20-\x7e]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(cleaned)}`;
}

/**
 * S3-compatible driver (AWS S3, Cloudflare R2, MinIO). Checksum behaviour is
 * pinned to WHEN_REQUIRED: the SDK v3 defaults add CRC32 trailers that several
 * S3-compatible services reject.
 */
export class S3StorageDriver implements StorageDriver {
  readonly name = "s3" as const;
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(config: S3DriverConfig) {
    this.bucket = config.bucket;
    const clientConfig: S3ClientConfig = {
      region: config.region,
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
      ...(config.endpoint !== undefined ? { endpoint: config.endpoint } : {}),
      ...(config.forcePathStyle !== undefined ? { forcePathStyle: config.forcePathStyle } : {}),
      ...(config.credentials !== undefined ? { credentials: config.credentials } : {}),
    };
    this.client = new S3Client(clientConfig);
  }

  async put(key: string, body: PutBody, meta: PutMeta = {}): Promise<PutResult> {
    assertSafeKey(key);
    let payload: Uint8Array;
    if (body instanceof Uint8Array) {
      payload = body;
    } else {
      // Buffer with a hard cap. Large streaming uploads should use createUploadTarget (presigned PUT).
      const cap = meta.maxBytes ?? meta.contentLength ?? 64 * 1024 * 1024;
      const parts: Uint8Array[] = [];
      let total = 0;
      for await (const chunk of body) {
        total += chunk.byteLength;
        if (total > cap) throw new StorageLimitError("object exceeds maxBytes");
        parts.push(chunk);
      }
      payload = Buffer.concat(parts);
    }
    if (meta.maxBytes !== undefined && payload.byteLength > meta.maxBytes) throw new StorageLimitError("object exceeds maxBytes");
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: payload,
        ContentLength: payload.byteLength,
        ...(meta.contentType !== undefined ? { ContentType: meta.contentType } : {}),
      }),
    );
    return { key, size: payload.byteLength, sha256: createHash("sha256").update(payload).digest("hex") };
  }

  async stat(key: string): Promise<StatResult | null> {
    assertSafeKey(key);
    try {
      const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: head.ContentLength ?? 0, contentType: head.ContentType ?? null };
    } catch (error) {
      if (isNotFound(error)) return null;
      throw error;
    }
  }

  async get(key: string, options: GetOptions = {}): Promise<StorageObject> {
    assertSafeKey(key);
    const head = await this.stat(key);
    if (head === null) throw new StorageNotFoundError("object not found");
    if (head.size === 0) return { stream: new Blob([]).stream(), size: 0, start: 0, end: 0, contentType: head.contentType };
    const { start, end } = resolveRange(head.size, options.range);
    try {
      const out = await this.client.send(
        new GetObjectCommand({
          Bucket: this.bucket,
          Key: key,
          Range: `bytes=${start}-${end}`,
        }),
        options.signal ? { abortSignal: options.signal } : undefined,
      );
      const body = out.Body;
      if (body === undefined) throw new StorageNotFoundError("object has no body");
      const stream =
        "transformToWebStream" in body && typeof body.transformToWebStream === "function"
          ? (body.transformToWebStream() as ReadableStream<Uint8Array>)
          : (Readable.toWeb(body as Readable) as ReadableStream<Uint8Array>);
      return { stream, size: head.size, start, end, contentType: out.ContentType ?? head.contentType };
    } catch (error) {
      if (isNotFound(error)) throw new StorageNotFoundError("object not found", { cause: error });
      if (error instanceof S3ServiceException && error.$metadata.httpStatusCode === 416) {
        throw new StorageRangeError("range not satisfiable", { cause: error });
      }
      throw error;
    }
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async presignGet(key: string, options: { ttlSeconds: number; filename?: string }): Promise<string> {
    assertSafeKey(key);
    const ttl = Math.min(Math.max(Math.floor(options.ttlSeconds), 1), MAX_GET_TTL);
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ...(options.filename !== undefined ? { ResponseContentDisposition: attachmentDisposition(options.filename) } : {}),
      }),
      { expiresIn: ttl },
    );
  }

  async createUploadTarget(
    key: string,
    options: { maxBytes: number; contentType: string; ttlSeconds?: number },
  ): Promise<{ url: string; headers: Record<string, string> }> {
    assertSafeKey(key);
    const ttl = Math.min(Math.max(Math.floor(options.ttlSeconds ?? 600), 1), MAX_PUT_TTL);
    // S3 presigned PUT cannot enforce a size cap; the finalize step must head() and reject oversize objects.
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: options.contentType }),
      { expiresIn: ttl, signableHeaders: new Set(["content-type"]) },
    );
    return { url, headers: { "Content-Type": options.contentType } };
  }
}

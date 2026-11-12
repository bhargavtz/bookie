import type { StorageDriverName } from "@/contracts/enums";

/** Inclusive byte range. `end` omitted means "to the end of the object". */
export type ByteRange = { start: number; end?: number };

export type PutMeta = {
  contentType?: string;
  /** Required when `body` is a stream on the S3 driver; also enforced as an upper bound. */
  contentLength?: number;
  /** Abort the upload (and leave nothing behind) if more bytes than this arrive. */
  maxBytes?: number;
};

export type PutResult = { key: string; size: number; sha256: string };

export type StatResult = { size: number; contentType: string | null };

export type GetOptions = { range?: ByteRange; signal?: AbortSignal };

export type StorageObject = {
  stream: ReadableStream<Uint8Array>;
  /** Total object size in bytes. */
  size: number;
  /** Inclusive range actually returned. */
  start: number;
  end: number;
  contentType: string | null;
};

export type PutBody = Uint8Array | AsyncIterable<Uint8Array>;

export interface StorageDriver {
  readonly name: StorageDriverName;
  put(key: string, body: PutBody, meta?: PutMeta): Promise<PutResult>;
  /** null when the object does not exist. */
  stat(key: string): Promise<StatResult | null>;
  /** Throws StorageNotFoundError / StorageRangeError. Never returns a signed URL. */
  get(key: string, options?: GetOptions): Promise<StorageObject>;
  /** Idempotent: deleting a missing key succeeds. */
  delete(key: string): Promise<void>;
  /** Optional capability. TTL is clamped to <= 60 s; the URL must never be stored or logged. */
  presignGet?(key: string, options: { ttlSeconds: number; filename?: string }): Promise<string>;
  /** Optional capability for serverless hosts. TTL clamped to <= 900 s; the URL must never be stored or logged. */
  createUploadTarget?(key: string, options: { maxBytes: number; contentType: string; ttlSeconds?: number }): Promise<{ url: string; headers: Record<string, string> }>;
}

export class StorageError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}
export class StorageNotFoundError extends StorageError {}
export class StorageRangeError extends StorageError {}
export class StorageKeyError extends StorageError {}
export class StorageLimitError extends StorageError {}

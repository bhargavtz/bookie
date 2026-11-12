import { createHash, randomUUID } from "node:crypto";
import { createReadStream, type Stats } from "node:fs";
import { mkdir, lstat, open, rename, rm } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { assertSafeKey } from "./keys";
import { resolveRange } from "./range";
import {
  StorageLimitError,
  StorageNotFoundError,
  type GetOptions,
  type PutBody,
  type PutMeta,
  type PutResult,
  type StatResult,
  type StorageDriver,
  type StorageObject,
} from "./types";

const TMP_DIR = ".tmp";

async function* chunksOf(body: PutBody): AsyncGenerator<Uint8Array> {
  if (body instanceof Uint8Array) yield body;
  else yield* body;
}

/** Filesystem driver for dev and tests. Keys map to files under `root`; traversal is rejected twice (key alphabet and resolved-prefix check). */
export class LocalStorageDriver implements StorageDriver {
  readonly name = "local" as const;
  private readonly root: string;

  constructor(root: string) {
    this.root = path.resolve(root);
  }

  private pathFor(key: string): string {
    assertSafeKey(key);
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new StorageNotFoundError("key escapes storage root");
    return full;
  }

  private async fileStat(full: string): Promise<Stats | null> {
    try {
      const s = await lstat(full);
      return s.isFile() ? s : null; // symlinks and directories are not objects
    } catch {
      return null;
    }
  }

  async put(key: string, body: PutBody, meta: PutMeta = {}): Promise<PutResult> {
    const full = this.pathFor(key);
    const tmpDir = path.join(this.root, TMP_DIR);
    await mkdir(tmpDir, { recursive: true });
    await mkdir(path.dirname(full), { recursive: true });
    const tmp = path.join(tmpDir, `${randomUUID()}.part`);
    const hash = createHash("sha256");
    let size = 0;
    const handle = await open(tmp, "wx", 0o600);
    try {
      for await (const chunk of chunksOf(body)) {
        size += chunk.byteLength;
        if (meta.maxBytes !== undefined && size > meta.maxBytes) throw new StorageLimitError("object exceeds maxBytes");
        hash.update(chunk);
        await handle.write(chunk);
      }
      await handle.close();
      await rename(tmp, full);
    } catch (error) {
      await handle.close().catch(() => undefined);
      await rm(tmp, { force: true });
      throw error;
    }
    return { key, size, sha256: hash.digest("hex") };
  }

  async stat(key: string): Promise<StatResult | null> {
    const s = await this.fileStat(this.pathFor(key));
    return s === null ? null : { size: s.size, contentType: null };
  }

  async get(key: string, options: GetOptions = {}): Promise<StorageObject> {
    const full = this.pathFor(key);
    const s = await this.fileStat(full);
    if (s === null) throw new StorageNotFoundError("object not found");
    if (s.size === 0) {
      return { stream: new Blob([]).stream(), size: 0, start: 0, end: 0, contentType: null };
    }
    const { start, end } = resolveRange(s.size, options.range);
    const node = createReadStream(full, { start, end, signal: options.signal });
    return { stream: Readable.toWeb(node) as ReadableStream<Uint8Array>, size: s.size, start, end, contentType: null };
  }

  async delete(key: string): Promise<void> {
    await rm(this.pathFor(key), { force: true });
  }
}

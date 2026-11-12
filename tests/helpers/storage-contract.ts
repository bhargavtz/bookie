import { describe, expect, it } from "vitest";
import { sha256Hex } from "@/lib/checksum";
import {
  StorageKeyError,
  StorageLimitError,
  StorageNotFoundError,
  StorageRangeError,
  type StorageDriver,
} from "@/server/storage";

const KEY = "books/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.pdf";

async function readAll(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
  const chunks: Uint8Array[] = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/** Bytes 0..255 repeated, so any off-by-one in a range shows up. */
const payload = (n: number): Buffer => Buffer.from(Array.from({ length: n }, (_, i) => i % 251));

/**
 * Shared StorageDriver contract. `make` must return a driver with an empty
 * namespace; `unique` produces keys that cannot collide across runs (real buckets).
 */
export function storageContract(label: string, make: () => Promise<StorageDriver>, unique: (key: string) => string = (k) => k): void {
  describe(`StorageDriver contract: ${label}`, () => {
    it("put returns size and sha256; stat sees the object", async () => {
      const driver = await make();
      const key = unique(KEY);
      const bytes = payload(1000);
      const result = await driver.put(key, bytes, { contentType: "application/pdf" });
      expect(result).toEqual({ key, size: 1000, sha256: sha256Hex(bytes) });
      const stat = await driver.stat(key);
      expect(stat?.size).toBe(1000);
      await driver.delete(key);
    });

    it("stat returns null and get throws for a missing key", async () => {
      const driver = await make();
      const key = unique("books/missing/none.pdf");
      expect(await driver.stat(key)).toBeNull();
      await expect(driver.get(key)).rejects.toBeInstanceOf(StorageNotFoundError);
    });

    it("get streams the whole object with size/start/end", async () => {
      const driver = await make();
      const key = unique(KEY);
      const bytes = payload(5000);
      await driver.put(key, bytes);
      const obj = await driver.get(key);
      expect(obj).toMatchObject({ size: 5000, start: 0, end: 4999 });
      expect((await readAll(obj.stream)).equals(bytes)).toBe(true);
      await driver.delete(key);
    });

    it("serves byte ranges: closed, open-ended, single byte, clamped", async () => {
      const driver = await make();
      const key = unique(KEY);
      const bytes = payload(1000);
      await driver.put(key, bytes);
      const cases = [
        { range: { start: 0, end: 9 }, start: 0, end: 9 },
        { range: { start: 100, end: 199 }, start: 100, end: 199 },
        { range: { start: 990 }, start: 990, end: 999 },
        { range: { start: 999, end: 999 }, start: 999, end: 999 },
        { range: { start: 500, end: 99999 }, start: 500, end: 999 },
      ];
      for (const c of cases) {
        const obj = await driver.get(key, { range: c.range });
        expect(obj).toMatchObject({ size: 1000, start: c.start, end: c.end });
        expect((await readAll(obj.stream)).equals(bytes.subarray(c.start, c.end + 1))).toBe(true);
      }
      await driver.delete(key);
    });

    it("rejects unsatisfiable and malformed ranges", async () => {
      const driver = await make();
      const key = unique(KEY);
      await driver.put(key, payload(100));
      await expect(driver.get(key, { range: { start: 100 } })).rejects.toBeInstanceOf(StorageRangeError);
      await expect(driver.get(key, { range: { start: 50, end: 10 } })).rejects.toBeInstanceOf(StorageRangeError);
      await expect(driver.get(key, { range: { start: -1 } })).rejects.toBeInstanceOf(StorageRangeError);
      await driver.delete(key);
    });

    it("accepts a streamed body and overwrites on re-put", async () => {
      const driver = await make();
      const key = unique(KEY);
      async function* body(): AsyncGenerator<Uint8Array> {
        yield payload(300);
        yield payload(200);
      }
      const first = await driver.put(key, body());
      expect(first.size).toBe(500);
      expect(first.sha256).toBe(sha256Hex(Buffer.concat([payload(300), payload(200)])));
      const second = await driver.put(key, Buffer.from("replaced"));
      expect(second.size).toBe(8);
      expect((await readAll((await driver.get(key)).stream)).toString()).toBe("replaced");
      await driver.delete(key);
    });

    it("handles an empty object", async () => {
      const driver = await make();
      const key = unique("books/empty/empty.bin");
      expect((await driver.put(key, new Uint8Array(0))).size).toBe(0);
      expect((await driver.stat(key))?.size).toBe(0);
      expect((await readAll((await driver.get(key)).stream)).length).toBe(0);
      await driver.delete(key);
    });

    it("enforces maxBytes and stores nothing when exceeded", async () => {
      const driver = await make();
      const key = unique("books/limit/limit.bin");
      await expect(driver.put(key, payload(100), { maxBytes: 50 })).rejects.toBeInstanceOf(StorageLimitError);
      expect(await driver.stat(key)).toBeNull();
      async function* streamed(): AsyncGenerator<Uint8Array> {
        yield payload(40);
        yield payload(40);
      }
      await expect(driver.put(key, streamed(), { maxBytes: 50 })).rejects.toBeInstanceOf(StorageLimitError);
      expect(await driver.stat(key)).toBeNull();
    });

    it("delete is idempotent", async () => {
      const driver = await make();
      const key = unique(KEY);
      await driver.put(key, payload(10));
      await driver.delete(key);
      await driver.delete(key);
      expect(await driver.stat(key)).toBeNull();
    });

    it.each(["../escape", "/abs/path", "a/../../b", ".hidden", "a b", "", "a//b"])("rejects unsafe key %j on every operation", async (bad) => {
      const driver = await make();
      await expect(driver.put(bad, payload(1))).rejects.toBeInstanceOf(StorageKeyError);
      await expect(driver.stat(bad)).rejects.toBeInstanceOf(StorageKeyError);
      await expect(driver.get(bad)).rejects.toBeInstanceOf(StorageKeyError);
      await expect(driver.delete(bad)).rejects.toBeInstanceOf(StorageKeyError);
    });
  });
}

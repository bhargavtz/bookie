import { createHash } from "node:crypto";

/** SHA-256 helpers for asset integrity and duplicate detection. Server/script use only. */

export function sha256Hex(data: Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export async function sha256HexOfStream(chunks: AsyncIterable<Uint8Array>): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of chunks) hash.update(chunk);
  return hash.digest("hex");
}

export function isSha256Hex(value: string): boolean {
  return /^[0-9a-f]{64}$/.test(value);
}

/** True if the bytes start with a PDF header within the first 1024 bytes. */
export function looksLikePdf(head: Uint8Array): boolean {
  const limit = Math.min(head.length, 1024);
  const needle = [0x25, 0x50, 0x44, 0x46, 0x2d]; // %PDF-
  for (let i = 0; i + needle.length <= limit; i++) {
    if (needle.every((b, j) => head[i + j] === b)) return true;
  }
  return false;
}

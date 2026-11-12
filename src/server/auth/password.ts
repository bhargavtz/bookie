/**
 * scrypt password hashing (node:crypto, no dependency).
 * Stored format: `scrypt$N$r$p$<salt base64url>$<hash base64url>`; the parameters
 * travel with the hash so they can be raised later without breaking old hashes.
 * Verification is constant-time and never throws on malformed input.
 */
import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

export type ScryptParams = { N: number; r: number; p: number };

/** OWASP minimum for scrypt. Uses about 128 MB per hash. */
export const DEFAULT_SCRYPT_PARAMS: ScryptParams = { N: 2 ** 17, r: 8, p: 1 };
const KEY_LENGTH = 64;
const SALT_BYTES = 16;
/** A stored hash may not ask for more work than this (guards against a poisoned env value). */
const MAX_N = 2 ** 20;
const MAX_R = 32;
const MAX_P = 16;

const FORMAT = /^scrypt\$(\d+)\$(\d+)\$(\d+)\$([A-Za-z0-9_-]+)\$([A-Za-z0-9_-]+)$/;

export type ParsedHash = { params: ScryptParams; salt: Buffer; hash: Buffer };

function derive(password: string, salt: Buffer, params: ScryptParams): Promise<Buffer> {
  const options: ScryptOptions = {
    N: params.N,
    r: params.r,
    p: params.p,
    maxmem: 128 * params.N * params.r + 128 * params.r * params.p + 32 * 1024 * 1024,
  };
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, KEY_LENGTH, options, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

function validParams(params: ScryptParams): boolean {
  const powerOfTwo = params.N >= 2 && (params.N & (params.N - 1)) === 0;
  return powerOfTwo && params.N <= MAX_N && params.r >= 1 && params.r <= MAX_R && params.p >= 1 && params.p <= MAX_P;
}

export function parsePasswordHash(stored: string): ParsedHash | null {
  const match = FORMAT.exec(stored);
  if (match === null) return null;
  const params = { N: Number(match[1]), r: Number(match[2]), p: Number(match[3]) };
  if (!validParams(params)) return null;
  const salt = Buffer.from(match[4] ?? "", "base64url");
  const hash = Buffer.from(match[5] ?? "", "base64url");
  if (salt.length < 8 || hash.length < 16) return null;
  return { params, salt, hash };
}

export async function hashPassword(password: string, params: ScryptParams = DEFAULT_SCRYPT_PARAMS): Promise<string> {
  if (!validParams(params)) throw new RangeError("invalid scrypt parameters");
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, params);
  return `scrypt$${params.N}$${params.r}$${params.p}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

/** False for a wrong password AND for an unparseable stored hash (callers cannot tell the two apart). */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parsed = parsePasswordHash(stored);
  if (parsed === null) return false;
  try {
    const key = await derive(password, parsed.salt, parsed.params);
    // Compare at the stored length so a truncated stored hash still fails instead of throwing.
    const candidate = key.subarray(0, parsed.hash.length);
    return candidate.length === parsed.hash.length && timingSafeEqual(candidate, parsed.hash);
  } catch {
    return false;
  }
}

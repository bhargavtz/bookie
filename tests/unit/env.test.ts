import { afterEach, describe, expect, it } from "vitest";
import { EnvError, getEnv, loadEnv, resetEnvCache } from "@/lib/env";

const HASH = "scrypt$131072$8$1$c2FsdHNhbHQ$aGFzaGhhc2g";

function failure(source: Record<string, string | undefined>): EnvError {
  try {
    loadEnv(source);
  } catch (error) {
    if (error instanceof EnvError) return error;
    throw error;
  }
  throw new Error("expected loadEnv to throw");
}

describe("loadEnv", () => {
  it("applies defaults for an empty environment", () => {
    const env = loadEnv({});
    expect(env).toMatchObject({
      NODE_ENV: "development",
      SITE_URL: "http://localhost:3000",
      STORAGE_DRIVER: "local",
      DOWNLOAD_MODE: "proxy",
      PGLITE_DATA_DIR: ".data/pglite",
      MAX_UPLOAD_BYTES: 200 * 1024 * 1024,
      TRUST_PROXY: false,
      READER_SYNC: false,
      DATABASE_POOL_MAX: 10,
    });
    expect(env.DATABASE_URL).toBeUndefined();
  });

  it("treats blank values (copied .env.example) as unset", () => {
    const env = loadEnv({ DATABASE_URL: "", S3_BUCKET: "  ", ADMIN_EMAIL: "", STORAGE_DRIVER: "" });
    expect(env.DATABASE_URL).toBeUndefined();
    expect(env.STORAGE_DRIVER).toBe("local");
  });

  it("parses booleans and numbers", () => {
    const env = loadEnv({ TRUST_PROXY: "true", READER_SYNC: "1", S3_FORCE_PATH_STYLE: "0", DATABASE_POOL_MAX: "5" });
    expect(env.TRUST_PROXY).toBe(true);
    expect(env.READER_SYNC).toBe(true);
    expect(env.S3_FORCE_PATH_STYLE).toBe(false);
    expect(env.DATABASE_POOL_MAX).toBe(5);
  });

  it("requires s3 settings when STORAGE_DRIVER=s3", () => {
    expect(failure({ STORAGE_DRIVER: "s3" }).variables).toEqual(expect.arrayContaining(["S3_BUCKET", "S3_REGION"]));
    expect(loadEnv({ STORAGE_DRIVER: "s3", S3_BUCKET: "bucket-name", S3_REGION: "auto", S3_ENDPOINT: "https://example.r2.test" }).STORAGE_DRIVER).toBe("s3");
    expect(failure({ STORAGE_DRIVER: "s3", S3_BUCKET: "bucket-name", S3_REGION: "auto", S3_ACCESS_KEY_ID: "id" }).variables).toContain("S3_SECRET_ACCESS_KEY");
  });

  it("redirect downloads need s3", () => {
    expect(failure({ DOWNLOAD_MODE: "redirect" }).variables).toContain("DOWNLOAD_MODE");
    expect(loadEnv({ DOWNLOAD_MODE: "redirect", STORAGE_DRIVER: "s3", S3_BUCKET: "bucket-name", S3_REGION: "auto" }).DOWNLOAD_MODE).toBe("redirect");
  });

  it("admin credential is all-or-nothing and the hash must be scrypt-formatted", () => {
    expect(failure({ ADMIN_EMAIL: "a@example.com" }).variables).toContain("ADMIN_PASSWORD_HASH");
    expect(failure({ ADMIN_PASSWORD_HASH: HASH }).variables).toContain("ADMIN_PASSWORD_HASH");
    expect(failure({ ADMIN_EMAIL: "a@example.com", ADMIN_PASSWORD_HASH: "plaintext" }).variables).toContain("ADMIN_PASSWORD_HASH");
    expect(loadEnv({ ADMIN_EMAIL: "a@example.com", ADMIN_PASSWORD_HASH: HASH }).ADMIN_EMAIL).toBe("a@example.com");
  });

  it("production requires IP_HASH_SALT", () => {
    expect(failure({ NODE_ENV: "production" }).variables).toContain("IP_HASH_SALT");
    expect(failure({ NODE_ENV: "production", IP_HASH_SALT: "short" }).variables).toContain("IP_HASH_SALT");
    expect(loadEnv({ NODE_ENV: "production", IP_HASH_SALT: "0123456789abcdef" }).NODE_ENV).toBe("production");
  });

  it("rejects malformed values and reports every bad variable", () => {
    const e = failure({ NODE_ENV: "staging", SITE_URL: "ftp://x", DATABASE_URL: "mysql://u:p@h/db", MAX_UPLOAD_BYTES: "-1" });
    expect(e.variables).toEqual(expect.arrayContaining(["NODE_ENV", "SITE_URL", "DATABASE_URL", "MAX_UPLOAD_BYTES"]));
  });

  it("never includes values in the error message", () => {
    const secretUrl = "postgres-but-wrong://admin:hunter2-super-secret@db.internal:5432/app";
    const secretHash = "plaintext-password-hunter2";
    const e = failure({ DATABASE_URL: secretUrl, ADMIN_EMAIL: "x@example.com", ADMIN_PASSWORD_HASH: secretHash, S3_SECRET_ACCESS_KEY: "AKIA-secret-value", IP_HASH_SALT: "tiny-secret" });
    for (const needle of ["hunter2", "super-secret", "db.internal", "AKIA-secret-value", "tiny-secret"]) {
      expect(e.message).not.toContain(needle);
    }
    expect(e.message).toContain("DATABASE_URL");
  });
});

describe("getEnv", () => {
  afterEach(() => {
    resetEnvCache();
  });

  it("memoises and can be reset", () => {
    const first = getEnv();
    expect(getEnv()).toBe(first);
    resetEnvCache();
    expect(getEnv()).not.toBe(first);
  });
});

import "server-only";
import path from "node:path";
import { getEnv, type Env } from "@/lib/env";
import { LocalStorageDriver } from "./local";
import { S3StorageDriver } from "./s3";
import type { StorageDriver } from "./types";

export * from "./types";
export { assertSafeKey, assetStorageKey, isSafeKey } from "./keys";
export { resolveRange } from "./range";
export { LocalStorageDriver } from "./local";
export { S3StorageDriver, type S3DriverConfig } from "./s3";

export function createStorageDriver(env: Env): StorageDriver {
  if (env.STORAGE_DRIVER === "s3") {
    // loadEnv guarantees bucket and region when STORAGE_DRIVER=s3.
    return new S3StorageDriver({
      bucket: env.S3_BUCKET as string,
      region: env.S3_REGION as string,
      ...(env.S3_ENDPOINT !== undefined ? { endpoint: env.S3_ENDPOINT } : {}),
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      ...(env.S3_ACCESS_KEY_ID !== undefined && env.S3_SECRET_ACCESS_KEY !== undefined
        ? { credentials: { accessKeyId: env.S3_ACCESS_KEY_ID, secretAccessKey: env.S3_SECRET_ACCESS_KEY } }
        : {}),
    });
  }
  return new LocalStorageDriver(path.resolve(process.cwd(), env.STORAGE_LOCAL_DIR));
}

const globalForStorage = globalThis as unknown as { __bookieStorage?: StorageDriver };

/** Process-wide driver configured from the validated environment. */
export function getStorage(): StorageDriver {
  globalForStorage.__bookieStorage ??= createStorageDriver(getEnv());
  return globalForStorage.__bookieStorage;
}

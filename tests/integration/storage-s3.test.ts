import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { S3StorageDriver } from "@/server/storage";
import { startFakeS3, type FakeS3 } from "../helpers/fake-s3";
import { storageContract } from "../helpers/storage-contract";

let fake: FakeS3;
beforeAll(async () => {
  fake = await startFakeS3();
});
afterAll(async () => {
  await fake.close();
});

const creds = { accessKeyId: "test-access-key", secretAccessKey: "test-secret-key" };
const fakeDriver = (): S3StorageDriver =>
  new S3StorageDriver({ bucket: fake.bucket, region: "us-east-1", endpoint: fake.endpoint, forcePathStyle: true, credentials: creds });

storageContract("s3 against in-process fake", async () => fakeDriver());

describe("S3StorageDriver specifics (fake endpoint)", () => {
  it("presigned GET is short-lived, carries a download filename, and is not persisted anywhere", async () => {
    const url = new URL(await fakeDriver().presignGet("books/x/y.pdf", { ttlSeconds: 3600, filename: 'My "Book".pdf' }));
    expect(Number(url.searchParams.get("X-Amz-Expires"))).toBeLessThanOrEqual(60);
    expect(url.searchParams.get("X-Amz-Signature")).toBeTruthy();
    expect(url.searchParams.get("response-content-disposition")).toContain("attachment");
    expect(url.searchParams.get("response-content-disposition")).not.toContain('"Book"');
    expect(url.pathname).toBe(`/${fake.bucket}/books/x/y.pdf`);
  });

  it("clamps absurd TTLs to at least 1 second", async () => {
    const url = new URL(await fakeDriver().presignGet("books/x/y.pdf", { ttlSeconds: -5 }));
    expect(Number(url.searchParams.get("X-Amz-Expires"))).toBe(1);
  });

  it("upload target is a presigned PUT with a bounded TTL", async () => {
    const target = await fakeDriver().createUploadTarget("books/x/z.pdf", { maxBytes: 1000, contentType: "application/pdf", ttlSeconds: 99999 });
    const url = new URL(target.url);
    expect(Number(url.searchParams.get("X-Amz-Expires"))).toBeLessThanOrEqual(900);
    expect(target.headers["Content-Type"]).toBe("application/pdf");
  });

  it("refuses unsafe keys before signing", async () => {
    await expect(fakeDriver().presignGet("../x", { ttlSeconds: 10 })).rejects.toThrow();
    await expect(fakeDriver().createUploadTarget("../x", { maxBytes: 1, contentType: "application/pdf" })).rejects.toThrow();
  });
});

// Real S3-compatible endpoint (MinIO, R2, AWS): opt-in because CI/dev machines may have no network or Docker.
const realEndpoint = process.env.S3_TEST_ENDPOINT;
const realBucket = process.env.S3_TEST_BUCKET;
describe.skipIf(!realEndpoint || !realBucket)("S3StorageDriver against S3_TEST_ENDPOINT", () => {
  const prefix = `contract-${randomUUID()}`;
  storageContract(
    "s3 real endpoint",
    async () =>
      new S3StorageDriver({
        bucket: realBucket ?? "",
        region: process.env.S3_TEST_REGION ?? "us-east-1",
        endpoint: realEndpoint,
        forcePathStyle: process.env.S3_TEST_FORCE_PATH_STYLE !== "false",
        ...(process.env.S3_TEST_ACCESS_KEY_ID && process.env.S3_TEST_SECRET_ACCESS_KEY
          ? { credentials: { accessKeyId: process.env.S3_TEST_ACCESS_KEY_ID, secretAccessKey: process.env.S3_TEST_SECRET_ACCESS_KEY } }
          : {}),
      }),
    (key) => `${prefix}/${key}`,
  );
  it("is configured", () => {
    expect(realEndpoint).toBeTruthy();
  });
});

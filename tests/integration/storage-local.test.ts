import { mkdtemp, readdir, rm, symlink, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LocalStorageDriver, StorageLimitError, StorageNotFoundError } from "@/server/storage";
import { storageContract } from "../helpers/storage-contract";

const dirs: string[] = [];
const fresh = async (): Promise<string> => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "bookie-storage-"));
  dirs.push(dir);
  return dir;
};
afterAll(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
});

storageContract("local filesystem", async () => new LocalStorageDriver(await fresh()));

describe("LocalStorageDriver specifics", () => {
  let root: string;
  let outside: string;
  beforeAll(async () => {
    root = await fresh();
    outside = await fresh();
  });

  it("writes only inside the root and leaves no temp files after success or failure", async () => {
    const driver = new LocalStorageDriver(root);
    await driver.put("books/a/b.bin", Buffer.from("hello"));
    await expect(driver.put("books/a/c.bin", Buffer.alloc(100), { maxBytes: 10 })).rejects.toBeInstanceOf(StorageLimitError);
    const tmp = await readdir(path.join(root, ".tmp"));
    expect(tmp).toEqual([]);
    expect((await readdir(path.join(root, "books", "a"))).sort()).toEqual(["b.bin"]);
  });

  it("does not follow symlinks out of the root", async () => {
    await writeFile(path.join(outside, "secret.txt"), "top secret");
    await mkdir(path.join(root, "links"), { recursive: true });
    await symlink(path.join(outside, "secret.txt"), path.join(root, "links", "leak.txt"));
    const driver = new LocalStorageDriver(root);
    expect(await driver.stat("links/leak.txt")).toBeNull();
    await expect(driver.get("links/leak.txt")).rejects.toBeInstanceOf(StorageNotFoundError);
  });

  it("a directory is not an object", async () => {
    const driver = new LocalStorageDriver(root);
    await driver.put("dir/file.bin", Buffer.from("x"));
    expect(await driver.stat("dir")).toBeNull();
  });
});

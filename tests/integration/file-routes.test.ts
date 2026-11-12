import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { DbHandle } from "@/server/db/client";
import { assets, books, downloadEvents, licenses } from "@/server/db/schema";
import { MemoryRateLimiter } from "@/server/auth/rate-limit";
import { createBookFileRepository } from "@/server/repositories/book-files";
import { getReaderAccess } from "@/server/services/files/reader-access";
import { serveBookFile, type FileServiceDeps } from "@/server/services/files/serve";
import { LocalStorageDriver, StorageError, type StorageDriver } from "@/server/storage";
import { insertApprovedLicense, insertAsset, insertBook, insertLicense } from "../helpers/factories";
import { createTestDb } from "../helpers/db";

type RouteContext = { params: Promise<{ slug: string }> };
type FileRoute = { GET: (r: Request, c: RouteContext) => Promise<Response>; HEAD: (r: Request, c: RouteContext) => Promise<Response> };

const FIXTURES = path.join(process.cwd(), "tests", "fixtures", "generated");
const g = globalThis as unknown as { __bookieDb?: Promise<DbHandle>; __bookieStorage?: StorageDriver };

let handle: DbHandle;
let storage: StorageDriver;
let storageDir: string;
let fileRoute: FileRoute;
let downloadRoute: FileRoute;
let bytes: Buffer;

type Seeded = { slug: string; bookId: string; assetId: string };

/** One published book backed by a real fixture PDF in storage; `rights` decides what the policy allows. */
async function seed(opts: {
  rights: "download" | "read-only" | "restricted" | "pending" | "removed";
  originalFilename?: string | null;
  putObject?: boolean;
  sourceUrl?: string;
}): Promise<Seeded> {
  const { db } = handle;
  const book = await insertBook(db, { title: "Fixture Title" });
  if (opts.rights === "download") await insertApprovedLicense(db, book.id, { allowRead: true, allowDownload: true, ...(opts.sourceUrl ? { sourceUrl: opts.sourceUrl } : {}) });
  if (opts.rights === "read-only") await insertApprovedLicense(db, book.id, { allowRead: true, allowDownload: false });
  if (opts.rights === "restricted") await insertApprovedLicense(db, book.id, { rightsStatus: "restricted", allowRead: true, allowDownload: false, restrictedReason: "read only" });
  if (opts.rights === "pending") await insertLicense(db, book.id, {});
  const asset = await insertAsset(db, book.id, {
    originalFilename: opts.originalFilename === undefined ? "Restricted Sample.pdf" : opts.originalFilename,
    byteSize: bytes.length,
    sha256: null,
  });
  if (opts.putObject !== false) await storage.put(asset.storageKey, bytes, { contentType: "application/pdf" });
  if (opts.rights !== "pending" && opts.rights !== "removed") {
    await db.update(books).set({ status: "published", primaryAssetId: asset.id }).where(eq(books.id, book.id));
  } else {
    await db.update(books).set({ primaryAssetId: asset.id }).where(eq(books.id, book.id));
  }
  if (opts.rights === "removed") {
    await insertApprovedLicense(db, book.id, {});
    await db.update(books).set({ status: "published" }).where(eq(books.id, book.id));
    await db.transaction(async (tx) => {
      await tx.update(books).set({ status: "archived" }).where(eq(books.id, book.id));
      await tx.update(licenses).set({ rightsStatus: "removed", allowRead: false, allowDownload: false, removedAt: new Date() }).where(eq(licenses.bookId, book.id));
    });
  }
  return { slug: book.slug, bookId: book.id, assetId: asset.id };
}

const ctx = (slug: string): RouteContext => ({ params: Promise.resolve({ slug }) });
const req = (url: string, headers: Record<string, string> = {}, method = "GET"): Request =>
  new Request(`http://localhost:3000${url}`, { method, headers });
const events = async (bookId: string) => handle.db.select().from(downloadEvents).where(eq(downloadEvents.bookId, bookId));
const served = async (bookId: string) => (await events(bookId)).filter((e) => e.outcome === "served").length;

beforeAll(async () => {
  handle = await createTestDb();
  storageDir = await mkdtemp(path.join(os.tmpdir(), "bookie-files-"));
  storage = new LocalStorageDriver(storageDir);
  g.__bookieDb = Promise.resolve(handle);
  g.__bookieStorage = storage;
  bytes = await readFile(path.join(FIXTURES, "restricted.pdf"));
  fileRoute = (await import("@/app/api/books/[slug]/file/route")) as FileRoute;
  downloadRoute = (await import("@/app/api/books/[slug]/download/route")) as FileRoute;
});

afterAll(async () => {
  delete g.__bookieDb;
  delete g.__bookieStorage;
  await handle.close();
  await rm(storageDir, { recursive: true, force: true });
});

describe("inline file route (canRead)", () => {
  it("streams the whole PDF with the right headers and no signed URL", async () => {
    const book = await seed({ rights: "restricted" });
    const res = await fileRoute.GET(req(`/api/books/${book.slug}/file`), ctx(book.slug));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("content-length")).toBe(String(bytes.length));
    expect(res.headers.get("cache-control")).toBe("private, max-age=0, must-revalidate, no-transform");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-disposition")).toBe(`inline; filename="Restricted Sample.pdf"; filename*=UTF-8''Restricted%20Sample.pdf`);
    expect(res.headers.get("etag")).toMatch(/^"[^"]+"$/);
    expect(res.headers.get("location")).toBeNull();
    expect(Buffer.from(await res.arrayBuffer()).equals(bytes)).toBe(true);
    expect(await events(book.bookId)).toHaveLength(0); // reading is not a download
  });

  it("serves a single range as 206 with Content-Range", async () => {
    const book = await seed({ rights: "read-only" });
    const res = await fileRoute.GET(req(`/api/books/${book.slug}/file`, { range: "bytes=10-109" }), ctx(book.slug));
    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe(`bytes 10-109/${bytes.length}`);
    expect(res.headers.get("content-length")).toBe("100");
    expect(Buffer.from(await res.arrayBuffer()).equals(bytes.subarray(10, 110))).toBe(true);
  });

  it("serves suffix and open-ended ranges", async () => {
    const book = await seed({ rights: "read-only" });
    const suffix = await fileRoute.GET(req(`/api/books/${book.slug}/file`, { range: "bytes=-20" }), ctx(book.slug));
    expect(suffix.status).toBe(206);
    expect(Buffer.from(await suffix.arrayBuffer()).equals(bytes.subarray(bytes.length - 20))).toBe(true);
    const open = await fileRoute.GET(req(`/api/books/${book.slug}/file`, { range: `bytes=${bytes.length - 5}-` }), ctx(book.slug));
    expect(open.headers.get("content-range")).toBe(`bytes ${bytes.length - 5}-${bytes.length - 1}/${bytes.length}`);
    expect(Buffer.from(await open.arrayBuffer()).equals(bytes.subarray(bytes.length - 5))).toBe(true);
  });

  it("answers an unsatisfiable range with 416 and Content-Range bytes */size", async () => {
    const book = await seed({ rights: "read-only" });
    const res = await fileRoute.GET(req(`/api/books/${book.slug}/file`, { range: `bytes=${bytes.length}-` }), ctx(book.slug));
    expect(res.status).toBe(416);
    expect(res.headers.get("content-range")).toBe(`bytes */${bytes.length}`);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("range_not_satisfiable");
  });

  it("ignores multi-range requests and mismatching If-Range with a full 200", async () => {
    const book = await seed({ rights: "read-only" });
    const multi = await fileRoute.GET(req(`/api/books/${book.slug}/file`, { range: "bytes=0-1,5-9" }), ctx(book.slug));
    expect(multi.status).toBe(200);
    expect((await multi.arrayBuffer()).byteLength).toBe(bytes.length);
    const stale = await fileRoute.GET(req(`/api/books/${book.slug}/file`, { range: "bytes=0-9", "if-range": '"stale"' }), ctx(book.slug));
    expect(stale.status).toBe(200);
    await stale.arrayBuffer();
  });

  it("honours If-Range with the current ETag and If-None-Match with 304", async () => {
    const book = await seed({ rights: "read-only" });
    const first = await fileRoute.GET(req(`/api/books/${book.slug}/file`, { range: "bytes=0-0" }), ctx(book.slug));
    const etag = first.headers.get("etag") ?? "";
    await first.arrayBuffer();
    const ranged = await fileRoute.GET(req(`/api/books/${book.slug}/file`, { range: "bytes=0-9", "if-range": etag }), ctx(book.slug));
    expect(ranged.status).toBe(206);
    await ranged.arrayBuffer();
    const conditional = await fileRoute.GET(req(`/api/books/${book.slug}/file`, { "if-none-match": etag }), ctx(book.slug));
    expect(conditional.status).toBe(304);
    expect(await conditional.text()).toBe("");
  });

  it("HEAD returns headers without a body", async () => {
    const book = await seed({ rights: "read-only" });
    const res = await fileRoute.HEAD(req(`/api/books/${book.slug}/file`, {}, "HEAD"), ctx(book.slug));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-length")).toBe(String(bytes.length));
    expect(await res.text()).toBe("");
  });

  it("falls back to the title for the filename when no original name is stored", async () => {
    const book = await seed({ rights: "read-only", originalFilename: null });
    const res = await fileRoute.GET(req(`/api/books/${book.slug}/file`, { range: "bytes=0-0" }), ctx(book.slug));
    expect(res.headers.get("content-disposition")).toContain('filename="Fixture Title.pdf"');
    await res.arrayBuffer();
  });

  it("denies reading for pending (404), removed (410), read-not-allowed (403) and unknown books (404)", async () => {
    const pending = await seed({ rights: "pending" });
    expect((await fileRoute.GET(req(`/x`), ctx(pending.slug))).status).toBe(404);
    const removed = await seed({ rights: "removed" });
    const gone = await fileRoute.GET(req(`/x`), ctx(removed.slug));
    expect(gone.status).toBe(410);
    expect(((await gone.json()) as { error: { code: string } }).error.code).toBe("gone");
    const noRead = await seed({ rights: "read-only" });
    await handle.db.update(licenses).set({ allowRead: false }).where(eq(licenses.bookId, noRead.bookId));
    expect((await fileRoute.GET(req(`/x`), ctx(noRead.slug))).status).toBe(403);
    expect((await fileRoute.GET(req(`/x`), ctx("no-such-book"))).status).toBe(404);
  });

  it("returns a typed 404 when the stored object is missing, without leaking the key", async () => {
    const book = await seed({ rights: "read-only", putObject: false });
    const res = await fileRoute.GET(req(`/x`), ctx(book.slug));
    expect(res.status).toBe(404);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ error: { code: "asset_missing", message: "The file for this title is unavailable." } });
    expect(text).not.toContain("books/");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("returns a typed 502 on storage failure without leaking details", async () => {
    const book = await seed({ rights: "read-only" });
    const broken: StorageDriver = {
      name: "local",
      put: () => Promise.reject(new StorageError("nope")),
      stat: () => Promise.reject(new StorageError("secret path /var/data/x")),
      get: () => Promise.reject(new StorageError("secret path /var/data/x")),
      delete: () => Promise.resolve(),
    };
    g.__bookieStorage = broken;
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const res = await fileRoute.GET(req(`/x`), ctx(book.slug));
      expect(res.status).toBe(502);
      const text = await res.text();
      expect(text).toContain("storage_error");
      expect(text).not.toContain("/var/data");
      expect(spy.mock.calls.flat().join(" ")).not.toContain("/var/data");
    } finally {
      spy.mockRestore();
      g.__bookieStorage = storage;
    }
  });
});

describe("download route (canDownload)", () => {
  it("restricted books get 403 on download (and a denied_policy event) but can still be read", async () => {
    const book = await seed({ rights: "restricted" });
    const res = await downloadRoute.GET(req(`/api/books/${book.slug}/download`), ctx(book.slug));
    expect(res.status).toBe(403);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("forbidden");
    expect((await events(book.bookId)).map((e) => e.outcome)).toEqual(["denied_policy"]);
    const read = await fileRoute.GET(req(`/x`, { range: "bytes=0-0" }), ctx(book.slug));
    expect(read.status).toBe(206);
    await read.arrayBuffer();
  });

  it("a read-only approved book (allow_download=false) is refused", async () => {
    const book = await seed({ rights: "read-only" });
    expect((await downloadRoute.GET(req(`/x`), ctx(book.slug))).status).toBe(403);
    expect(await served(book.bookId)).toBe(0);
  });

  it("streams an attachment with the original filename and records exactly one event per request", async () => {
    const book = await seed({ rights: "download", originalFilename: "Réseau & Sécurité.pdf" });
    const first = await downloadRoute.GET(req(`/api/books/${book.slug}/download`, { "user-agent": "Mozilla/5.0 Firefox/130.0", referer: "https://example.org/page?q=1" }), ctx(book.slug));
    expect(first.status).toBe(200);
    expect(first.headers.get("content-disposition")).toBe(
      "attachment; filename=\"Reseau & Securite.pdf\"; filename*=UTF-8''R%C3%A9seau%20%26%20S%C3%A9curit%C3%A9.pdf",
    );
    expect(Buffer.from(await first.arrayBuffer()).equals(bytes)).toBe(true);
    expect(await served(book.bookId)).toBe(1);

    const second = await downloadRoute.GET(req(`/x`), ctx(book.slug));
    await second.arrayBuffer();
    expect(await served(book.bookId)).toBe(2);

    const [event] = await events(book.bookId);
    expect(event?.assetId).toBe(book.assetId);
    expect(event?.uaFamily).toBe("firefox");
    expect(event?.referrerHost).toBe("example.org");
    expect(event?.ipHash).toBeNull(); // no trusted proxy: never a raw IP
  });

  it("does not count HEAD, resumed ranges or failed requests", async () => {
    const book = await seed({ rights: "download" });
    const head = await downloadRoute.HEAD(req(`/x`, {}, "HEAD"), ctx(book.slug));
    expect(head.status).toBe(200);
    const resumed = await downloadRoute.GET(req(`/x`, { range: "bytes=50-" }), ctx(book.slug));
    expect(resumed.status).toBe(206);
    await resumed.arrayBuffer();
    const bad = await downloadRoute.GET(req(`/x`, { range: `bytes=${bytes.length + 5}-` }), ctx(book.slug));
    expect(bad.status).toBe(416);
    expect(await served(book.bookId)).toBe(0);
    const fromStart = await downloadRoute.GET(req(`/x`, { range: "bytes=0-9" }), ctx(book.slug));
    await fromStart.arrayBuffer();
    expect(await served(book.bookId)).toBe(1);
  });

  it("missing object: 404 asset_missing and no served event", async () => {
    const book = await seed({ rights: "download", putObject: false });
    const res = await downloadRoute.GET(req(`/x`), ctx(book.slug));
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("asset_missing");
    expect(await served(book.bookId)).toBe(0);
  });

  it("hidden and unknown books are 404 and removed books 410", async () => {
    const pending = await seed({ rights: "pending" });
    expect((await downloadRoute.GET(req(`/x`), ctx(pending.slug))).status).toBe(404);
    const removed = await seed({ rights: "removed" });
    expect((await downloadRoute.GET(req(`/x`), ctx(removed.slug))).status).toBe(410);
    expect((await downloadRoute.GET(req(`/x`), ctx("unknown-book"))).status).toBe(404);
  });
});

describe("service level", () => {
  const deps = (over: Partial<FileServiceDeps> = {}): FileServiceDeps => ({
    repository: createBookFileRepository(handle.db),
    storage,
    rateLimiter: new MemoryRateLimiter(),
    now: () => new Date(),
    viewer: { kind: "public" },
    trustProxy: true,
    ipHashSalt: "test-salt-test-salt",
    ...over,
  });

  it("rate limits downloads per hashed client and records denied_rate_limit", async () => {
    const book = await seed({ rights: "download" });
    const limited = deps({ downloadRule: { limit: 2, windowSeconds: 600 } });
    const headers = new Headers({ "x-forwarded-for": "203.0.113.9" });
    const call = () => serveBookFile({ slug: book.slug, mode: "download", method: "GET", headers }, limited);
    for (const _ of [1, 2]) {
      const ok = await call();
      expect(ok.ok).toBe(true);
      if (ok.ok) await new Response(ok.body).arrayBuffer();
    }
    const blocked = await call();
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.error.status).toBe(429);
      expect(blocked.error.retryAfterSeconds).toBeGreaterThan(0);
    }
    const rows = await events(book.bookId);
    expect(rows.filter((e) => e.outcome === "served")).toHaveLength(2);
    expect(rows.filter((e) => e.outcome === "denied_rate_limit")).toHaveLength(1);
    expect(rows.every((e) => e.ipHash !== null && !e.ipHash.includes("203.0.113.9"))).toBe(true);
  });

  it("an admin viewer may read an unpublished book but still cannot download a restricted one", async () => {
    const { db } = handle;
    const book = await insertBook(db);
    await insertApprovedLicense(db, book.id, { rightsStatus: "restricted", allowRead: true, restrictedReason: "r" });
    const asset = await insertAsset(db, book.id, { byteSize: bytes.length });
    await storage.put(asset.storageKey, bytes);
    await db.update(books).set({ primaryAssetId: asset.id }).where(eq(books.id, book.id));
    await db.update(assets).set({ status: "ready" }).where(eq(assets.id, asset.id));
    const admin = deps({ viewer: { kind: "admin", role: "editor" } });
    const read = await serveBookFile({ slug: book.slug, mode: "inline", method: "GET", headers: new Headers() }, admin);
    expect(read.ok).toBe(true);
    if (read.ok) await new Response(read.body).arrayBuffer();
    const dl = await serveBookFile({ slug: book.slug, mode: "download", method: "GET", headers: new Headers() }, admin);
    expect(dl.ok).toBe(false);
    const publicRead = await serveBookFile({ slug: book.slug, mode: "inline", method: "GET", headers: new Headers() }, deps());
    expect(publicRead.ok).toBe(false);
  });

  it("reader access reports same-origin URLs, a download link only when allowed, and the external source", async () => {
    const downloadable = await seed({ rights: "download", sourceUrl: "https://example.org/original" });
    const readOnly = await seed({ rights: "restricted" });
    const readerDeps = { repository: createBookFileRepository(handle.db), viewer: { kind: "public" } as const, now: () => new Date() };
    const a = await getReaderAccess(downloadable.slug, readerDeps);
    expect(a.ok && a.access).toMatchObject({
      fileUrl: `/api/books/${downloadable.slug}/file`,
      downloadUrl: `/api/books/${downloadable.slug}/download`,
      externalSourceUrl: "https://example.org/original",
    });
    const b = await getReaderAccess(readOnly.slug, readerDeps);
    expect(b.ok && b.access.downloadUrl).toBeNull();
    const hidden = await seed({ rights: "pending" });
    const c = await getReaderAccess(hidden.slug, readerDeps);
    expect(!c.ok && c.error.status).toBe(404);
  });
});

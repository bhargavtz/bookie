import "server-only";
import { getEnv } from "@/lib/env";
import type { Viewer } from "@/lib/policy";
import { DbRateLimiter } from "@/server/auth/rate-limit";
import { getDb } from "@/server/db";
import { createBookFileRepository } from "@/server/repositories/book-files";
import { getStorage } from "@/server/storage";
import { getReaderAccess, type ReaderAccessOutcome } from "./reader-access";
import { serveBookFile, type FileOutcome, type FileRequest } from "./serve";

export type { ReaderAccess, ReaderAccessOutcome } from "./reader-access";
export type { FileMode, FileOutcome, FileRequest } from "./serve";

// Admin sessions arrive with S5a; until then every file request is a public viewer.
const publicViewer: Viewer = { kind: "public" };

export async function serveFile(request: FileRequest): Promise<FileOutcome> {
  const env = getEnv();
  const db = await getDb();
  return serveBookFile(request, {
    repository: createBookFileRepository(db),
    storage: getStorage(),
    rateLimiter: new DbRateLimiter(db),
    now: () => new Date(),
    viewer: publicViewer,
    trustProxy: env.TRUST_PROXY,
    ipHashSalt: env.IP_HASH_SALT ?? "bookie-dev-only-salt",
  });
}

export async function readerAccess(slug: string): Promise<ReaderAccessOutcome> {
  const db = await getDb();
  return getReaderAccess(slug, { repository: createBookFileRepository(db), viewer: publicViewer, now: () => new Date() });
}

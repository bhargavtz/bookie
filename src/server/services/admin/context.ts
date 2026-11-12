import type { Db } from "@/server/db/client";
import type { StorageDriver } from "@/server/storage/types";
import { guarded } from "./errors";

/** Everything a service needs, injected so tests can run on an in-memory database and a temp storage directory. */
export type AdminContext = {
  db: Db;
  storage: StorageDriver;
  now: () => Date;
  maxUploadBytes: number;
};

/** One transaction; database guard errors are mapped to AdminError. */
export function inTransaction<T>(ctx: AdminContext, work: (tx: Db) => Promise<T>): Promise<T> {
  return guarded(() => ctx.db.transaction(async (tx) => work(tx as unknown as Db)));
}

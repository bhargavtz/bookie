import fs from "node:fs";
import path from "node:path";
import { loadEnv } from "@/lib/env";
import { createDb } from "@/server/db/client";
import { adminUsers } from "@/server/db/schema";
import { LocalStorageDriver } from "@/server/storage/local";
import { createBook } from "@/server/services/admin/books";
import { uploadPdf } from "@/server/services/admin/assets";
import { setLicense } from "@/server/services/admin/licenses";
import { approvePublication } from "@/server/services/admin/books";
import type { AdminContext } from "@/server/services/admin/context";
import type { AdminPrincipal } from "@/server/auth/session";

async function main(): Promise<void> {
  const env = loadEnv(process.env);
  const root = process.cwd();
  const dbHandle =
    env.DATABASE_URL !== undefined
      ? await createDb({ kind: "pg", connectionString: env.DATABASE_URL, poolMax: 2 })
      : await createDb({ kind: "pglite", dataDir: path.resolve(root, env.PGLITE_DATA_DIR) });
  const storage = new LocalStorageDriver(path.resolve(root, env.STORAGE_LOCAL_DIR));
  const now = () => new Date();
  const ctx: AdminContext = { db: dbHandle.db, storage, now, maxUploadBytes: env.MAX_UPLOAD_BYTES };
  try {
    const [admin] = await dbHandle.db.insert(adminUsers).values({ email: "seed@bookie.local", passwordHash: "scrypt$1$1$1$c2FsdA$aGFzaA", role: "owner" }).returning();
    if (!admin) throw new Error("admin insert failed");
    const principal: AdminPrincipal = { userId: admin.id, email: admin.email, role: "owner", sessionId: "00000000-0000-4000-8000-000000000000" };

    const pdfPath = path.resolve(root, "scripts", "seed-assets", "thinkpython2.pdf");
    if (!fs.existsSync(pdfPath)) {
      // fall back to /tmp download
      const tmp = "/tmp/thinkpython2.pdf";
      if (!fs.existsSync(tmp)) throw new Error("PDF not found; download Think Python first");
      fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
      fs.copyFileSync(tmp, pdfPath);
    }
    const bytes = new Uint8Array(fs.readFileSync(pdfPath));

    const detail = await createBook(ctx, principal, {
      title: "Think Python",
      subtitle: "How to Think Like a Computer Scientist",
      description: "An introduction to Python programming for beginners, by Allen B. Downey. Licensed under Creative Commons Attribution-NonCommercial 3.0 Unported.",
      language: "en",
      authors: ["Allen B. Downey"],
      categories: ["programming-languages"],
      technologies: [],
      tags: ["python", "beginner"],
      publishedYear: 2015,
      pageCount: 286,
      level: "beginner",
    });

    await uploadPdf(ctx, principal, detail.book.id, { bytes, filename: "thinkpython2.pdf" });

    await setLicense(ctx, principal, detail.book.id, {
      rightsStatus: "approved",
      licenseType: "cc-by-nc",
      licenseUrl: "https://creativecommons.org/licenses/by-nc/3.0/",
      rightsHolder: "Allen B. Downey",
      attributionText: "Think Python, 2nd Edition, by Allen B. Downey. Licensed CC BY-NC 3.0.",
      sourceUrl: "https://greenteapress.com/thinkpython2/",
      evidenceNote: "Freely distributed by the author at greenteapress.com; CC BY-NC 3.0.",
      allowRead: true,
      allowDownload: true,
    });

    await approvePublication(ctx, principal, detail.book.id);
    console.log("seeded:", detail.book.slug);
  } finally {
    await dbHandle.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
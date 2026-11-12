import fs from "node:fs";
import path from "node:path";
import { loadEnv } from "@/lib/env";
import { createDb } from "@/server/db/client";
import { adminUsers, books } from "@/server/db/schema";
import { eq } from "drizzle-orm";
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
    const existing = await dbHandle.db.select().from(adminUsers).limit(1);
    let admin = existing[0];
    if (!admin) {
      const [inserted] = await dbHandle.db.insert(adminUsers).values({ email: "seed2@bookie.local", passwordHash: "scrypt$1$1$1$c2FsdA$aGFzaA", role: "owner" }).returning();
      admin = inserted;
    }
    if (!admin) throw new Error("admin insert failed");
    const principal: AdminPrincipal = { userId: admin.id, email: admin.email, role: "owner", sessionId: "00000000-0000-4000-8000-000000000000" };

    const pdfPath = path.resolve(root, "scripts", "seed-assets", "tlcl.pdf");
    if (!fs.existsSync(pdfPath)) {
      fs.mkdirSync(path.dirname(pdfPath), { recursive: true });
      fs.copyFileSync("/tmp/tlcl.pdf", pdfPath);
    }
    const bytes = new Uint8Array(fs.readFileSync(pdfPath));

    const existingBooks = await dbHandle.db.select().from(books).where(eq(books.title, "The Linux Command Line"));
    let bookId: string;
    if (existingBooks.length > 0 && existingBooks[0]) {
      bookId = existingBooks[0].id;
      console.log("reusing existing book", bookId);
    } else {
      const detail = await createBook(ctx, principal, {
        title: "The Linux Command Line",
        subtitle: "A Complete Introduction",
        description: "A comprehensive guide to using the Linux command line, by William Shotts. Licensed under Creative Commons Attribution-NonCommercial-NoDerivs 3.0.",
        language: "en",
        authors: ["William Shotts"],
        categories: ["operating-systems"],
        technologies: [],
        tags: ["linux", "command-line", "shell"],
        publishedYear: 2019,
        pageCount: 550,
        level: "beginner",
      });
      bookId = detail.book.id;
      try {
        await uploadPdf(ctx, principal, bookId, { bytes, filename: "tlcl.pdf" });
      } catch (error) {
        console.warn("upload skipped:", error instanceof Error ? error.message : error);
      }
    }

    await setLicense(ctx, principal, bookId, {
      rightsStatus: "approved",
      licenseType: "cc-by-nc",
      licenseUrl: "https://creativecommons.org/licenses/by-nc-nd/3.0/",
      rightsHolder: "William Shotts",
      attributionText: "The Linux Command Line, by William Shotts. Licensed CC BY-NC-ND 3.0.",
      sourceUrl: "https://linuxcommand.org/tlcl.php",
      evidenceNote: "Freely distributed by the author at linuxcommand.org; CC BY-NC-ND 3.0.",
      allowRead: true,
      allowDownload: true,
    });

    await approvePublication(ctx, principal, bookId);
    console.log("seeded:", bookId);
  } finally {
    await dbHandle.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
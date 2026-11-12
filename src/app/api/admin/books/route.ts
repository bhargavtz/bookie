import { adminRoute, json, readJson, readQuery } from "../_lib/handler";
import { createBook, listBooks } from "@/server/services/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = adminRoute("book.read", async ({ request, principal, ctx }) => json(await listBooks(ctx, principal, readQuery(request))));

export const POST = adminRoute("book.write", async ({ request, principal, ctx }) => json(await createBook(ctx, principal, await readJson(request)), 201));

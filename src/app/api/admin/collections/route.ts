import { adminRoute, json, readJson } from "../_lib/handler";
import { taxonomy } from "@/server/services/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = adminRoute("book.read", async ({ principal, ctx }) => json(await taxonomy.listCollections(ctx, principal)));

export const POST = adminRoute("collection.manage", async ({ request, principal, ctx }) => json(await taxonomy.createCollection(ctx, principal, await readJson(request)), 201));

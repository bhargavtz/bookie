import { adminRoute, json, readJson } from "../_lib/handler";
import { runCsvImport } from "@/server/services/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = adminRoute("import.run", async ({ request, principal, ctx }) => json(await runCsvImport(ctx, principal, await readJson(request))));

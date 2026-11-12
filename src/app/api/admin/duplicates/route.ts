import { adminRoute, json } from "../_lib/handler";
import { scanDuplicates } from "@/server/services/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = adminRoute("duplicate.view", async ({ principal, ctx }) => json(await scanDuplicates(ctx, principal)));

import { adminRoute, json, readQuery } from "../_lib/handler";
import { getAuditLog } from "@/server/services/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = adminRoute("audit.read", async ({ request, principal, ctx }) => json(await getAuditLog(ctx, principal, readQuery(request))));

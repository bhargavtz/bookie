import { adminRoute, json, readQuery } from "../_lib/handler";
import { listTakedownRequests } from "@/server/services/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = adminRoute("takedown.manage", async ({ request, principal, ctx }) => json(await listTakedownRequests(ctx, principal, readQuery(request))));

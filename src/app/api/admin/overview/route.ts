import { adminRoute, json } from "../_lib/handler";
import { getOverview } from "@/server/services/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = adminRoute("stats.view", async ({ principal, ctx }) => json(await getOverview(ctx, principal)));

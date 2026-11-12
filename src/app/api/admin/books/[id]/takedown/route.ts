import { adminRoute, json, readJson, idParam } from "../../../_lib/handler";
import { removeBookForTakedown } from "@/server/services/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { id: string };

export const POST = adminRoute<Params>("takedown.manage", async ({ request, params, principal, ctx }) =>
  json(await removeBookForTakedown(ctx, principal, idParam(params.id), await readJson(request))),
);

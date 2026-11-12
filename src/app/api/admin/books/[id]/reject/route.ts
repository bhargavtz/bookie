import { adminRoute, json, readJson, idParam } from "../../../_lib/handler";
import { rejectPublication } from "@/server/services/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { id: string };

export const POST = adminRoute<Params>("publication.approve", async ({ request, params, principal, ctx }) =>
  json(await rejectPublication(ctx, principal, idParam(params.id), await readJson(request))),
);

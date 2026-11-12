import { adminRoute, json, readJson, idParam } from "../../_lib/handler";
import { updateTakedownStatus } from "@/server/services/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { id: string };

export const PATCH = adminRoute<Params>("takedown.manage", async ({ request, params, principal, ctx }) => {
  await updateTakedownStatus(ctx, principal, idParam(params.id), await readJson(request));
  return json({ ok: true });
});

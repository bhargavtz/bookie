import { adminRoute, json, readJson, idParam } from "../../_lib/handler";
import { taxonomy } from "@/server/services/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { id: string };

export const PUT = adminRoute<Params>("collection.manage", async ({ request, params, principal, ctx }) =>
  json(await taxonomy.updateCollection(ctx, principal, idParam(params.id), await readJson(request))),
);

export const DELETE = adminRoute<Params>("collection.manage", async ({ params, principal, ctx }) => {
  await taxonomy.deleteCollection(ctx, principal, idParam(params.id));
  return json({ ok: true });
});

import { adminRoute, json, readJson, idParam } from "../../_lib/handler";
import { taxonomy } from "@/server/services/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { id: string };

export const PUT = adminRoute<Params>("taxonomy.manage", async ({ request, params, principal, ctx }) =>
  json(await taxonomy.updateAuthor(ctx, principal, idParam(params.id), await readJson(request))),
);

export const DELETE = adminRoute<Params>("taxonomy.manage", async ({ params, principal, ctx }) => {
  await taxonomy.deleteAuthor(ctx, principal, idParam(params.id));
  return json({ ok: true });
});

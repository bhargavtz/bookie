import { adminRoute, json, readJson, idParam } from "../../../_lib/handler";
import { setLicense } from "@/server/services/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { id: string };

// License edits are permitted per role inside setLicense (pending drafts vs rights decisions); the guard admits anyone who may edit licences.
export const PUT = adminRoute<Params>("license.edit", async ({ request, params, principal, ctx }) =>
  json(await setLicense(ctx, principal, idParam(params.id), await readJson(request))),
);

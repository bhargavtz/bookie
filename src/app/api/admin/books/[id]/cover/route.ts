import { adminRoute, json, readUpload, idParam } from "../../../_lib/handler";
import { uploadCover } from "@/server/services/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { id: string };

export const POST = adminRoute<Params>("asset.upload", async ({ request, params, principal, ctx }) =>
  json(await uploadCover(ctx, principal, idParam(params.id), await readUpload(request, ctx.maxUploadBytes)), 201),
);

import { adminRoute, json, idParam } from "../../../_lib/handler";
import { approvePublication } from "@/server/services/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { id: string };

export const POST = adminRoute<Params>("publication.approve", async ({ params, principal, ctx }) =>
  json(await approvePublication(ctx, principal, idParam(params.id))),
);

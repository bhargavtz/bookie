import { adminRoute, json, idParam } from "../../../_lib/handler";
import { submitForReview } from "@/server/services/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { id: string };

export const POST = adminRoute<Params>("book.write", async ({ params, principal, ctx }) =>
  json(await submitForReview(ctx, principal, idParam(params.id))),
);

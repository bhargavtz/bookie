import { adminRoute, json, idParam } from "../../../_lib/handler";
import { duplicatesForBook } from "@/server/services/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { id: string };

export const GET = adminRoute<Params>("duplicate.view", async ({ params, principal, ctx }) => json(await duplicatesForBook(ctx, principal, idParam(params.id))));

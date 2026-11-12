import { adminRoute, json, readJson, idParam } from "../../_lib/handler";
import { deleteBook, getBookDetail, updateBook } from "@/server/services/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Params = { id: string };

export const GET = adminRoute<Params>("book.read", async ({ params, principal, ctx }) => json(await getBookDetail(ctx, principal, idParam(params.id))));

export const PUT = adminRoute<Params>("book.write", async ({ request, params, principal, ctx }) =>
  json(await updateBook(ctx, principal, idParam(params.id), await readJson(request))),
);

export const DELETE = adminRoute<Params>("book.delete", async ({ params, principal, ctx }) => {
  await deleteBook(ctx, principal, idParam(params.id));
  return json({ ok: true });
});

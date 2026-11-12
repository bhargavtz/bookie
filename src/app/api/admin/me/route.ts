import { requireAdminSession } from "@/server/auth/guard";
import { getAdminRuntime } from "@/server/services/admin";
import { errorResponse, json } from "../_lib/handler";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  try {
    const runtime = await getAdminRuntime();
    const principal = await requireAdminSession(runtime.auth, runtime.guard, request);
    return json({ user: { email: principal.email, role: principal.role } });
  } catch (error) {
    return errorResponse(error);
  }
}

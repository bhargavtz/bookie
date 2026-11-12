import type { AdminPrincipal } from "@/server/auth/session";
import { overviewStats, type OverviewStats } from "@/server/repositories/admin/stats";
import { listAudit, type AuditRow } from "@/server/repositories/admin/audit";
import { z } from "zod";
import type { AdminContext } from "./context";
import { requirePermission } from "./errors";
import { parseOrThrow } from "./books";

export async function getOverview(ctx: AdminContext, principal: AdminPrincipal): Promise<OverviewStats> {
  requirePermission(principal, "stats.view");
  return overviewStats(ctx.db, ctx.now());
}

const auditQuery = z.object({
  limit: z.number().int().min(1).max(200).default(50),
  offset: z.number().int().min(0).default(0),
  entityType: z.string().max(40).optional(),
  entityId: z.string().max(80).optional(),
});

export async function getAuditLog(ctx: AdminContext, principal: AdminPrincipal, query: unknown): Promise<AuditRow[]> {
  requirePermission(principal, "audit.read");
  return listAudit(ctx.db, parseOrThrow(auditQuery, query));
}

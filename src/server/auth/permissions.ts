/**
 * The single role -> action map (docs/wiki/decision-admin-auth.md).
 *   owner    everything
 *   editor   content and files; can draft licence details but cannot approve rights or publish
 *   reviewer rights approval, publication and takedowns; cannot edit files or content
 * Unknown roles and actions are denied.
 */
import type { AdminRole } from "@/contracts/enums";

export const ADMIN_ACTIONS = [
  "stats.view",
  "book.read",
  "book.write",
  "book.delete",
  "asset.upload",
  "license.edit",
  "license.review",
  "publication.approve",
  "taxonomy.manage",
  "collection.manage",
  "import.run",
  "duplicate.view",
  "takedown.manage",
  "audit.read",
] as const;
export type AdminAction = (typeof ADMIN_ACTIONS)[number];

const EDITOR: readonly AdminAction[] = [
  "stats.view",
  "book.read",
  "book.write",
  "book.delete",
  "asset.upload",
  "license.edit",
  "taxonomy.manage",
  "collection.manage",
  "import.run",
  "duplicate.view",
];

const REVIEWER: readonly AdminAction[] = [
  "stats.view",
  "book.read",
  "license.edit",
  "license.review",
  "publication.approve",
  "duplicate.view",
  "takedown.manage",
  "audit.read",
];

const PERMISSIONS: Record<AdminRole, ReadonlySet<AdminAction>> = {
  owner: new Set(ADMIN_ACTIONS),
  editor: new Set(EDITOR),
  reviewer: new Set(REVIEWER),
};

export function can(role: AdminRole, action: AdminAction): boolean {
  return PERMISSIONS[role]?.has(action) ?? false;
}

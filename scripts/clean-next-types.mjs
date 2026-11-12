// `next typegen` regenerates .next/types but does not delete entries for removed routes, so a stale
// route file can fail `tsc` (observed 2026-11-11). Remove the generated types before regenerating.
import { rmSync } from "node:fs";

rmSync(".next/types", { recursive: true, force: true });

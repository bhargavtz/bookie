import { Badge, type BadgeTone } from "@/components/ui/Badge";
import type { BookStatus, RightsStatus, TakedownStatus } from "@/contracts/enums";

const BOOK_TONE: Record<BookStatus, BadgeTone> = { draft: "neutral", in_review: "warning", published: "success", unpublished: "neutral", archived: "neutral" };
const RIGHTS_TONE: Record<RightsStatus, BadgeTone> = { pending: "warning", approved: "success", restricted: "accent", removed: "danger" };
const TAKEDOWN_TONE: Record<TakedownStatus, BadgeTone> = { open: "danger", under_review: "warning", upheld: "neutral", rejected: "neutral", withdrawn: "neutral" };

export const label = (value: string): string => value.replaceAll("_", " ");

export const BookStatusBadge = ({ status }: { status: BookStatus }) => <Badge tone={BOOK_TONE[status]}>{label(status)}</Badge>;
export const RightsBadge = ({ status }: { status: RightsStatus | null }) =>
  status === null ? <Badge tone="neutral">no licence</Badge> : <Badge tone={RIGHTS_TONE[status]}>{label(status)}</Badge>;
export const TakedownBadge = ({ status }: { status: TakedownStatus }) => <Badge tone={TAKEDOWN_TONE[status]}>{label(status)}</Badge>;

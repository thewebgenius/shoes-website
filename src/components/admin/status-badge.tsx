const STYLES: Record<string, string> = {
  draft: "border-line bg-paper-2 text-ink-2",
  pending_review: "border-warning/30 bg-warning/10 text-warning",
  published: "border-success/30 bg-success/10 text-success",
  rejected: "border-danger/30 bg-danger/10 text-danger",
  unpublished: "border-line bg-white text-muted",
  archived: "border-line bg-white text-muted line-through",
  pending: "border-warning/30 bg-warning/10 text-warning",
  approved: "border-success/30 bg-success/10 text-success",
  spam: "border-danger/30 bg-danger/10 text-danger",
};

export const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  pending_review: "Needs review",
  published: "Published",
  rejected: "Rejected",
  unpublished: "Unpublished",
  archived: "Archived",
  pending: "Pending",
  approved: "Approved",
  spam: "Spam",
};

export function StatusBadge({ status }: { status: string }) {
  return <span className={`chip ${STYLES[status] ?? STYLES.draft}`}>{STATUS_LABEL[status] ?? status}</span>;
}

import { Check } from "lucide-react";

export const TRANSITION_MESSAGES = {
  submit: "Sent for approval. Review the preview, then approve & publish.",
  approve: "Approved and published. The shoe is now live in the showroom.",
  reject: "Rejected. The product is hidden and marked for changes.",
  unpublish: "Unpublished. The shoe is no longer visible to customers.",
  archive: "Archived. The product is hidden everywhere.",
  restore: "Restored to draft.",
  edit: "Moved back to draft for editing.",
} as const;

export type TransitionKind = keyof typeof TRANSITION_MESSAGES;

/** Confirms a status change after the redirect, since the button that made it may no longer be shown. */
export function DoneBanner({ done }: { done?: string | string[] }) {
  const key = typeof done === "string" && done in TRANSITION_MESSAGES ? (done as TransitionKind) : null;
  if (!key) return null;
  return (
    <p role="status" className="mt-4 flex items-center gap-2 rounded-xl bg-success/10 px-4 py-2 text-sm text-success">
      <Check className="size-4 shrink-0" /> {TRANSITION_MESSAGES[key]}
    </p>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { AlertTriangle, Check, Loader2, PlugZap, RotateCcw } from "lucide-react";

/** Admin wording for AI job states. Only "succeeded" from a real AI provider is called "AI processing completed". */
export function jobStatusLabel(status: string, kind: "ai" | "mock" | "algorithm" | "none" | string) {
  switch (status) {
    case "queued":
      return "Queued";
    case "running":
      return "Processing…";
    case "retrying":
      return "Retrying…";
    case "succeeded":
      return kind === "ai" ? "AI processing completed" : "Completed (development mock, not AI)";
    case "needs_review":
      return kind === "ai" ? "AI processing completed · needs review" : "Completed (development mock, not AI) · needs review";
    case "failed":
      return "AI processing failed";
    case "unavailable":
      return "AI provider not configured";
    default:
      return status;
  }
}

export function JobStatusChip({ status, kind }: { status: string; kind: string }) {
  const label = jobStatusLabel(status, kind);
  const tone =
    status === "succeeded" && kind === "ai"
      ? "border-success/30 bg-success/10 text-success"
      : status === "failed"
        ? "border-danger/30 bg-danger/10 text-danger"
        : status === "needs_review" || status === "unavailable" || kind === "mock"
          ? "border-warning/30 bg-warning/10 text-warning"
          : "border-line bg-paper-2 text-ink-2";
  const Icon =
    status === "queued" || status === "running" ? Loader2 : status === "retrying" ? RotateCcw : status === "unavailable" ? PlugZap : status === "succeeded" ? Check : AlertTriangle;
  return (
    <span className={`chip ${tone}`} data-testid="job-status">
      <Icon className={`size-3 ${status === "running" || status === "queued" ? "animate-spin" : ""}`} /> {label}
    </span>
  );
}

/** Refreshes the page while background AI jobs are running so their status stays current. */
export function ProcessingWatcher({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), 2500);
    return () => clearInterval(t);
  }, [active, router]);
  return null;
}

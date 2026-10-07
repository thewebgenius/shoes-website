"use client";

import { useActionState, useState } from "react";
import { assignSampleAction, generateModelAction, reprocessImageAction, transitionAction, type ActionState } from "@/app/admin/actions";

function Feedback({ state }: { state: ActionState }) {
  if (!state) return null;
  if (state.error)
    return (
      <p className="mt-2 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
        {state.error}
      </p>
    );
  if (state.message)
    return (
      <p className="mt-2 rounded-xl bg-success/10 px-3 py-2 text-sm text-success" role="status">
        {state.message}
      </p>
    );
  return null;
}

export function TransitionButton({
  id,
  action,
  label,
  variant = "primary",
  confirm,
  from = "edit",
}: {
  id: string;
  from?: "edit" | "preview";
  action: "submit" | "approve" | "publish" | "unpublish" | "archive" | "restore" | "edit";
  label: string;
  variant?: "primary" | "ghost" | "gold" | "danger";
  confirm?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(transitionAction, null);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="action" value={action} />
      <input type="hidden" name="from" value={from} />
      <button type="submit" className={`btn-${variant}`} disabled={pending}>
        {pending ? "Working…" : label}
      </button>
      <Feedback state={state} />
    </form>
  );
}

export function RejectForm({ id }: { id: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState<ActionState, FormData>(transitionAction, null);
  if (!open)
    return (
      <button type="button" className="btn-ghost" onClick={() => setOpen(true)}>
        Reject
      </button>
    );
  return (
    <form action={formAction} className="w-full space-y-2 rounded-2xl bg-white p-4 ring-1 ring-line">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="action" value="reject" />
      <input type="hidden" name="from" value="preview" />
      <label htmlFor="reason" className="label">
        Reason for rejecting
      </label>
      <textarea id="reason" name="reason" required minLength={3} maxLength={500} className="input min-h-20" placeholder="e.g. Colour name is wrong; photo is blurry" />
      <div className="flex gap-2">
        <button type="submit" className="btn-danger" disabled={pending}>
          {pending ? "Rejecting…" : "Confirm reject"}
        </button>
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      <Feedback state={state} />
    </form>
  );
}

export function SampleModelPicker({
  id,
  samples,
  isRealProduct,
}: {
  id: string;
  samples: Array<{ id: string; label: string; style: string; license: string }>;
  isRealProduct: boolean;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(assignSampleAction, null);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        const msg =
          "This is a generic SAMPLE 3D model for development, not a scan of this shoe." +
          (isRealProduct ? " This looks like a real product: customers would see a different shoe in 3D (labelled “Studio sample 3D model”)." : "") +
          " Attach it anyway?";
        if (!window.confirm(msg)) e.preventDefault();
      }}
    >
      <input type="hidden" name="id" value={id} />
      <label htmlFor="sample" className="label">
        Or assign a sample model (development)
      </label>
      <div className="flex flex-wrap gap-2">
        <select id="sample" name="sample" className="input max-w-xs" defaultValue="">
          <option value="" disabled>
            Choose a sample…
          </option>
          {samples.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label} ({s.style}, {s.license})
            </option>
          ))}
        </select>
        <button type="submit" className="btn-ghost" disabled={pending}>
          {pending ? "Assigning…" : "Assign"}
        </button>
      </div>
      <p className="mt-1 text-xs text-warning">Development only. A sample is a different shoe; customers see it labelled “Studio sample 3D model”, never as this exact shoe.</p>
      <Feedback state={state} />
    </form>
  );
}

export function GenerateModelButton({ id, available, reason }: { id: string; available: boolean; reason?: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(generateModelAction, null);
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="btn-ghost" disabled={pending || !available} title={available ? undefined : reason}>
        {pending ? "Generating…" : "Generate 3D from photos (AI)"}
      </button>
      {!available && <p className="mt-1 text-xs text-muted">Not available yet: {reason}</p>}
      <Feedback state={state} />
    </form>
  );
}

export function ReprocessButton({ id, rawId, label = "Retry processing" }: { id: string; rawId: string; label?: string }) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(reprocessImageAction, null);
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="rawId" value={rawId} />
      <button type="submit" className="text-xs font-medium text-gold hover:underline disabled:opacity-50" disabled={pending}>
        {pending ? "Starting…" : label}
      </button>
      <Feedback state={state} />
    </form>
  );
}

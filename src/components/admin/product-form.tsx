"use client";

import { useActionState, useRef, useState } from "react";
import { AlertTriangle, Sparkles } from "lucide-react";
import { createProductAction, updateProductAction, type ActionState } from "@/app/admin/actions";

type Sug = { value: string | null; confidence: number; reason?: string };

export type Suggestion = {
  shoeType?: Sug;
  color?: Sug;
  secondaryColors?: Sug;
  style?: Sug;
  category?: Sug;
  gender?: Sug;
  description?: Sug;
  brand?: Sug;
  model?: Sug;
  needsVerification?: boolean;
  cutoutIssues?: string[];
  provider?: string;
  providerKind?: string;
  isMock?: boolean;
  at?: string;
};

type Values = {
  id?: string;
  name: string;
  category: string;
  gender: string;
  shoeType: string | null;
  brand: string | null;
  color: string | null;
  secondaryColors?: string | null;
  style?: string | null;
  modelName?: string | null;
  description: string | null;
  metadataVerified: boolean;
};

const THRESHOLD = 0.6;

export function ProductForm({ values, suggestions, mode }: { values?: Values; suggestions?: Suggestion | null; mode: "create" | "edit" }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(mode === "create" ? createProductAction : updateProductAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const fe = state?.fieldErrors ?? {};

  const fieldEl = (field: keyof Values) => formRef.current?.elements.namedItem(field) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
  const unverify = () => {
    const verified = fieldEl("metadataVerified") as HTMLInputElement | null;
    if (verified) verified.checked = false;
  };
  const apply = (field: keyof Values, value: string | null) => {
    const el = fieldEl(field);
    if (!value || !el) return;
    el.value = value;
    unverify();
  };
  /** "Custom value": jump to the field so the shopkeeper types their own. */
  const custom = (field: keyof Values) => {
    const el = fieldEl(field);
    if (!el) return;
    el.focus();
    if ("select" in el) el.select();
    unverify();
  };

  return (
    <form ref={formRef} action={action} className="space-y-4" noValidate>
      {values?.id && <input type="hidden" name="id" value={values.id} />}
      {suggestions && <SuggestionPanel s={suggestions} onApply={apply} onCustom={custom} />}
      <Field label="Name" name="name" error={fe.name}>
        <input id="name" name="name" defaultValue={values?.name} required maxLength={120} className="input" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category (showroom section)" name="category" error={fe.category}>
          <select id="category" name="category" defaultValue={values?.category ?? ""} required className="input">
            <option value="" disabled>
              Choose…
            </option>
            <option value="men">Men</option>
            <option value="women">Women</option>
            <option value="kids">Kids</option>
          </select>
        </Field>
        <Field label="Gender" name="gender" error={fe.gender}>
          <select id="gender" name="gender" defaultValue={values?.gender ?? "unisex"} className="input">
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="unisex">Unisex</option>
          </select>
        </Field>
        <Field label="Shoe type" name="shoeType" error={fe.shoeType}>
          <input id="shoeType" name="shoeType" defaultValue={values?.shoeType ?? ""} maxLength={60} placeholder="e.g. Running sneaker" className="input" />
        </Field>
        <Field label="Colour" name="color" error={fe.color}>
          <input id="color" name="color" defaultValue={values?.color ?? ""} maxLength={60} placeholder="e.g. Black / White" className="input" />
        </Field>
        <Field label="Other colours" name="secondaryColors" error={fe.secondaryColors}>
          <input id="secondaryColors" name="secondaryColors" defaultValue={values?.secondaryColors ?? ""} maxLength={120} placeholder="e.g. Gum, Olive" className="input" />
        </Field>
        <Field label="Style" name="style" error={fe.style}>
          <input id="style" name="style" defaultValue={values?.style ?? ""} maxLength={60} placeholder="e.g. Casual" className="input" />
        </Field>
        <Field label="Brand (optional)" name="brand" error={fe.brand}>
          <input id="brand" name="brand" defaultValue={values?.brand ?? ""} maxLength={60} className="input" />
        </Field>
        <Field label="Model name (optional)" name="modelName" error={fe.modelName}>
          <input id="modelName" name="modelName" defaultValue={values?.modelName ?? ""} maxLength={80} className="input" />
        </Field>
      </div>
      <Field label="Description" name="description" error={fe.description}>
        <textarea id="description" name="description" defaultValue={values?.description ?? ""} maxLength={2000} className="input min-h-28" />
      </Field>
      <label className="flex items-start gap-3 rounded-xl bg-paper p-3 text-sm">
        <input type="checkbox" name="metadataVerified" defaultChecked={values?.metadataVerified} className="mt-0.5 size-4 accent-[var(--gold)]" />
        <span>
          <strong>I have checked these details against the real shoe.</strong>
          <span className="block text-xs text-muted">Required before the product can be submitted for approval. AI suggestions are never published unchecked.</span>
        </span>
      </label>
      {state?.error && (
        <p className="rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger" role="alert">
          {state.error}
        </p>
      )}
      {state?.ok && state.message && (
        <p className="rounded-xl bg-success/10 px-3 py-2 text-sm text-success" role="status">
          {state.message}
        </p>
      )}
      <button type="submit" className="btn-primary" disabled={pending}>
        {pending ? "Saving…" : mode === "create" ? "Create draft & add photo" : "Save details"}
      </button>
    </form>
  );
}

function Field({ label, name, error, children }: { label: string; name: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={name} className="label">
        {label}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}

function SuggestionPanel({
  s,
  onApply,
  onCustom,
}: {
  s: Suggestion;
  onApply: (f: keyof Values, v: string | null) => void;
  onCustom: (f: keyof Values) => void;
}) {
  const [decided, setDecided] = useState<Record<string, "used" | "rejected" | "custom">>({});
  const rows: Array<[keyof Values, string, Sug | undefined]> = [
    ["shoeType", "Shoe type", s.shoeType],
    ["category", "Category", s.category],
    ["gender", "Gender", s.gender],
    ["color", "Colour", s.color],
    ["secondaryColors", "Other colours", s.secondaryColors],
    ["style", "Style", s.style],
    ["brand", "Brand", s.brand],
    ["modelName", "Model", s.model],
    ["description", "Description", s.description],
  ];
  const isAi = s.providerKind === "ai" || (!s.isMock && !s.providerKind);
  return (
    <div className="rounded-2xl border border-gold/30 bg-gold-soft/30 p-4" data-testid="ai-suggestions">
      <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
        <Sparkles className="size-4 text-gold" /> {isAi ? "AI suggestions" : "Suggestions (development mock, not AI)"}
        <span className="font-normal text-muted">· not authoritative, please verify</span>
      </p>
      <p className="mt-1 text-xs text-muted">
        Source: {s.provider ?? "unknown"}
        {s.at ? ` · ${new Date(s.at).toLocaleString("en-GB")}` : ""}
      </p>
      {s.needsVerification && (
        <p className="mt-2 flex gap-1.5 text-xs text-warning">
          <AlertTriangle className="size-3.5 shrink-0" /> Some values are uncertain. Check every field against the real shoe.
        </p>
      )}
      {!!s.cutoutIssues?.length && (
        <p className="mt-2 flex gap-1.5 text-xs text-warning">
          <AlertTriangle className="size-3.5 shrink-0" /> Photo check: {s.cutoutIssues.join("; ")}.
        </p>
      )}
      <ul className="mt-3 divide-y divide-gold/20 text-sm">
        {rows.map(([field, label, sug]) => {
          const confident = !!sug?.value && sug.confidence >= THRESHOLD;
          const state = decided[field];
          return (
            <li key={field} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2" data-field={field}>
              <span className="w-24 shrink-0 text-xs text-muted">{label}</span>
              {state === "rejected" ? (
                <span className="text-xs text-muted line-through">{sug?.value ?? "No suggestion"}</span>
              ) : confident ? (
                <span className="font-medium">{sug!.value}</span>
              ) : (
                <span className="chip border-warning/30 bg-warning/10 text-warning">
                  <AlertTriangle className="size-3" /> {sug?.value ? "Needs verification" : "No confident suggestion"}
                </span>
              )}
              {!confident && sug?.value && state !== "rejected" && <span className="text-xs text-muted">(weak guess: {sug.value})</span>}
              {sug?.value ? <span className="text-xs text-muted tabular-nums">{Math.round(sug.confidence * 100)}% confidence</span> : null}
              <span className="ml-auto flex gap-3 text-xs font-medium">
                {state ? (
                  <span className="text-muted">{state === "used" ? "Used" : state === "rejected" ? "Rejected" : "Custom value"}</span>
                ) : (
                  <>
                    {sug?.value && (
                      <button
                        type="button"
                        onClick={() => {
                          onApply(field, sug.value);
                          setDecided((d) => ({ ...d, [field]: "used" }));
                        }}
                        className="text-gold hover:underline"
                      >
                        Use
                      </button>
                    )}
                    {sug?.value && (
                      <button type="button" onClick={() => setDecided((d) => ({ ...d, [field]: "rejected" }))} className="text-muted hover:underline">
                        Reject
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        onCustom(field);
                        setDecided((d) => ({ ...d, [field]: "custom" }));
                      }}
                      className="text-ink-2 hover:underline"
                    >
                      Custom value
                    </button>
                  </>
                )}
              </span>
              {sug?.reason && state !== "rejected" && <p className="w-full text-[11px] text-muted">{sug.reason}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

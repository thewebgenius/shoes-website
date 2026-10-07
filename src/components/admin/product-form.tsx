"use client";

import { useActionState, useRef } from "react";
import { AlertTriangle, Sparkles } from "lucide-react";
import { createProductAction, updateProductAction, type ActionState } from "@/app/admin/actions";

export type Suggestion = {
  shoeType?: { value: string | null; confidence: number; reason?: string };
  color?: { value: string | null; confidence: number; reason?: string };
  category?: { value: string | null; confidence: number; reason?: string };
  gender?: { value: string | null; confidence: number; reason?: string };
  description?: { value: string | null; confidence: number; reason?: string };
  provider?: string;
  isMock?: boolean;
};

type Values = {
  id?: string;
  name: string;
  category: string;
  gender: string;
  shoeType: string | null;
  brand: string | null;
  color: string | null;
  description: string | null;
  metadataVerified: boolean;
};

const THRESHOLD = 0.6;

export function ProductForm({ values, suggestions, mode }: { values?: Values; suggestions?: Suggestion | null; mode: "create" | "edit" }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(mode === "create" ? createProductAction : updateProductAction, null);
  const formRef = useRef<HTMLFormElement>(null);
  const fe = state?.fieldErrors ?? {};

  const apply = (field: keyof Values, value: string | null) => {
    if (!value || !formRef.current) return;
    const el = formRef.current.elements.namedItem(field) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
    if (el) el.value = value;
    const verified = formRef.current.elements.namedItem("metadataVerified") as HTMLInputElement | null;
    if (verified) verified.checked = false;
  };

  return (
    <form ref={formRef} action={action} className="space-y-4" noValidate>
      {values?.id && <input type="hidden" name="id" value={values.id} />}
      {suggestions && <SuggestionPanel s={suggestions} onApply={apply} />}
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
        <Field label="Brand (optional)" name="brand" error={fe.brand}>
          <input id="brand" name="brand" defaultValue={values?.brand ?? ""} maxLength={60} className="input" />
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
        {pending ? "Saving…" : mode === "create" ? "Create draft & continue" : "Save details"}
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

function SuggestionPanel({ s, onApply }: { s: Suggestion; onApply: (f: keyof Values, v: string | null) => void }) {
  const rows: Array<[keyof Values, string, Suggestion["color"]]> = [
    ["shoeType", "Shoe type", s.shoeType],
    ["color", "Colour", s.color],
    ["category", "Category", s.category],
    ["gender", "Gender", s.gender],
    ["description", "Description", s.description],
  ];
  return (
    <div className="rounded-2xl border border-gold/30 bg-gold-soft/30 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <Sparkles className="size-4 text-gold" /> AI suggestions <span className="font-normal text-muted">· not authoritative, please verify</span>
      </p>
      {s.isMock && <p className="mt-1 text-xs text-muted">Source: {s.provider}. A real vision model is not connected yet, so most fields will need your input.</p>}
      <ul className="mt-3 divide-y divide-gold/20 text-sm">
        {rows.map(([field, label, sug]) => {
          const confident = !!sug?.value && sug.confidence >= THRESHOLD;
          return (
            <li key={field} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className="w-24 shrink-0 text-xs text-muted">{label}</span>
              {confident ? (
                <span className="font-medium">{sug!.value}</span>
              ) : (
                <span className="chip border-warning/30 bg-warning/10 text-warning">
                  <AlertTriangle className="size-3" /> Needs verification
                </span>
              )}
              {!confident && sug?.value && <span className="text-xs text-muted">(weak guess: {sug.value})</span>}
              <span className="text-xs text-muted tabular-nums">{Math.round((sug?.confidence ?? 0) * 100)}% confidence</span>
              {sug?.value && (
                <button type="button" onClick={() => onApply(field, sug.value)} className="ml-auto text-xs font-medium text-gold hover:underline">
                  Use
                </button>
              )}
              {sug?.reason && <p className="w-full text-[11px] text-muted">{sug.reason}</p>}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Box, ImageUp, Loader2 } from "lucide-react";

async function post(url: string, field: string, file: File) {
  const fd = new FormData();
  fd.set(field, file);
  const res = await fetch(url, { method: "POST", body: fd });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

export function RawImageUploader({ productId, maxMb }: { productId: string; maxMb: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err" | "warn"; text: string } | null>(null);

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > maxMb * 1024 * 1024) return setMsg({ kind: "err", text: `File is larger than ${maxMb} MB.` });
    setBusy(true);
    setMsg(null);
    try {
      const { res, data } = await post(`/api/admin/products/${productId}/images`, "image", file);
      if (!res.ok && res.status !== 202 && res.status !== 207) setMsg({ kind: "err", text: data.error ?? "Upload failed." });
      else if (data.duplicate) setMsg({ kind: "warn", text: data.message });
      else if (!data.ok) setMsg({ kind: "warn", text: data.error ?? "Processing could not start; the original photo was kept." });
      else setMsg({ kind: "ok", text: "Photo uploaded. AI processing has started; the status below updates by itself." });
      router.refresh();
    } catch {
      setMsg({ kind: "err", text: "Network error during upload." });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div>
      <button type="button" className="btn-primary" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <ImageUp className="size-4" />}
        {busy ? "Uploading…" : "Upload shoe photo"}
      </button>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        className="sr-only"
        aria-label="Raw shoe photo"
        data-testid="raw-image-input"
        onChange={(e) => upload(e.target.files?.[0])}
      />
      <p className="mt-2 text-xs text-muted">JPEG, PNG, WebP or HEIC, up to {maxMb} MB. The original is kept privately and never changed.</p>
      {msg && (
        <p
          role="status"
          className={`mt-3 rounded-xl px-3 py-2 text-sm ${msg.kind === "ok" ? "bg-success/10 text-success" : msg.kind === "warn" ? "bg-warning/10 text-warning" : "bg-danger/10 text-danger"}`}
        >
          {msg.text}
        </p>
      )}
    </div>
  );
}

export function ModelUploader({ productId, maxMb }: { productId: string; maxMb: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!/\.glb$/i.test(file.name)) return setMsg({ ok: false, text: "Please choose a .glb file." });
    if (file.size > maxMb * 1024 * 1024) return setMsg({ ok: false, text: `Model is larger than ${maxMb} MB.` });
    setBusy(true);
    setMsg(null);
    try {
      const { res, data } = await post(`/api/admin/products/${productId}/models`, "model", file);
      setMsg(res.ok ? { ok: true, text: `Model uploaded (${Number(data.triangles).toLocaleString()} triangles).` } : { ok: false, text: data.error ?? "Upload failed." });
      router.refresh();
    } catch {
      setMsg({ ok: false, text: "Network error during upload." });
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  return (
    <div>
      <button type="button" className="btn-primary" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Box className="size-4" />}
        {busy ? "Validating & uploading…" : "Upload .glb model"}
      </button>
      <input ref={input} type="file" accept=".glb,model/gltf-binary" className="sr-only" aria-label="GLB model file" data-testid="model-input" onChange={(e) => upload(e.target.files?.[0])} />
      <p className="mt-2 text-xs text-muted">Self-contained binary glTF 2.0 (.glb), up to {maxMb} MB.</p>
      {msg && (
        <p role="status" className={`mt-3 rounded-xl px-3 py-2 text-sm ${msg.ok ? "bg-success/10 text-success" : "bg-danger/10 text-danger"}`}>
          {msg.text}
        </p>
      )}
    </div>
  );
}

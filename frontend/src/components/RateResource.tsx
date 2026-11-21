"use client";
import { useState, type FormEvent } from "react";
import { ApiError } from "@/lib/api";
import { acis } from "@/lib/endpoints";
import { cn } from "@/lib/cn";
import { Button, Modal, Notice, Scale, TextAreaField } from "./ui";

type Status = "completed" | "abandoned" | "started";
const OPTIONS: { value: Status; label: string; hint: string }[] = [
  { value: "completed", label: "I finished it", hint: "Tell us how it was" },
  { value: "abandoned", label: "I stopped partway", hint: "No problem. This helps ACIS suggest better" },
  { value: "started", label: "I've just started", hint: "Come back and update it later" },
];

export function RateResource({ resource, onClose, onDone }: { resource: { id: number; title: string } | null; onClose: () => void; onDone: () => void }) {
  const [status, setStatus] = useState<Status>("completed");
  const [rating, setRating] = useState<number | undefined>();
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!resource) return;
    if (status !== "started" && rating === undefined) { setError("Please give it a rating from 1 to 5."); return; }
    setBusy(true); setError(null);
    try {
      await acis.learning.feedback(resource.id, { status, rating: status === "started" ? null : rating, comment: comment.trim() });
      setRating(undefined); setComment(""); setStatus("completed");
      onDone(); onClose();
    } catch (ex) { setError(ex instanceof ApiError ? ex.message : "Could not save your feedback."); }
    finally { setBusy(false); }
  }

  return (
    <Modal open={!!resource} onClose={onClose} title="How was it?">
      <form onSubmit={submit} noValidate className="space-y-4">
        <p className="text-sm font-medium">{resource?.title}</p>
        <fieldset>
          <legend className="sr-only">Your progress</legend>
          <div className="space-y-2">
            {OPTIONS.map((o) => (
              <label key={o.value} className={cn("flex cursor-pointer items-start gap-3 rounded-md border p-3 focus-within:ring-2 focus-within:ring-career", status === o.value ? "border-career bg-career-soft" : "border-line")}>
                <input type="radio" name="status" value={o.value} checked={status === o.value} onChange={() => setStatus(o.value)} className="mt-1 accent-[#26418F]" />
                <span><span className="block text-sm font-semibold">{o.label}</span><span className="text-xs text-ink-faint">{o.hint}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
        {status !== "started" && <Scale name="rating" legend="How useful was it for you?" labels={["Not useful", "Very useful"]} value={rating} onChange={setRating} />}
        <TextAreaField label="Anything to add? (optional)" rows={2} value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} placeholder="Too theoretical, too fast, loved the exercises…" />
        <Notice tone="info">This only changes how ACIS chooses learning resources for you. It does not change which careers fit you.</Notice>
        {error && <Notice tone="error">{error}</Notice>}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" loading={busy}>Save</Button></div>
      </form>
    </Modal>
  );
}

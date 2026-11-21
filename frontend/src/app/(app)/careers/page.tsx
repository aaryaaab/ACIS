"use client";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { ConfidencePips, NeedsAssessment } from "@/components/domain";
import { AsyncPanel, Panel } from "@/components/panels";
import { PortfolioCards } from "@/components/PortfolioCards";
import { Button, ButtonLink, Card, Chip, ErrorState, LoadingBlock, Notice, PageHeader, SelectField, TextAreaField } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { acis } from "@/lib/endpoints";
import { formatDate, humanize } from "@/lib/format";
import type { CareerEntry, EvidenceType } from "@/lib/types";
import { useAsync } from "@/lib/useAsync";

function Explanation({ entry, recId, onChanged }: { entry: CareerEntry; recId: number | null; onChanged: () => void }) {
  const rec = useAsync(() => (recId ? acis.careers.recommendation(recId) : Promise.resolve(null)), [recId]);
  const [sent, setSent] = useState<null | boolean>(null);
  const [err, setErr] = useState<string | null>(null);

  async function vote(helpful: boolean) {
    if (!recId) return;
    setErr(null);
    try { await acis.careers.feedback(recId, { helpful }); setSent(helpful); onChanged(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "Could not send your feedback."); }
  }

  return (
    <Card as="section" className="space-y-4 p-5 animate-fade-up">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-2xl font-semibold">{entry.career}</h2>
        <ConfidencePips level={entry.confidence} />
      </div>
      {!recId ? (
        <Notice tone="info">This is an emerging interest, so ACIS hasn&apos;t written a full explanation yet. It becomes a proper suggestion once there is more evidence, like a project or a reflection. You can also <Link className="font-semibold underline" href={`/mentor?q=${encodeURIComponent(`Why is ${entry.career} showing up for me?`)}`}>ask the mentor</Link>.</Notice>
      ) : (
        <AsyncPanel state={rec} rows={2} label="Loading explanation">
          {(r) => r && (
            <>
              <div><p className="eyebrow mb-1">Why you&apos;re seeing this</p><p className="leading-relaxed text-ink-soft">{r.why}</p></div>
              {r.evidence.length > 0 && <div><p className="eyebrow mb-1.5">What it&apos;s based on</p><ul className="list-disc space-y-1 pl-5 text-[15px] text-ink-soft">{r.evidence.map((e) => <li key={e}>{e}</li>)}</ul></div>}
              <div className="rounded-md bg-growth-soft px-4 py-3"><p className="eyebrow mb-1 !text-growth-ink">What could change this</p><p className="text-sm leading-relaxed text-growth-ink">{r.what_could_change}</p></div>
              <div className="border-t border-line pt-4">
                {sent === null ? (
                  <div className="flex flex-wrap items-center gap-3"><span className="text-sm font-medium">Does this feel right?</span>
                    <Button variant="secondary" onClick={() => vote(true)}><ThumbsUp className="h-4 w-4" aria-hidden />Yes, it fits</Button>
                    <Button variant="secondary" onClick={() => vote(false)}><ThumbsDown className="h-4 w-4" aria-hidden />Not really</Button></div>
                ) : <Notice tone="success">Thanks. Your feedback is saved and counts as gentle evidence. One answer never flips your picture.</Notice>}
                {err && <Notice tone="error" className="mt-2">{err}</Notice>}
              </div>
            </>
          )}
        </AsyncPanel>
      )}
      <div className="flex flex-wrap gap-2 border-t border-line pt-4">
        <ButtonLink href={`/skills?career=${entry.slug}`} variant="secondary">See the skill gap</ButtonLink>
        <ButtonLink href={`/compare?a=${entry.slug}`} variant="secondary">Compare with another</ButtonLink>
        <ButtonLink href="/roadmap" variant="ghost">Plan a roadmap</ButtonLink>
      </div>
    </Card>
  );
}

const EVIDENCE_TYPES: { value: EvidenceType; label: string }[] = [
  { value: "project", label: "A project I built" }, { value: "competition", label: "A competition or hackathon" },
  { value: "club", label: "A club or group I joined" }, { value: "activity", label: "Another activity" },
];

function AddEvidence({ onSaved }: { onSaved: () => void }) {
  const careers = useAsync(() => acis.careers.list(), []);
  const [slug, setSlug] = useState("");
  const [kind, setKind] = useState<EvidenceType>("project");
  const [feeling, setFeeling] = useState<"1" | "-1">("1");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!slug) { setMsg({ tone: "error", text: "Choose which career this relates to." }); return; }
    setBusy(true); setMsg(null);
    try {
      await acis.careers.addEvidence({ career_slug: slug, source_type: kind, direction: feeling === "1" ? 1 : -1, strength: 0.8, note: note.trim() });
      setNote(""); setMsg({ tone: "success", text: "Added. A single entry nudges your picture gently. Patterns over time matter most." }); onSaved();
    } catch (ex) { setMsg({ tone: "error", text: ex instanceof ApiError ? ex.message : "Could not save this." }); }
    finally { setBusy(false); }
  }

  return (
    <Panel title="Add something you did">
      <p className="mb-4 text-sm text-ink-soft">Did something that pointed you towards, or away from, a career? Tell ACIS. Real activity counts far more than clicks.</p>
      <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" noValidate>
        <SelectField label="Related career" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="Choose a career" options={(careers.data ?? []).map((c) => ({ value: c.slug, label: c.name }))} />
        <SelectField label="What was it?" value={kind} onChange={(e) => setKind(e.target.value as EvidenceType)} options={EVIDENCE_TYPES} />
        <SelectField label="How did it feel?" value={feeling} onChange={(e) => setFeeling(e.target.value as "1" | "-1")} options={[{ value: "1", label: "It pulled me towards this career" }, { value: "-1", label: "It pushed me away from it" }]} />
        <TextAreaField label="A note (optional)" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />
        <div className="sm:col-span-2">{msg && <Notice tone={msg.tone} className="mb-3">{msg.text}</Notice>}<Button type="submit" loading={busy}>Add to my profile</Button></div>
      </form>
    </Panel>
  );
}

export default function CareersPage() {
  const portfolio = useAsync(() => acis.careers.portfolio(), []);
  const log = useAsync(() => acis.research.log(100), []);
  const history = useAsync(() => acis.careers.history(), []);
  const [selected, setSelected] = useState<CareerEntry | null>(null);

  const recIds = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of log.data ?? []) if (r.kind === "career" && !m.has(r.target)) m.set(r.target, r.id);   // log is newest-first
    return m;
  }, [log.data]);
  const refreshAll = () => { portfolio.reload(); history.reload(); log.reload(); };
  const current = selected ?? portfolio.data?.primary ?? null;

  if (portfolio.error?.status === 409) return <><PageHeader title="Career directions" /><NeedsAssessment /></>;

  return (
    <div>
      <PageHeader eyebrow="Career model" title="Career directions"
        description="Primary, secondary and emerging directions based on everything ACIS has seen so far. Select one to see why it appears and what could change it."
        actions={<ButtonLink href="/assessment" variant="secondary">Retake assessment</ButtonLink>} />

      {portfolio.loading && !portfolio.data ? <LoadingBlock rows={4} label="Loading career directions" /> :
        portfolio.error && !portfolio.data ? <ErrorState error={portfolio.error} onRetry={portfolio.reload} /> :
        portfolio.data && (
          <div className="space-y-8">
            {portfolio.data.explore_message && <Notice tone="info">{portfolio.data.explore_message}</Notice>}
            <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
              <div><PortfolioCards portfolio={portfolio.data} onSelect={setSelected} /></div>
              <div>{current ? <Explanation key={current.slug} entry={current} recId={recIds.get(current.career) ?? null} onChanged={refreshAll} /> :
                <Card className="p-6 text-sm text-ink-soft">Select a direction on the left to see why it appears.</Card>}</div>
            </div>
            <AddEvidence onSaved={refreshAll} />
            <Panel title="How your directions have changed" aside={<span className="text-ink-faint">Newest first</span>}>
              <AsyncPanel state={history} rows={2}>
                {(rows) => rows.length === 0 ? <p className="text-sm text-ink-soft">Changes will appear here as your picture evolves.</p> : (
                  <ol className="divide-y divide-line">{rows.slice(0, 12).map((h, i) => (
                    <li key={i} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                      <span><strong>{h.career}</strong> <span className="text-ink-soft">became {h.role === "emerging" ? "an emerging interest" : `a ${h.role} direction`}</span></span>
                      <span className="flex items-center gap-3"><Chip>{humanize(h.level)}</Chip><span className="text-xs text-ink-faint">{formatDate(h.at)}</span></span>
                    </li>
                  ))}</ol>
                )}
              </AsyncPanel>
            </Panel>
          </div>
        )}
    </div>
  );
}

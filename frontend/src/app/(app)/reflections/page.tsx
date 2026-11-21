"use client";
import { useState, type FormEvent } from "react";
import { Plus, Search, Trash2, X } from "lucide-react";
import { VoiceJournal } from "@/components/VoiceJournal";
import { AsyncPanel, Panel } from "@/components/panels";
import { Button, Chip, EmptyState, ErrorState, LoadingBlock, Notice, PageHeader, SelectField, Tabs, TextAreaField, TextField } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { acis } from "@/lib/endpoints";
import { formatDate, humanize } from "@/lib/format";
import type { JournalEntry, Reflection } from "@/lib/types";
import { useAsync } from "@/lib/useAsync";

type Tab = "reflect" | "journal" | "voice" | "history";
type Mention = { slug: string; feeling: "enjoyed" | "disliked" };

function ReflectForm({ onSaved }: { onSaved: () => void }) {
  const prompt = useAsync(() => acis.reflections.prompt(), []);
  const careers = useAsync(() => acis.careers.list(), []);
  const [enjoyed, setEnjoyed] = useState("");
  const [disliked, setDisliked] = useState("");
  const [surprised, setSurprised] = useState("");
  const [changed, setChanged] = useState<"yes" | "no" | "unsure">("no");
  const [mentions, setMentions] = useState<Mention[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ names: string[]; note: string } | null>(null);

  const q = (field: string, fallback: string) => prompt.data?.prompts.find((p) => p.field === field)?.question ?? fallback;
  const careerName = (slug: string) => careers.data?.find((c) => c.slug === slug)?.name ?? humanize(slug);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const clean = mentions.filter((m) => m.slug);
    if (!enjoyed.trim() && !disliked.trim() && !surprised.trim() && clean.length === 0) { setError("Write something in at least one box, or pick a career."); return; }
    setBusy(true); setError(null);
    try {
      const r = await acis.reflections.create({ enjoyed: enjoyed.trim(), disliked: disliked.trim(), surprised: surprised.trim(), interests_changed: changed, related_careers: clean });
      setResult({ names: (r.career_evidence_added_for ?? []).map(careerName), note: r.note ?? "" });
      setEnjoyed(""); setDisliked(""); setSurprised(""); setChanged("no"); setMentions([]);
      prompt.reload(); onSaved();
    } catch (ex) { setError(ex instanceof ApiError ? ex.message : "Could not save your reflection."); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <AsyncPanel state={prompt} rows={1}>{(p) => (
        <Notice tone={p.due ? "info" : "success"}>{p.due ? (p.days_since_last === null ? "You haven't written a reflection yet. A few honest lines are plenty." : `It's been ${p.days_since_last} days since your last reflection.`) : `You reflected recently. The next one is due in about ${p.next_due_in_days} days, but you can write one any time.`} {p.note}</Notice>
      )}</AsyncPanel>
      <TextAreaField label={q("enjoyed", "What did you enjoy most recently?")} rows={3} value={enjoyed} onChange={(e) => setEnjoyed(e.target.value)} maxLength={2000} />
      <TextAreaField label={q("disliked", "What did you dislike or find draining?")} rows={3} value={disliked} onChange={(e) => setDisliked(e.target.value)} maxLength={2000} />
      <TextAreaField label={q("surprised", "Did anything surprise you?")} rows={2} value={surprised} onChange={(e) => setSurprised(e.target.value)} maxLength={2000} />

      <fieldset>
        <legend className="mb-2 text-sm font-medium">{q("interests_changed", "Have your interests changed?")}</legend>
        <div className="flex flex-wrap gap-2">{(["yes", "no", "unsure"] as const).map((v) => (
          <label key={v} className={cn("cursor-pointer rounded-full border px-4 py-1.5 text-sm font-medium focus-within:ring-2 focus-within:ring-career", changed === v ? "border-career bg-career text-white" : "border-line bg-card text-ink-soft")}>
            <input type="radio" name="changed" className="sr-only" checked={changed === v} onChange={() => setChanged(v)} />{humanize(v)}</label>
        ))}</div>
      </fieldset>

      <div>
        <p className="mb-1 text-sm font-medium">Was this about a particular career? <span className="font-normal text-ink-faint">(optional)</span></p>
        <p className="mb-2 text-xs text-ink-faint">If you tell ACIS directly, it counts for more than guessing from your words.</p>
        <div className="space-y-2">{mentions.map((m, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <div className="min-w-[180px] flex-1"><SelectField label={`Career ${i + 1}`} value={m.slug} onChange={(e) => setMentions((p) => p.map((x, j) => j === i ? { ...x, slug: e.target.value } : x))} placeholder="Choose a career" options={(careers.data ?? []).map((c) => ({ value: c.slug, label: c.name }))} /></div>
            <div className="w-44"><SelectField label="I…" value={m.feeling} onChange={(e) => setMentions((p) => p.map((x, j) => j === i ? { ...x, feeling: e.target.value as Mention["feeling"] } : x))} options={[{ value: "enjoyed", label: "enjoyed it" }, { value: "disliked", label: "disliked it" }]} /></div>
            <button type="button" onClick={() => setMentions((p) => p.filter((_, j) => j !== i))} aria-label={`Remove career ${i + 1}`} className="mt-6 rounded p-2 text-ink-faint hover:bg-ink/5"><X className="h-4 w-4" /></button>
          </div>
        ))}</div>
        {mentions.length < 3 && <Button type="button" variant="ghost" className="mt-2" onClick={() => setMentions((p) => [...p, { slug: "", feeling: "enjoyed" }])}><Plus className="h-4 w-4" aria-hidden />Add a career</Button>}
      </div>

      {error && <Notice tone="error">{error}</Notice>}
      {result && <Notice tone="success">Reflection saved. {result.names.length ? `It gently nudged: ${result.names.join(", ")}. ` : ""}{result.note}</Notice>}
      <Button type="submit" loading={busy}>Save reflection</Button>
    </form>
  );
}

function JournalTab({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<JournalEntry | null>(null);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState("");
  const [extra, setExtra] = useState<JournalEntry[]>([]);
  const [more, setMore] = useState(false);
  const list = useAsync(() => (searching ? acis.journal.search(searching).then((items) => ({ total: items.length, items })) : acis.journal.list({ limit: 10 })), [searching, refreshKey]);
  const entries = [...(list.data?.items ?? []), ...(searching ? [] : extra)];

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) { setError("Write something first."); return; }
    setBusy(true); setError(null);
    try { setSaved(await acis.journal.create(text.trim())); setText(""); setExtra([]); list.reload(); onChanged(); }
    catch (ex) { setError(ex instanceof ApiError ? ex.message : "Could not save your entry."); } finally { setBusy(false); }
  }
  async function loadMore() {
    setMore(true);
    try { const r = await acis.journal.list({ limit: 10, offset: entries.length }); setExtra((p) => [...p, ...r.items]); } catch { /* keep what we have */ } finally { setMore(false); }
  }
  async function remove(id: number) {
    try { await acis.journal.remove(id); setExtra((p) => p.filter((x) => x.id !== id)); list.reload(); onChanged(); }
    catch (ex) { setError(ex instanceof ApiError ? ex.message : "Could not delete that entry."); }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={save} noValidate className="space-y-3">
        <TextAreaField label="Write freely" rows={6} value={text} onChange={(e) => setText(e.target.value)} maxLength={5000}
          hint={<>Only you can read your journal. ACIS looks for fields of study and skills you mention (a simple keyword match, so it will miss some things). It does <strong>not</strong> try to read your mood or health. {text.length}/5000</>} />
        {error && <Notice tone="error">{error}</Notice>}
        {saved && <Notice tone="success">Saved. {saved.detected.fields.length ? `You touched on: ${saved.detected.fields.map((f) => f.replace(/_/g, " ")).join(", ")}.` : "No specific fields were mentioned."} {saved.career_evidence_added_for?.length ? "This added mild evidence for related careers." : ""}</Notice>}
        <Button type="submit" loading={busy}>Save entry</Button>
      </form>

      <div className="border-t border-line pt-5">
        <form onSubmit={(e) => { e.preventDefault(); setSearching(query.trim()); }} role="search" className="mb-4 flex gap-2">
          <div className="flex-1"><TextField label="Search your journal" value={query} onChange={(e) => { setQuery(e.target.value); if (!e.target.value) setSearching(""); }} /></div>
          <Button type="submit" variant="secondary" className="mt-[26px] self-start"><Search className="h-4 w-4" aria-hidden />Search</Button>
        </form>
        {list.loading && !list.data ? <LoadingBlock rows={2} /> : list.error && !list.data ? <ErrorState error={list.error} onRetry={list.reload} /> :
          entries.length === 0 ? <EmptyState title={searching ? "Nothing matched" : "No entries yet"} description={searching ? "Try a different word." : "Your first entry will appear here."} /> : (
            <ul className="space-y-3">{entries.map((j) => (
              <li key={j.id} className="rounded-md border border-line bg-card p-4">
                <div className="flex items-start justify-between gap-3"><p className="prose-plain text-[15px]">{j.text}</p>
                  <button type="button" onClick={() => remove(j.id)} aria-label="Delete journal entry" className="shrink-0 rounded p-1.5 text-ink-faint hover:bg-danger-soft hover:text-danger"><Trash2 className="h-4 w-4" /></button></div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-ink-faint"><span>{formatDate(j.created_at)}</span>{j.detected.fields.map((f) => <Chip key={f}>{f.replace(/_/g, " ")}</Chip>)}</div>
              </li>
            ))}</ul>
          )}
        {!searching && list.data && entries.length < list.data.total && <Button variant="secondary" className="mt-4" onClick={loadMore} loading={more}>Load older entries</Button>}
        <p className="mt-3 text-xs text-ink-faint">Deleting an entry also removes the memory and career evidence it created.</p>
      </div>
    </div>
  );
}

function HistoryTab({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const list = useAsync(() => acis.reflections.list({ limit: 30 }), [refreshKey]);
  const [err, setErr] = useState<string | null>(null);
  async function remove(r: Reflection) {
    try { await acis.reflections.remove(r.id); list.reload(); onChanged(); } catch (e) { setErr(e instanceof ApiError ? e.message : "Could not delete."); }
  }
  return (
    <AsyncPanel state={list} rows={2}>{(d) => d.items.length === 0 ? <EmptyState title="No reflections yet" description="Your reflections will be kept here, newest first." /> : (
      <div className="space-y-3">{err && <Notice tone="error">{err}</Notice>}
        {d.items.map((r) => (
          <article key={r.id} className="rounded-md border border-line bg-card p-4">
            <div className="mb-2 flex items-center justify-between"><p className="text-xs font-semibold text-ink-faint">{formatDate(r.created_at)}{r.interests_changed === "yes" ? " · said interests changed" : ""}</p>
              <button type="button" onClick={() => remove(r)} aria-label="Delete reflection" className="rounded p-1.5 text-ink-faint hover:bg-danger-soft hover:text-danger"><Trash2 className="h-4 w-4" /></button></div>
            <dl className="space-y-2 text-[15px]">
              {r.enjoyed && <div><dt className="eyebrow">Enjoyed</dt><dd className="prose-plain">{r.enjoyed}</dd></div>}
              {r.disliked && <div><dt className="eyebrow">Disliked</dt><dd className="prose-plain">{r.disliked}</dd></div>}
              {r.surprised && <div><dt className="eyebrow">Surprised by</dt><dd className="prose-plain">{r.surprised}</dd></div>}
            </dl>
          </article>
        ))}</div>
    )}</AsyncPanel>
  );
}

export default function ReflectionsPage() {
  const [tab, setTab] = useState<Tab>("reflect");
  const [key, setKey] = useState(0);
  const bump = () => setKey((k) => k + 1);
  return (
    <div>
      <PageHeader eyebrow="You" title="Reflections" description="Small, regular reflection is how ACIS learns what you really enjoy. One entry only nudges your picture slightly, and patterns over time are what count." />
      <Tabs label="Reflection sections" value={tab} onChange={setTab} tabs={[{ id: "reflect", label: "Reflect" }, { id: "journal", label: "Journal" }, { id: "voice", label: "Voice" }, { id: "history", label: "Past reflections" }]} />
      <Panel title={{ reflect: "Reflect on the last few weeks", journal: "Your journal", voice: "Voice journal", history: "Past reflections" }[tab]}>
        {tab === "reflect" && <ReflectForm onSaved={bump} />}
        {tab === "journal" && <JournalTab refreshKey={key} onChanged={bump} />}
        {tab === "voice" && <VoiceJournal onSaved={() => { bump(); }} />}
        {tab === "history" && <HistoryTab refreshKey={key} onChanged={bump} />}
      </Panel>
    </div>
  );
}

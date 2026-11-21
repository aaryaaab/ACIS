"use client";
import { useState, type FormEvent } from "react";
import { Pencil, Search, Trash2 } from "lucide-react";
import { ApiError } from "@/lib/api";
import { acis } from "@/lib/endpoints";
import { formatDate } from "@/lib/format";
import { certaintyWord, fadesIn, MEMORY_INFO, memorySource } from "@/lib/memory";
import type { Memory, MemoryCategory } from "@/lib/types";
import { useAsync } from "@/lib/useAsync";
import { Button, Chip, EmptyState, ErrorState, LoadingBlock, Notice, SelectField, Tabs, TextAreaField, TextField } from "./ui";

type Tab = "all" | MemoryCategory;

function Item({ m, onChanged }: { m: Memory; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(m.content);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fade = fadesIn(m);

  async function save() {
    if (!text.trim()) { setErr("A memory can't be empty. Delete it instead."); return; }
    setBusy(true); setErr(null);
    try { await acis.memory.update(m.id, { content: text.trim() }); setEditing(false); onChanged(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "Could not save."); } finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true); setErr(null);
    try { await acis.memory.remove(m.id); onChanged(); }
    catch (e) { setErr(e instanceof ApiError ? e.message : "Could not delete."); setBusy(false); }
  }

  return (
    <li className="rounded-md border border-line bg-card p-4">
      {editing ? (
        <div className="space-y-2">
          <TextAreaField label="Memory" rows={2} value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} />
          <div className="flex gap-2"><Button onClick={save} loading={busy}>Save</Button><Button variant="ghost" onClick={() => { setEditing(false); setText(m.content); setErr(null); }}>Cancel</Button></div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="leading-relaxed">{m.content}</p>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-faint">
              <Chip tone={m.category === "stable" ? "career" : m.category === "temporary" ? "warn" : "neutral"}>{MEMORY_INFO[m.category].label}</Chip>
              <span>{memorySource(m.source)}</span><span>·</span><span>{certaintyWord(m.confidence)}</span><span>·</span><span>{formatDate(m.created_at)}</span>
              {fade && <><span>·</span><span>{fade}</span></>}
              {m.tags.slice(0, 4).map((t) => <Chip key={t}>{t.replace(/_/g, " ")}</Chip>)}
            </div>
          </div>
          <div className="flex shrink-0 gap-1">
            <button type="button" onClick={() => setEditing(true)} aria-label="Edit memory" className="rounded p-1.5 text-ink-faint hover:bg-ink/5 hover:text-ink"><Pencil className="h-4 w-4" /></button>
            <button type="button" onClick={remove} disabled={busy} aria-label="Delete memory" className="rounded p-1.5 text-ink-faint hover:bg-danger-soft hover:text-danger"><Trash2 className="h-4 w-4" /></button>
          </div>
        </div>
      )}
      {err && <Notice tone="error" className="mt-2">{err}</Notice>}
    </li>
  );
}

export function MemoryManager() {
  const [tab, setTab] = useState<Tab>("all");
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState("");
  const summary = useAsync(() => acis.memory.summary(), []);
  const list = useAsync(() => (searching ? acis.memory.search(searching).then((items) => ({ total: items.length, items })) : acis.memory.list({ category: tab === "all" ? undefined : tab })), [tab, searching]);
  const [category, setCategory] = useState<MemoryCategory>("stable");
  const [content, setContent] = useState("");
  const [addErr, setAddErr] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const refresh = () => { list.reload(); summary.reload(); };
  const total = summary.data ? Object.values(summary.data).reduce((a, b) => a + b, 0) : undefined;

  async function add(e: FormEvent) {
    e.preventDefault();
    if (!content.trim()) { setAddErr("Write something for ACIS to remember."); return; }
    setAdding(true); setAddErr(null);
    try { await acis.memory.create({ category, content: content.trim(), importance: 0.6 }); setContent(""); refresh(); }
    catch (ex) { setAddErr(ex instanceof ApiError ? ex.message : "Could not add this memory."); } finally { setAdding(false); }
  }

  return (
    <div>
      <p className="mb-4 max-w-2xl text-sm leading-relaxed text-ink-soft">This is everything ACIS keeps in its long-term memory about you. It is used to personalise the mentor and your suggestions. You can correct or delete anything, and ACIS stops using it.</p>
      <Tabs label="Memory categories" value={tab} onChange={(t) => { setTab(t); setSearching(""); setQuery(""); }}
        tabs={[{ id: "all" as Tab, label: "All", count: total }, ...(Object.keys(MEMORY_INFO) as MemoryCategory[]).map((c) => ({ id: c as Tab, label: MEMORY_INFO[c].label, count: summary.data?.[c] }))]} />
      {tab !== "all" && <p className="-mt-2 mb-4 text-sm text-ink-faint">{MEMORY_INFO[tab].blurb}</p>}

      <form onSubmit={(e) => { e.preventDefault(); setSearching(query.trim()); }} className="mb-5 flex gap-2" role="search">
        <div className="flex-1"><TextField label="Search your memories" value={query} onChange={(e) => { setQuery(e.target.value); if (!e.target.value) setSearching(""); }} placeholder="For example: robotics" /></div>
        <Button type="submit" variant="secondary" className="mt-[26px] self-start"><Search className="h-4 w-4" aria-hidden />Search</Button>
      </form>

      {list.loading && !list.data ? <LoadingBlock rows={3} label="Loading memories" /> : list.error && !list.data ? <ErrorState error={list.error} onRetry={list.reload} /> : (
        list.data && list.data.items.length === 0
          ? <EmptyState title={searching ? "No matching memories" : "Nothing here yet"} description={searching ? "Try a different word." : "Memories appear as you use ACIS. You can also add one yourself below."} />
          : <ul className="space-y-2.5">{list.data?.items.map((m) => <Item key={m.id} m={m} onChanged={refresh} />)}</ul>
      )}

      <form onSubmit={add} noValidate className="mt-6 rounded-md border border-dashed border-line p-4">
        <h3 className="mb-3 text-base font-semibold">Tell ACIS something to remember</h3>
        <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
          <SelectField label="Type" value={category} onChange={(e) => setCategory(e.target.value as MemoryCategory)} options={(Object.keys(MEMORY_INFO) as MemoryCategory[]).map((c) => ({ value: c, label: MEMORY_INFO[c].label }))} />
          <TextAreaField label="What should it remember?" rows={2} value={content} onChange={(e) => setContent(e.target.value)} maxLength={1000} error={addErr} />
        </div>
        <Button type="submit" loading={adding} className="mt-3">Add memory</Button>
      </form>
    </div>
  );
}

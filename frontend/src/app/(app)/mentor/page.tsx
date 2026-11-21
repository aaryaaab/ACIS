"use client";
import { Suspense, useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { MessageSquarePlus, Send, Trash2, History } from "lucide-react";
import { Button, Chip, ErrorState, LoadingBlock, Notice } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { acis } from "@/lib/endpoints";
import { formatDate, linkify } from "@/lib/format";
import { describeSource, SUGGESTED_PROMPTS } from "@/lib/mentor";
import type { Conversation, MentorMessage } from "@/lib/types";
import { useAsync } from "@/lib/useAsync";

function Linked({ text }: { text: string }) {
  return <>{linkify(text).map((p, i) => p.href ? <a key={i} href={p.href} target="_blank" rel="noopener noreferrer" className="break-all font-medium text-career underline underline-offset-2">{p.text}</a> : <span key={i}>{p.text}</span>)}</>;
}

function Bubble({ m }: { m: MentorMessage }) {
  if (m.role === "user") {
    return <div className="flex justify-end"><p className="prose-plain max-w-[85%] rounded-lg rounded-br-sm bg-career px-4 py-2.5 text-[15px] text-white">{m.content}</p></div>;
  }
  const support = m.intent === "support";
  return (
    <div className="flex">
      <div className={cn("max-w-[92%] rounded-lg rounded-bl-sm border px-4 py-3", support ? "border-growth/40 bg-growth-soft" : "border-line bg-card")}>
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-ink-faint">Mentor</p>
        <p className="prose-plain text-[15px] text-ink"><Linked text={m.content} /></p>
        {m.sources.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line pt-2.5">
            <span className="text-xs font-semibold text-ink-faint">Based on</span>
            {m.sources.map((s, i) => { const d = describeSource(s); return d.href
              ? <a key={i} href={d.href} target="_blank" rel="noopener noreferrer" className="rounded-full bg-career-soft px-2.5 py-0.5 text-xs font-medium text-career-ink hover:underline">{d.label}</a>
              : <Chip key={i}>{d.label}</Chip>; })}
          </div>
        )}
      </div>
    </div>
  );
}

function Mentor() {
  const prefill = useSearchParams().get("q") ?? "";
  const status = useAsync(() => acis.mentor.status(), []);
  const convs = useAsync(() => acis.mentor.conversations(), []);
  const [active, setActive] = useState<number | null>(null);
  const [messages, setMessages] = useState<MentorMessage[]>([]);
  const [input, setInput] = useState(prefill);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingConv, setLoadingConv] = useState(false);
  const [showList, setShowList] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView?.({ behavior: "smooth", block: "end" }); }, [messages, sending]);

  const open = useCallback(async (id: number) => {
    setLoadingConv(true); setError(null); setShowList(false);
    try { const c = await acis.mentor.conversation(id); setActive(id); setMessages(c.messages); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Could not open that conversation."); }
    finally { setLoadingConv(false); }
  }, []);

  function fresh() { setActive(null); setMessages([]); setError(null); setInput(""); setShowList(false); }

  async function send(text: string) {
    const msg = text.trim();
    if (!msg || sending) return;
    setSending(true); setError(null);
    const optimistic: MentorMessage = { id: -Date.now(), role: "user", content: msg, intent: "", sources: [], llm_used: false, created_at: new Date().toISOString() };
    setMessages((m) => [...m, optimistic]);
    setInput("");
    try {
      const r = await acis.mentor.chat(msg, active);
      setActive(r.conversation_id);
      setMessages((m) => [...m, r.reply]);
      convs.reload();
    } catch (e) {
      setMessages((m) => m.filter((x) => x.id !== optimistic.id));
      setInput(msg);                                              // give the text back so nothing is lost
      setError(e instanceof ApiError ? e.message : "The mentor couldn't answer. Please try again.");
    } finally { setSending(false); }
  }

  async function remove(c: Conversation) {
    try { await acis.mentor.remove(c.id); if (active === c.id) fresh(); convs.reload(); }
    catch (e) { setError(e instanceof ApiError ? e.message : "Could not delete that conversation."); }
  }

  const onSubmit = (e: FormEvent) => { e.preventDefault(); void send(input); };
  const list = (
    <div>
      <Button variant="secondary" className="mb-3 w-full" onClick={fresh}><MessageSquarePlus className="h-4 w-4" aria-hidden />New conversation</Button>
      {convs.loading && !convs.data ? <LoadingBlock rows={2} label="Loading conversations" /> : convs.error ? <ErrorState error={convs.error} onRetry={convs.reload} title="Couldn't load history" /> : (
        <ul className="space-y-1">
          {convs.data?.items.length === 0 && <li className="px-2 py-3 text-sm text-ink-faint">No conversations yet.</li>}
          {convs.data?.items.map((c) => (
            <li key={c.id} className={cn("group flex items-center gap-1 rounded-md", active === c.id ? "bg-career-soft" : "hover:bg-ink/5")}>
              <button type="button" onClick={() => open(c.id)} className="min-w-0 flex-1 px-2.5 py-2 text-left">
                <span className="block truncate text-sm font-medium">{c.title || "Conversation"}</span><span className="text-xs text-ink-faint">{formatDate(c.created_at)}</span>
              </button>
              <button type="button" onClick={() => remove(c)} aria-label={`Delete conversation ${c.title}`} className="mr-1 rounded p-1.5 text-ink-faint hover:bg-danger-soft hover:text-danger"><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="hidden lg:block" aria-label="Conversations"><h2 className="eyebrow mb-3">History</h2>{list}</aside>

      <section className="flex min-h-[70vh] flex-col" aria-label="Conversation with the mentor">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="eyebrow mb-1">AI Mentor</p>
            <h1 className="text-3xl font-semibold">Talk it through</h1>
          </div>
          <Button variant="secondary" className="lg:hidden" onClick={() => setShowList((s) => !s)}><History className="h-4 w-4" aria-hidden />History</Button>
        </div>
        {showList && <div className="card mb-4 p-3 lg:hidden">{list}</div>}

        {status.data && (
          <Notice tone="info" className="mb-4">
            {status.data.mode === "llm" ? "Answers are written by a connected language model, using only your saved data." : "Answers are built from your saved data using ACIS's built-in rules. No external AI is connected."}
            {" "}The mentor helps you compare and reflect. It never decides for you and never guarantees outcomes.
          </Notice>
        )}

        <div className="card flex flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-5" aria-live="polite" aria-label="Messages">
            {loadingConv ? <LoadingBlock rows={3} label="Opening conversation" /> : messages.length === 0 ? (
              <div className="py-6 text-center">
                <p className="font-display text-xl">What&apos;s on your mind?</p>
                <p className="mx-auto mt-1.5 max-w-md text-sm text-ink-soft">Ask about a career, a doubt, or what to do next. Try one of these:</p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {SUGGESTED_PROMPTS.map((p) => <button key={p} type="button" onClick={() => send(p)} className="rounded-full border border-line bg-card px-3.5 py-1.5 text-sm text-ink-soft hover:border-career/50 hover:text-ink">{p}</button>)}
                </div>
              </div>
            ) : messages.map((m) => <Bubble key={m.id} m={m} />)}
            {sending && <div className="flex"><p role="status" className="rounded-lg border border-line bg-card px-4 py-2.5 text-sm text-ink-faint">Mentor is thinking…</p></div>}
            <div ref={endRef} />
          </div>
          {error && <div className="px-4 pb-2"><Notice tone="error">{error}</Notice></div>}
          <form onSubmit={onSubmit} className="flex items-end gap-2 border-t border-line p-3">
            <label htmlFor="mentor-input" className="sr-only">Your message</label>
            <textarea id="mentor-input" value={input} onChange={(e) => setInput(e.target.value)} rows={1} maxLength={2000} placeholder="Ask anything about your path…"
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }}
              className="max-h-32 min-h-[42px] flex-1 resize-none rounded-md border border-line bg-paper px-3 py-2 text-[15px] focus:border-career" />
            <Button type="submit" loading={sending} disabled={!input.trim()} aria-label="Send message"><Send className="h-4 w-4" aria-hidden /><span className="hidden sm:inline">Send</span></Button>
          </form>
        </div>
        <p className="mt-2 text-xs text-ink-faint">Conversations are private and you can delete any of them. Check opportunity and deadline details on the provider&apos;s own page.</p>
      </section>
    </div>
  );
}

export default function MentorPage() {
  return <Suspense fallback={null}><Mentor /></Suspense>;
}

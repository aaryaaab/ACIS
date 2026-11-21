"use client";
import { useMemo, useState } from "react";
import { BookOpen, ClipboardCheck, Compass, GraduationCap, Hammer, NotebookPen, PenLine, Trophy, Gauge, type LucideIcon } from "lucide-react";
import { Chip, EmptyState, ErrorState, LoadingBlock, PageHeader } from "@/components/ui";
import { cn } from "@/lib/cn";
import { acis } from "@/lib/endpoints";
import { formatDate, monthLabel } from "@/lib/format";
import type { TimelineEvent, TimelineType } from "@/lib/types";
import { useAsync } from "@/lib/useAsync";

const META: Record<TimelineType, { label: string; icon: LucideIcon; dot: string }> = {
  assessment: { label: "Assessments", icon: ClipboardCheck, dot: "bg-career text-white" },
  career: { label: "Career changes", icon: Compass, dot: "bg-career text-white" },
  learning: { label: "Learning", icon: GraduationCap, dot: "bg-learning text-white" },
  project: { label: "Projects", icon: Hammer, dot: "bg-growth text-white" },
  achievement: { label: "Achievements", icon: Trophy, dot: "bg-growth text-white" },
  skill: { label: "Skills", icon: Gauge, dot: "bg-growth text-white" },
  reflection: { label: "Reflections", icon: PenLine, dot: "bg-ink text-white" },
  journal: { label: "Journal", icon: NotebookPen, dot: "bg-ink text-white" },
};

export default function TimelinePage() {
  const state = useAsync(() => acis.timeline({ limit: 200 }), []);
  const [hidden, setHidden] = useState<Set<TimelineType>>(new Set());

  const grouped = useMemo(() => {
    const events = (state.data?.events ?? []).filter((e) => !hidden.has(e.type));
    const m = new Map<string, TimelineEvent[]>();
    for (const e of events) m.set(e.month, [...(m.get(e.month) ?? []), e]);
    return [...m.entries()];
  }, [state.data, hidden]);
  const counts = useMemo(() => {
    const c: Partial<Record<TimelineType, number>> = {};
    for (const e of state.data?.events ?? []) c[e.type] = (c[e.type] ?? 0) + 1;
    return c;
  }, [state.data]);
  const toggle = (t: TimelineType) => setHidden((h) => { const n = new Set(h); if (n.has(t)) n.delete(t); else n.add(t); return n; });

  return (
    <div>
      <PageHeader eyebrow="Your story" title="Career timeline" description="How you and your directions have changed over time. Colours show which model each event belongs to: indigo for career, teal for learning, amber for growth." />
      {state.loading && !state.data ? <LoadingBlock rows={4} label="Loading timeline" /> : state.error && !state.data ? <ErrorState error={state.error} onRetry={state.reload} /> : state.data && (
        state.data.total === 0 ? <EmptyState title="Your story starts here" description="Complete the assessment, finish a project or write a reflection, and it will appear on this timeline." /> : (
          <>
            <div className="mb-6 flex flex-wrap gap-2" role="group" aria-label="Filter events">
              {(Object.keys(META) as TimelineType[]).filter((t) => counts[t]).map((t) => (
                <button key={t} type="button" aria-pressed={!hidden.has(t)} onClick={() => toggle(t)}
                  className={cn("rounded-full border px-3 py-1 text-sm font-medium", hidden.has(t) ? "border-line bg-transparent text-ink-faint line-through" : "border-career/30 bg-career-soft text-career-ink")}>
                  {META[t].label} <span className="text-xs opacity-70">{counts[t]}</span></button>
              ))}
            </div>
            {grouped.length === 0 ? <p className="text-sm text-ink-soft">Everything is filtered out. Turn a filter back on.</p> : (
              <div className="space-y-9">
                {grouped.map(([month, events]) => (
                  <section key={month} aria-labelledby={`m-${month}`}>
                    <h2 id={`m-${month}`} className="mb-4 text-2xl font-semibold">{monthLabel(month)}</h2>
                    <ol className="relative ml-4 space-y-5 border-l-2 border-line pl-7">
                      {events.map((e, i) => {
                        const { icon: Icon, dot, label } = META[e.type];
                        return (
                          <li key={`${e.at}-${i}`} className="relative">
                            <span className={cn("absolute -left-[46px] flex h-8 w-8 items-center justify-center rounded-full ring-4 ring-paper", dot)} aria-hidden><Icon className="h-4 w-4" /></span>
                            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                              <p className="font-semibold leading-snug">{e.title}</p><Chip className="!px-2 !py-0 !text-[11px]">{label}</Chip>
                            </div>
                            {e.detail && <p className="mt-0.5 text-sm leading-relaxed text-ink-soft">{e.detail}</p>}
                            <p className="mt-0.5 text-xs text-ink-faint">{formatDate(e.at, { day: "numeric", month: "short" })}</p>
                          </li>
                        );
                      })}
                    </ol>
                  </section>
                ))}
              </div>
            )}
            <p className="mt-8 flex items-center gap-1.5 text-xs text-ink-faint"><BookOpen className="h-3.5 w-3.5" aria-hidden />Journal and reflection text never appears here, only the fact that you wrote one.</p>
          </>
        )
      )}
    </div>
  );
}

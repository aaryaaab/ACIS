"use client";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { AsyncState } from "@/lib/useAsync";
import type { LearningStyle, SkillGapRow } from "@/lib/types";
import { Card, ErrorState, LoadingBlock } from "./ui";

/** Renders loading / error / data for one independent piece of a page. */
export function AsyncPanel<T>({ state, children, rows = 2, label, errorTitle }: { state: AsyncState<T>; children: (data: T) => ReactNode; rows?: number; label?: string; errorTitle?: string }) {
  if (state.loading && !state.data) return <LoadingBlock rows={rows} label={label ?? "Loading"} />;
  if (state.error && !state.data) return <ErrorState error={state.error} onRetry={state.reload} title={errorTitle} />;
  if (state.data === null) return null;
  return <>{children(state.data)}</>;
}

export function Panel({ title, aside, children, className }: { title: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <Card as="section" className={cn("p-5", className)}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {aside && <div className="shrink-0 text-sm">{aside}</div>}
      </div>
      {children}
    </Card>
  );
}

const STYLE_LABELS: Record<string, { name: string; low: string; high: string }> = {
  video: { name: "Video lessons", low: "Prefer other formats", high: "Learn well from video" },
  reading: { name: "Reading", low: "Prefer other formats", high: "Learn well from reading" },
  interactive: { name: "Interactive exercises", low: "Prefer other formats", high: "Learn well by doing exercises" },
  project: { name: "Hands-on projects", low: "Less keen", high: "Learn best by building" },
  theory: { name: "Theory-heavy material", low: "Prefer practical", high: "Comfortable with theory" },
  long_sessions: { name: "Long sessions", low: "Prefer short bursts", high: "Happy with long sessions" },
  difficulty: { name: "Challenge level", low: "Prefer gentler pace", high: "Enjoy a stretch" },
};
const wordFor = (v: number, d: { low: string; high: string }) => (v < 0.4 ? d.low : v > 0.6 ? d.high : "No clear preference yet");

/** Learning-model preferences as soft bars with words, never numbers. */
export function LearningStyleBars({ style, only }: { style: LearningStyle; only?: string[] }) {
  const keys = (only ?? Object.keys(STYLE_LABELS)).filter((k) => k in STYLE_LABELS);
  return (
    <ul className="space-y-3">
      {keys.map((k) => {
        const v = style[k] ?? 0.5;
        const d = STYLE_LABELS[k];
        return (
          <li key={k}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-sm"><span className="font-medium">{d.name}</span><span className="text-xs text-ink-faint">{wordFor(v, d)}</span></div>
            <div className="relative h-2 rounded-full bg-ink/10" role="img" aria-label={`${d.name}: ${wordFor(v, d)}`}>
              <div className="absolute inset-y-0 left-1/2 w-px bg-ink/25" aria-hidden />
              <div className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-learning shadow" style={{ left: `${Math.max(4, Math.min(96, v * 100))}%` }} aria-hidden />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function SkillBar({ skill }: { skill: Pick<SkillGapRow, "skill" | "required_level" | "current_level" | "status"> }) {
  const pct = skill.required_level ? Math.min(100, (skill.current_level / skill.required_level) * 100) : 0;
  const met = skill.status === "met";
  return (
    <li>
      <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
        <span className="font-medium">{skill.skill}</span>
        <span className={cn("text-xs", met ? "font-semibold text-ok" : "text-ink-faint")}>{met ? "Met" : skill.current_level === 0 ? "Not started" : `Level ${skill.current_level} of ${skill.required_level}`}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-ink/10" role="progressbar" aria-label={skill.skill} aria-valuemin={0} aria-valuemax={skill.required_level} aria-valuenow={skill.current_level}>
        <div className={cn("h-full rounded-full transition-[width] duration-500", met ? "bg-ok" : "bg-growth")} style={{ width: `${pct}%` }} />
      </div>
    </li>
  );
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return <div><p className="text-xs font-semibold uppercase tracking-wider text-ink-faint">{label}</p><p className="font-display text-3xl font-semibold leading-tight">{value}</p>{hint && <p className="text-xs text-ink-faint">{hint}</p>}</div>;
}

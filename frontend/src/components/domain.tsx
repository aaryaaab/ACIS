"use client";
import Link from "next/link";
import { Check, Compass } from "lucide-react";
import { cn } from "@/lib/cn";
import { CONFIDENCE_LABEL, STAGES } from "@/lib/format";
import type { Confidence, Stage } from "@/lib/types";
import { EmptyState, ButtonLink } from "./ui";

/** Confidence is never shown as a number: three pips and a word. */
export function ConfidencePips({ level, showLabel = true }: { level: Confidence | "unknown"; showLabel?: boolean }) {
  const filled = level === "high" ? 3 : level === "moderate" ? 2 : level === "emerging" ? 1 : 0;
  const label = level === "unknown" ? "Not assessed" : CONFIDENCE_LABEL[level];
  const tone = level === "high" ? "bg-career" : level === "moderate" ? "bg-career/70" : "bg-career/40";
  return (
    <span className="inline-flex items-center gap-2" title={level === "emerging" ? "Emerging: not enough evidence over time yet" : `${label} confidence`}>
      <span className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((i) => <span key={i} className={cn("h-2 w-2 rounded-full", i < filled ? tone : "bg-ink/15")} />)}
      </span>
      <span className="text-xs font-semibold text-ink-soft">{label}<span className="sr-only"> confidence</span></span>
    </span>
  );
}

export type ModelKey = "career" | "learning" | "growth";
export const MODELS: Record<ModelKey, { name: string; question: string; tone: string; dot: string; soft: string; ink: string }> = {
  career: { name: "Career model", question: "Which directions fit you?", tone: "text-career-ink", dot: "bg-career", soft: "bg-career-soft", ink: "text-career-ink" },
  learning: { name: "Learning model", question: "How do you learn best?", tone: "text-learning-ink", dot: "bg-learning", soft: "bg-learning-soft", ink: "text-learning-ink" },
  growth: { name: "Growth model", question: "What have you actually done?", tone: "text-growth-ink", dot: "bg-growth", soft: "bg-growth-soft", ink: "text-growth-ink" },
};

export function ModelTag({ model }: { model: ModelKey }) {
  const m = MODELS[model];
  return <span className={cn("inline-flex items-center gap-1.5 text-xs font-semibold", m.tone)}><span className={cn("h-2 w-2 rounded-full", m.dot)} aria-hidden />{m.name}</span>;
}

export function StageTracker({ stage }: { stage: Stage }) {
  const idx = STAGES.findIndex((s) => s.key === stage);
  return (
    <ol aria-label="Your stage" className="grid grid-cols-6 gap-1">
      {STAGES.map((s, i) => {
        const state = i < idx ? "past" : i === idx ? "now" : "next";
        return (
          <li key={s.key} aria-current={state === "now" ? "step" : undefined} className="min-w-0">
            <div className={cn("mb-1.5 h-1 rounded-full", state === "next" ? "bg-ink/10" : "bg-career")} />
            <div className="flex items-center gap-1">
              {state === "past" && <Check className="h-3 w-3 shrink-0 text-career" aria-hidden />}
              <span className={cn("truncate text-[11px] font-semibold uppercase tracking-wide sm:text-xs", state === "now" ? "text-career-ink" : state === "past" ? "text-ink-soft" : "text-ink-faint")}>{s.label}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Three interwoven lines: the three models, kept apart but moving together. */
export function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <path d="M3 24c6 0 7-14 13-14s7 6 13 6" stroke="#26418F" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M3 17c6 0 8-9 13-9s7 9 13 9" stroke="#0E7C7B" strokeWidth="2.6" strokeLinecap="round" opacity=".9" />
      <path d="M3 10c5 0 8 12 13 12s8-5 13-5" stroke="#B96A0B" strokeWidth="2.6" strokeLinecap="round" opacity=".95" />
    </svg>
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <Mark />
      <span className="font-display text-[22px] font-semibold tracking-tight text-ink">ACIS</span>
    </span>
  );
}

/** Shown wherever a page needs the assessment first (the API answers 409 until it is done). */
export function NeedsAssessment() {
  return (
    <EmptyState
      icon={<Compass className="h-8 w-8" />}
      title="Let's start with a short assessment"
      description="ACIS needs to know a little about your interests and strengths before it can show anything here. It takes about 10 minutes and you can retake it later."
      action={<ButtonLink href="/assessment">Start the assessment</ButtonLink>}
    />
  );
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return <Link href={href} className="text-sm font-medium text-career hover:underline">← {children}</Link>;
}

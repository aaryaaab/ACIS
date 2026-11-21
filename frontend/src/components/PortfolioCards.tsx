"use client";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/cn";
import type { CareerEntry, Portfolio } from "@/lib/types";
import { ConfidencePips } from "./domain";

const evidenceText = (n: number) => (n === 0 ? "Based on your assessment" : `${n} piece${n === 1 ? "" : "s"} of evidence over time`);

function Row({ e, role, href, onSelect }: { e: CareerEntry; role: string; href?: string; onSelect?: (e: CareerEntry) => void }) {
  const inner = (
    <>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{role}</p>
        <p className="font-display text-lg font-semibold leading-snug">{e.career}</p>
        <p className="mt-0.5 text-xs text-ink-faint">{evidenceText(e.evidence_count)}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2"><ConfidencePips level={e.confidence} />{(href || onSelect) && <ChevronRight className="h-4 w-4 text-ink-faint" aria-hidden />}</div>
    </>
  );
  const cls = "flex w-full items-center justify-between gap-3 rounded-md border border-line bg-card px-4 py-3 text-left transition-colors hover:border-career/40";
  if (onSelect) return <button type="button" onClick={() => onSelect(e)} className={cls}>{inner}</button>;
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  return <div className={cls.replace("hover:border-career/40", "")}>{inner}</div>;
}

export function PortfolioCards({ portfolio, href, onSelect, compact }: { portfolio: Portfolio; href?: string; onSelect?: (e: CareerEntry) => void; compact?: boolean }) {
  const { primary, secondary, emerging, recommendation_allowed } = portfolio;
  if (!recommendation_allowed) {
    return (
      <div className="space-y-2.5">
        {emerging.map((e) => <Row key={e.slug} e={e} role="Worth exploring" href={href} onSelect={onSelect} />)}
        {emerging.length === 0 && <p className="text-sm text-ink-soft">No directions to show yet.</p>}
      </div>
    );
  }
  return (
    <div className="space-y-2.5">
      {primary ? (
        <div className={cn("rounded-lg border-2 border-career/30 bg-career-soft/60 p-1", compact && "border")}>
          <Row e={primary} role="Primary direction" href={href} onSelect={onSelect} />
        </div>
      ) : <p className="rounded-md border border-dashed border-line px-4 py-3 text-sm text-ink-soft">No single direction stands out yet, and that&apos;s fine. More activity will make the picture clearer.</p>}
      {secondary.map((e) => <Row key={e.slug} e={e} role="Secondary direction" href={href} onSelect={onSelect} />)}
      {emerging.length > 0 && <p className="pt-2 text-xs font-semibold uppercase tracking-wider text-ink-faint">Emerging interests</p>}
      {emerging.map((e) => <Row key={e.slug} e={e} role="Emerging" href={href} onSelect={onSelect} />)}
    </div>
  );
}

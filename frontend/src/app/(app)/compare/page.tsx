"use client";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check, X } from "lucide-react";
import { ConfidencePips, NeedsAssessment } from "@/components/domain";
import { AsyncPanel, Panel, SkillBar } from "@/components/panels";
import { ButtonLink, Card, EmptyState, ErrorState, LoadingBlock, Notice, PageHeader, SelectField } from "@/components/ui";
import { acis } from "@/lib/endpoints";
import type { CareerComparison, SkillGapRow } from "@/lib/types";
import { useAsync } from "@/lib/useAsync";

function Column({ c, gap }: { c: CareerComparison; gap: SkillGapRow[] | null }) {
  return (
    <Card as="section" className="space-y-5 p-5">
      <div><h2 className="text-2xl font-semibold">{c.name}</h2><div className="mt-2"><ConfidencePips level={c.fit} /></div></div>
      <p className="text-[15px] leading-relaxed text-ink-soft">{c.description}</p>
      <div><p className="eyebrow mb-1">Typical route</p><p className="text-sm leading-relaxed text-ink-soft">{c.pathway}</p></div>
      {c.degrees.length > 0 && <div><p className="eyebrow mb-1">Degrees</p><ul className="list-disc space-y-0.5 pl-5 text-sm text-ink-soft">{c.degrees.map((d) => <li key={d}>{d}</li>)}</ul></div>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div><p className="eyebrow mb-1.5">You already meet</p>{c.skills_met.length ? <ul className="space-y-1 text-sm">{c.skills_met.map((s) => <li key={s} className="flex items-center gap-1.5 text-ok"><Check className="h-3.5 w-3.5" aria-hidden />{s}</li>)}</ul> : <p className="text-sm text-ink-faint">None yet</p>}</div>
        <div><p className="eyebrow mb-1.5">Still to build</p>{c.skills_missing.length ? <ul className="space-y-1 text-sm text-ink-soft">{c.skills_missing.map((s) => <li key={s} className="flex items-center gap-1.5"><X className="h-3.5 w-3.5 text-ink-faint" aria-hidden />{s}</li>)}</ul> : <p className="text-sm text-ink-faint">Nothing missing</p>}</div>
      </div>
      {gap && gap.length > 0 && <div><p className="eyebrow mb-2">Skill levels</p><ul className="space-y-3">{gap.slice(0, 5).map((s) => <SkillBar key={s.slug} skill={s} />)}</ul></div>}
    </Card>
  );
}

function Compare() {
  const params = useSearchParams();
  const router = useRouter();
  const careers = useAsync(() => acis.careers.list(), []);
  const portfolio = useAsync(() => acis.careers.portfolio().catch(() => null), []);
  const [a, setA] = useState(params.get("a") ?? "");
  const [b, setB] = useState(params.get("b") ?? "");

  // Default to the student's own top two directions the first time.
  useEffect(() => {
    const p = portfolio.data;
    if (!p || a || b) return;
    const picks = [p.primary, ...p.secondary, ...p.emerging].filter(Boolean).map((x) => x!.slug);
    if (picks[0]) setA(picks[0]);
    if (picks[1]) setB(picks[1]);
  }, [portfolio.data, a, b]);

  const ready = !!a && !!b && a !== b;
  const result = useAsync(() => (ready ? acis.careers.compare(a, b) : Promise.resolve(null)), [a, b, ready]);
  const gapA = useAsync(() => (ready ? acis.careers.skillGap(a) : Promise.resolve(null)), [a, ready]);
  const gapB = useAsync(() => (ready ? acis.careers.skillGap(b) : Promise.resolve(null)), [b, ready]);
  const options = useMemo(() => (careers.data ?? []).map((c) => ({ value: c.slug, label: c.name })), [careers.data]);
  const names = result.data ? result.data.careers.map((c) => c.name) : [];
  const sync = (x: string, y: string) => router.replace(`/compare?a=${x}&b=${y}`);

  if (result.error?.status === 409) return <><PageHeader title="Compare careers" /><NeedsAssessment /></>;

  return (
    <div>
      <PageHeader eyebrow="Career model" title="Compare careers" description="Place two directions side by side. This is for thinking, not deciding. Fit levels only describe how much of your evidence points each way today." />
      <Card className="mb-6 grid gap-4 p-5 sm:grid-cols-2">
        <SelectField label="First career" value={a} onChange={(e) => { setA(e.target.value); if (e.target.value && b) sync(e.target.value, b); }} placeholder="Choose a career" options={options} />
        <SelectField label="Second career" value={b} onChange={(e) => { setB(e.target.value); if (a && e.target.value) sync(a, e.target.value); }} placeholder="Choose a career" options={options} />
      </Card>
      {a && a === b && <Notice tone="warn" className="mb-4">Pick two different careers to compare.</Notice>}
      {!ready ? <EmptyState title="Choose two careers" description="Pick any two from the lists above to see them side by side." /> : (
        <AsyncPanel state={result} rows={4} label="Comparing careers">
          {(r) => r && (
            <div className="space-y-5">
              <div className="grid gap-5 lg:grid-cols-2">
                <Column c={r.careers[0]} gap={gapA.data?.skills ?? null} />
                <Column c={r.careers[1]} gap={gapB.data?.skills ?? null} />
              </div>
              <Notice tone="info">{r.note}</Notice>
              <div className="flex flex-wrap gap-3">
                <ButtonLink href={`/mentor?q=${encodeURIComponent(`Compare ${names[0]} and ${names[1]} for me`)}`}>Talk this through with the mentor</ButtonLink>
              </div>
            </div>
          )}
        </AsyncPanel>
      )}
      {careers.error && <div className="mt-4"><ErrorState error={careers.error} onRetry={careers.reload} /></div>}
      {careers.loading && <div className="mt-4"><LoadingBlock rows={1} /></div>}
    </div>
  );
}

export default function ComparePage() {
  return <Suspense fallback={null}><Compare /></Suspense>;
}

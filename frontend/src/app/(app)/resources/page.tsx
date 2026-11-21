"use client";
import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { ModelTag, NeedsAssessment } from "@/components/domain";
import { AsyncPanel, LearningStyleBars, Panel } from "@/components/panels";
import { RateResource } from "@/components/RateResource";
import { Button, Card, Chip, EmptyState, ErrorState, LoadingBlock, Notice, PageHeader, SelectField, Tabs } from "@/components/ui";
import { acis } from "@/lib/endpoints";
import { humanize } from "@/lib/format";
import { DIFFICULTY, fitWords, KIND_LABEL } from "@/lib/labels";
import type { Resource } from "@/lib/types";
import { useAsync } from "@/lib/useAsync";

function ResourceCard({ r, onRate }: { r: Resource; onRate: () => void }) {
  const fit = fitWords(r.fit);
  return (
    <Card as="article" className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h3 className="text-lg font-semibold leading-snug">{r.title}</h3>
        {fit && <Chip tone={(r.fit ?? 0) >= 0.65 ? "learning" : "neutral"}>{fit}</Chip>}
      </div>
      <p className="mt-1 text-sm text-ink-soft">{r.provider} · {KIND_LABEL[r.kind] ?? r.kind} · {DIFFICULTY[r.difficulty]} · about {r.duration_hours} hours · {r.cost === "free" ? "Free" : r.cost}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">{r.skills.slice(0, 5).map((s) => <Chip key={s}>{humanize(s)}</Chip>)}</div>
      {r.verification_note && <p className="mt-2 text-xs text-growth-ink">{r.verification_note}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-career hover:underline">Open resource <ExternalLink className="h-3.5 w-3.5" aria-hidden /></a>
        <Button variant="secondary" onClick={onRate}>Rate or track</Button>
      </div>
    </Card>
  );
}

export default function ResourcesPage() {
  const [tab, setTab] = useState<"foryou" | "all">("foryou");
  const portfolio = useAsync(() => acis.careers.portfolio().catch(() => null), []);
  const careers = useAsync(() => acis.careers.list(), []);
  const catalogue = useAsync(() => acis.growth.catalogue(), []);
  const style = useAsync(() => acis.learning.preferences(), []);
  const [career, setCareer] = useState("");
  const [kind, setKind] = useState("");
  const [skill, setSkill] = useState("");
  const [rating, setRating] = useState<Resource | null>(null);

  useEffect(() => {
    if (career || !portfolio.data) return;
    const first = portfolio.data.primary ?? portfolio.data.secondary[0] ?? portfolio.data.emerging[0];
    if (first) setCareer(first.slug);
  }, [portfolio.data, career]);

  const rec = useAsync(() => (career ? acis.learning.recommended(career, 10) : Promise.resolve(null)), [career]);
  const all = useAsync(() => acis.learning.resources({ kind, skill, limit: 50 }), [kind, skill]);
  const afterRating = () => { style.reload(); rec.reload(); all.reload(); };

  return (
    <div>
      <PageHeader eyebrow="Learning model" title="Learning resources" description="Free courses, readings and projects, ranked by how well they close your skill gaps and how well they suit the way you learn." />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div>
          <Tabs label="Resource views" value={tab} onChange={setTab} tabs={[{ id: "foryou", label: "For you" }, { id: "all", label: "Browse all" }]} />
          {tab === "foryou" ? (
            <div className="space-y-4">
              <SelectField label="For which career?" value={career} onChange={(e) => setCareer(e.target.value)} placeholder="Choose a career" options={(careers.data ?? []).map((c) => ({ value: c.slug, label: c.name }))} />
              {!career ? (portfolio.data === null && !portfolio.loading ? <NeedsAssessment /> : <EmptyState title="Choose a career" description="ACIS will find resources for your skill gaps." />) : (
                <AsyncPanel state={rec} rows={3} label="Finding resources">
                  {(d) => d && (d.resources.length === 0
                    ? <EmptyState title="Nothing to recommend" description="You may already meet this career's listed skills, or you've finished the matching resources. Try another career or browse all." />
                    : <><Notice tone="info">Ranked using your skill gaps and your learning style. Rate what you try and the order improves.</Notice><div className="space-y-3">{d.resources.map((r) => <ResourceCard key={r.id} r={r} onRate={() => setRating(r)} />)}</div></>)}
                </AsyncPanel>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <SelectField label="Format" value={kind} onChange={(e) => setKind(e.target.value)} placeholder="Any format" options={Object.entries(KIND_LABEL).map(([v, l]) => ({ value: v, label: l }))} />
                <SelectField label="Skill" value={skill} onChange={(e) => setSkill(e.target.value)} placeholder="Any skill" options={(catalogue.data ?? []).map((s) => ({ value: s.slug, label: s.name }))} />
              </div>
              {all.loading && !all.data ? <LoadingBlock rows={3} label="Loading resources" /> : all.error && !all.data ? <ErrorState error={all.error} onRetry={all.reload} /> :
                all.data?.length === 0 ? <EmptyState title="No resources match" description="Try removing a filter." /> :
                <div className="space-y-3">{all.data?.map((r) => <ResourceCard key={r.id} r={r} onRate={() => setRating(r)} />)}</div>}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <Panel title={<ModelTag model="learning" />}>
            <p className="mb-4 text-sm text-ink-soft">How you learn best, from what you finish and rate. It only affects which resources ACIS picks, never your career directions.</p>
            <AsyncPanel state={style} rows={3}>{(s) => <LearningStyleBars style={s} />}</AsyncPanel>
          </Panel>
          <Notice tone="warn">Resource links go to each provider&apos;s own site. They have not all been verified yet, and ACIS says so on every card where that is true.</Notice>
        </aside>
      </div>
      <RateResource resource={rating} onClose={() => setRating(null)} onDone={afterRating} />
    </div>
  );
}

"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BookOpen, Check, ExternalLink, Hammer, Target, Trash2 } from "lucide-react";
import { NeedsAssessment } from "@/components/domain";
import { Panel, SkillBar } from "@/components/panels";
import { RateResource } from "@/components/RateResource";
import { Button, Card, Chip, EmptyState, ErrorState, LoadingBlock, Notice, PageHeader, ProgressBar, SelectField } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/cn";
import { acis } from "@/lib/endpoints";
import { formatDate } from "@/lib/format";
import { DIFFICULTY, KIND_LABEL } from "@/lib/labels";
import type { Roadmap, RoadmapItem } from "@/lib/types";
import { useAsync } from "@/lib/useAsync";

function ItemCard({ item, busy, onTick, onRate, onStart }: { item: RoadmapItem; busy: boolean; onTick: (done: boolean) => void; onRate: () => void; onStart: () => void }) {
  const Icon = item.kind === "skill" ? Target : item.kind === "resource" ? BookOpen : Hammer;
  const done = item.effective_done;
  return (
    <li className={cn("flex gap-3 rounded-md border p-4", done ? "border-ok/30 bg-ok-soft/50" : "border-line bg-card")}>
      <button type="button" role="checkbox" aria-checked={item.done} aria-label={`Mark "${item.title}" as done`} disabled={busy} onClick={() => onTick(!item.done)}
        className={cn("mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded border-2", item.done ? "border-ok bg-ok text-white" : done ? "border-ok text-ok" : "border-ink/25 hover:border-career")}>
        {(item.done || done) && <Check className="h-4 w-4" aria-hidden />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Icon className="h-4 w-4 text-ink-faint" aria-hidden />
          <p className={cn("font-medium leading-snug", done && "text-ink-soft")}>{item.title}</p>
          {item.auto_done && !item.done && <Chip tone="ok">Done automatically</Chip>}
        </div>
        {item.kind === "skill" && item.required_level !== undefined && (
          <ul className="mt-2 max-w-sm"><SkillBar skill={{ skill: item.skill ?? "", required_level: item.required_level, current_level: item.current_level ?? 0, status: item.auto_done ? "met" : (item.current_level ?? 0) > 0 ? "in_progress" : "missing" }} /></ul>
        )}
        {item.kind === "resource" && (
          <div className="mt-1.5 space-y-1.5 text-sm text-ink-soft">
            <p>{KIND_LABEL[item.resource_kind ?? ""] ?? item.resource_kind} · {DIFFICULTY[item.difficulty ?? 1]}</p>
            {item.verified === false && <p className="text-xs text-growth-ink">Link not verified yet. Please check it before relying on it.</p>}
            <div className="flex flex-wrap gap-2">
              {item.url && <a href={item.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-career hover:underline">Open <ExternalLink className="h-3.5 w-3.5" aria-hidden /></a>}
              <button type="button" onClick={onRate} className="font-semibold text-learning-ink hover:underline">Rate or update</button>
            </div>
          </div>
        )}
        {item.kind === "project" && (
          <div className="mt-1.5 space-y-1.5 text-sm text-ink-soft">
            {item.description && <p>{item.description}</p>}
            <p className="text-xs text-ink-faint">Level {item.difficulty} of 3 · about {item.est_hours} hours</p>
            {!done && <button type="button" onClick={onStart} className="font-semibold text-growth-ink hover:underline">Start this project</button>}
          </div>
        )}
      </div>
    </li>
  );
}

export default function RoadmapPage() {
  const list = useAsync(() => acis.roadmaps.list(), []);
  const portfolio = useAsync(() => acis.careers.portfolio().catch(() => null), []);
  const careers = useAsync(() => acis.careers.list(), []);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [roadmap, setRoadmap] = useState<Roadmap | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [career, setCareer] = useState("");
  const [genBusy, setGenBusy] = useState(false);
  const [genErr, setGenErr] = useState<string | null>(null);
  const [tickBusy, setTickBusy] = useState<number | null>(null);
  const [rating, setRating] = useState<{ id: number; title: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const activeId = useMemo(() => selectedId ?? list.data?.find((r) => r.active)?.id ?? list.data?.[0]?.id ?? null, [selectedId, list.data]);

  useEffect(() => {
    if (activeId === null) { setRoadmap(null); return; }
    let live = true;
    setLoadErr(null);
    acis.roadmaps.get(activeId).then((r) => live && setRoadmap(r)).catch((e) => live && setLoadErr(e instanceof ApiError ? e.message : "Could not load this roadmap."));
    return () => { live = false; };
  }, [activeId]);

  useEffect(() => {
    if (career || !portfolio.data) return;
    const first = portfolio.data.primary ?? portfolio.data.secondary[0] ?? portfolio.data.emerging[0];
    if (first) setCareer(first.slug);
  }, [portfolio.data, career]);

  async function generate() {
    if (!career) { setGenErr("Choose a career first."); return; }
    setGenBusy(true); setGenErr(null);
    try { const r = await acis.roadmaps.generate(career); setSelectedId(r.id); setRoadmap(r); list.reload(); }
    catch (e) { setGenErr(e instanceof ApiError ? e.message : "Could not build a roadmap."); }
    finally { setGenBusy(false); }
  }
  async function tick(item: RoadmapItem, done: boolean) {
    if (!roadmap) return;
    setTickBusy(item.id);
    try { setRoadmap(await acis.roadmaps.tick(roadmap.id, item.id, done)); list.reload(); }
    catch (e) { setLoadErr(e instanceof ApiError ? e.message : "Could not update that step."); }
    finally { setTickBusy(null); }
  }
  async function startProject(item: RoadmapItem) {
    try { await acis.growth.startProject({ title: item.title.replace(/^Project: /, ""), idea_id: item.ref_id }); setNotice("Project started. Track it and mark it complete on the Progress page."); }
    catch (e) { setLoadErr(e instanceof ApiError ? e.message : "Could not start that project."); }
  }
  async function remove() {
    if (!roadmap) return;
    try { await acis.roadmaps.remove(roadmap.id); setSelectedId(null); setRoadmap(null); list.reload(); }
    catch (e) { setLoadErr(e instanceof ApiError ? e.message : "Could not delete this roadmap."); }
  }

  const options = (careers.data ?? []).map((c) => ({ value: c.slug, label: c.name }));
  const noAssessment = portfolio.data === null && !portfolio.loading;
  if (noAssessment && !list.data?.length) return <><PageHeader title="Learning roadmap" /><NeedsAssessment /></>;

  return (
    <div>
      <PageHeader eyebrow="Learn & build" title="Learning roadmap" description="A step-by-step plan built from your real skill gaps for a career you choose. Each skill comes with a resource that suits how you learn and a project that proves it." />

      <Panel title="Build a roadmap" className="mb-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1"><SelectField label="Career" value={career} onChange={(e) => setCareer(e.target.value)} placeholder="Choose a career" options={options} /></div>
          <Button onClick={generate} loading={genBusy}>{roadmap ? "Rebuild roadmap" : "Build my roadmap"}</Button>
        </div>
        {genErr && <Notice tone="warn" className="mt-3">{genErr}</Notice>}
        <p className="mt-3 text-xs text-ink-faint">Choosing a career here is only for planning. It doesn&apos;t change your career directions, and you can build one for any career to try it out.</p>
      </Panel>

      {list.loading && !list.data ? <LoadingBlock rows={3} label="Loading roadmaps" /> : list.error && !list.data ? <ErrorState error={list.error} onRetry={list.reload} /> :
        !roadmap ? <EmptyState icon={<Target className="h-8 w-8" />} title="No roadmap yet" description="Choose a career above and ACIS will turn your skill gaps into an ordered plan." /> : (
          <div className="space-y-5">
            {list.data && list.data.length > 1 && (
              <div className="flex flex-wrap gap-2" role="group" aria-label="Your roadmaps">
                {list.data.map((r) => <button key={r.id} type="button" onClick={() => setSelectedId(r.id)} aria-pressed={r.id === roadmap.id}
                  className={cn("rounded-full border px-3 py-1 text-sm font-medium", r.id === roadmap.id ? "border-career bg-career-soft text-career-ink" : "border-line text-ink-soft hover:border-career/40")}>
                  {r.career.name}{r.active ? "" : " (older)"}</button>)}
              </div>
            )}
            <Card className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h2 className="text-2xl font-semibold">{roadmap.title}</h2><p className="text-xs text-ink-faint">Built {formatDate(roadmap.created_at)}{roadmap.active ? "" : " · replaced by a newer one"}</p></div>
                <Button variant="ghost" onClick={remove} aria-label="Delete this roadmap"><Trash2 className="h-4 w-4" aria-hidden />Delete</Button>
              </div>
              <div className="my-4"><ProgressBar value={roadmap.progress.done} max={roadmap.progress.total} tone="growth" label="Roadmap progress" /></div>
              <p className="text-sm text-ink-soft">{roadmap.progress.done} of {roadmap.progress.total} steps done ({roadmap.progress.percent}%). Skill, resource and project steps also tick themselves when your real progress catches up.</p>
            </Card>
            {notice && <Notice tone="success">{notice} <Link href="/progress" className="font-semibold underline">Go to Progress</Link></Notice>}
            {loadErr && <Notice tone="error">{loadErr}</Notice>}
            <ol className="space-y-3" aria-label="Roadmap steps">
              {roadmap.items.map((it) => <ItemCard key={it.id} item={it} busy={tickBusy === it.id} onTick={(d) => tick(it, d)} onRate={() => setRating({ id: it.ref_id!, title: it.title.replace(/^Study: /, "") })} onStart={() => startProject(it)} />)}
            </ol>
          </div>
        )}
      <RateResource resource={rating} onClose={() => setRating(null)} onDone={() => setNotice("Thanks. ACIS will use this to choose better resources for you.")} />
    </div>
  );
}

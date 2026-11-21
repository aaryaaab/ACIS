"use client";
import { useMemo, useState, type FormEvent } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Check, Hammer, Trophy } from "lucide-react";
import { ModelTag } from "@/components/domain";
import { AsyncPanel, Panel, Stat } from "@/components/panels";
import { Button, Chip, EmptyState, Notice, PageHeader, SelectField, TextAreaField, TextField } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { acis } from "@/lib/endpoints";
import { formatDate, humanize, monthLabel } from "@/lib/format";
import { DIFFICULTY } from "@/lib/labels";
import { useAsync } from "@/lib/useAsync";

const KINDS = [{ value: "certification", label: "Certification" }, { value: "internship", label: "Internship" }, { value: "competition", label: "Competition" }, { value: "research", label: "Research" }, { value: "milestone", label: "Other milestone" }];

export default function ProgressPage() {
  const progress = useAsync(() => acis.growth.progress(), []);
  const projects = useAsync(() => acis.growth.projects(), []);
  const ideas = useAsync(() => acis.growth.ideas({}), []);
  const achievements = useAsync(() => acis.growth.achievements(), []);
  const timeline = useAsync(() => acis.timeline({ limit: 200 }), []);
  const careers = useAsync(() => acis.careers.list(), []);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [titleErr, setTitleErr] = useState<string | null>(null);
  const [aKind, setAKind] = useState("milestone");
  const [aTitle, setATitle] = useState("");
  const [aCareer, setACareer] = useState("");
  const [aErr, setAErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = () => { progress.reload(); projects.reload(); ideas.reload(); achievements.reload(); timeline.reload(); };
  const fail = (e: unknown, fallback: string) => setMsg({ tone: "error", text: e instanceof ApiError ? e.message : fallback });

  const activity = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of timeline.data?.events ?? []) if (["project", "achievement", "skill", "learning"].includes(e.type)) m.set(e.month, (m.get(e.month) ?? 0) + 1);
    return [...m.entries()].sort().map(([month, count]) => ({ month: monthLabel(month).replace(/ \d{4}$/, (y) => ` '${y.slice(3)}`), count }));
  }, [timeline.data]);

  async function start(idea?: { id: number; title: string }) {
    if (!idea && !title.trim()) { setTitleErr("Give your project a name."); return; }
    setBusy(idea ? `idea-${idea.id}` : "custom"); setMsg(null); setTitleErr(null);
    try {
      await acis.growth.startProject(idea ? { title: idea.title, idea_id: idea.id } : { title: title.trim(), description: desc.trim() });
      if (!idea) { setTitle(""); setDesc(""); }
      setMsg({ tone: "success", text: "Project started. Mark it complete when you finish it." }); refresh();
    } catch (e) { fail(e, "Could not start the project."); } finally { setBusy(null); }
  }
  async function complete(id: number) {
    setBusy(`done-${id}`); setMsg(null);
    try {
      const r = await acis.growth.completeProject(id);
      const names = r.career_evidence_for.map((s) => careers.data?.find((c) => c.slug === s)?.name ?? humanize(s));
      setMsg({ tone: "success", text: `Well done. Your skills are updated.${names.length ? ` It also added mild evidence for: ${names.join(", ")}.` : ""}` }); refresh();
    } catch (e) { fail(e, "Could not complete the project."); } finally { setBusy(null); }
  }
  async function addAchievement(e: FormEvent) {
    e.preventDefault();
    if (!aTitle.trim()) { setAErr("Describe what you achieved."); return; }
    setBusy("ach"); setAErr(null); setMsg(null);
    try { await acis.growth.addAchievement({ kind: aKind, title: aTitle.trim(), career_slug: aCareer || null }); setATitle(""); setACareer(""); setMsg({ tone: "success", text: "Achievement added." }); refresh(); }
    catch (ex) { setAErr(ex instanceof ApiError ? ex.message : "Could not add it."); } finally { setBusy(null); }
  }

  const inProgress = projects.data?.filter((p) => p.status === "in_progress") ?? [];
  const finished = projects.data?.filter((p) => p.status === "completed") ?? [];

  return (
    <div>
      <PageHeader eyebrow="Growth model" title="Progress" description="What you have actually done: skills, projects and achievements. This is your real record, separate from what you are interested in or how you learn." />
      {msg && <Notice tone={msg.tone} className="mb-5">{msg.text}</Notice>}

      <Panel title={<ModelTag model="growth" />} className="mb-5">
        <AsyncPanel state={progress} rows={1}>{(g) => (
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            <Stat label="Skills tracked" value={g.skills_tracked} /><Stat label="Projects done" value={g.projects_completed} /><Stat label="In progress" value={g.projects_in_progress} />
            <Stat label="Achievements" value={Object.values(g.achievements).reduce((a, b) => a + b, 0)} />
          </div>
        )}</AsyncPanel>
        {activity.length > 0 && (
          <div className="mt-5 h-44" role="img" aria-label="Growth activity per month">
            <ResponsiveContainer width="100%" height="100%"><BarChart data={activity} margin={{ left: -24, right: 8 }}><CartesianGrid stroke="#E4DDD0" vertical={false} /><XAxis dataKey="month" tick={{ fontSize: 11, fill: "#47525E" }} /><YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#47525E" }} /><Tooltip /><Bar dataKey="count" name="Growth events" fill="#B96A0B" radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer>
          </div>
        )}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Projects" aside={<Hammer className="h-4 w-4 text-ink-faint" aria-hidden />}>
          <AsyncPanel state={projects} rows={2}>{() => (
            <>
              {inProgress.length > 0 && <><h3 className="eyebrow mb-2">In progress</h3><ul className="mb-4 space-y-2">{inProgress.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 rounded-md border border-line p-3"><div className="min-w-0"><p className="font-medium">{p.title}</p><p className="text-xs text-ink-faint">Started {formatDate(p.started_at)}</p></div>
                  <Button variant="secondary" loading={busy === `done-${p.id}`} onClick={() => complete(p.id)}><Check className="h-4 w-4" aria-hidden />Mark complete</Button></li>
              ))}</ul></>}
              {finished.length > 0 && <><h3 className="eyebrow mb-2">Your portfolio</h3><ul className="space-y-2">{finished.map((p) => (
                <li key={p.id} className="rounded-md border border-ok/30 bg-ok-soft/50 p-3"><p className="font-medium">{p.title}</p><p className="text-xs text-ink-faint">Completed {formatDate(p.completed_at)}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1">{p.skills.map((s) => <Chip key={s} tone="ok">{humanize(s)}</Chip>)}</div></li>
              ))}</ul></>}
              {inProgress.length === 0 && finished.length === 0 && <EmptyState icon={<Hammer className="h-7 w-7" />} title="No projects yet" description="Pick one of the ideas below, or start your own. Finished projects are the strongest evidence ACIS can learn from." />}
            </>
          )}</AsyncPanel>

          <form onSubmit={(e) => { e.preventDefault(); void start(); }} noValidate className="mt-5 space-y-3 border-t border-line pt-4">
            <h3 className="text-base font-semibold">Start your own project</h3>
            <TextField label="Project name" value={title} onChange={(e) => setTitle(e.target.value)} error={titleErr} maxLength={200} />
            <TextAreaField label="What is it? (optional)" rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={2000} />
            <Button type="submit" loading={busy === "custom"}>Start project</Button>
          </form>
        </Panel>

        <div className="space-y-5">
          <Panel title="Project ideas" aside={<span className="text-ink-faint">Easiest first</span>}>
            <AsyncPanel state={ideas} rows={2}>{(list) => list.length === 0 ? <p className="text-sm text-ink-soft">You&apos;ve started every idea in the catalogue.</p> : (
              <ul className="space-y-2.5">{list.slice(0, 6).map((i) => (
                <li key={i.id} className="rounded-md border border-line p-3.5">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-medium">{i.title}</p><p className="mt-0.5 text-sm text-ink-soft">{i.description}</p>
                    <p className="mt-1 text-xs text-ink-faint">{DIFFICULTY[i.difficulty]} · about {i.est_hours} hours{i.you_already_know ? ` · uses ${i.you_already_know} skill${i.you_already_know === 1 ? "" : "s"} you have` : ""}</p></div>
                    <Button variant="secondary" loading={busy === `idea-${i.id}`} onClick={() => start(i)} className="shrink-0">Start</Button></div>
                </li>
              ))}</ul>
            )}</AsyncPanel>
          </Panel>

          <Panel title="Achievements" aside={<Trophy className="h-4 w-4 text-ink-faint" aria-hidden />}>
            <AsyncPanel state={achievements} rows={1}>{(list) => list.length === 0 ? <p className="mb-3 text-sm text-ink-soft">Certificates, internships, competitions, research and other milestones live here.</p> : (
              <ul className="mb-4 divide-y divide-line">{list.map((a) => <li key={a.id} className="flex items-center justify-between gap-3 py-2 text-sm"><span><Chip tone="growth" className="mr-2">{humanize(a.kind)}</Chip>{a.title}</span><span className="shrink-0 text-xs text-ink-faint">{formatDate(a.date)}</span></li>)}</ul>
            )}</AsyncPanel>
            <form onSubmit={addAchievement} noValidate className="space-y-3 border-t border-line pt-4">
              <div className="grid gap-3 sm:grid-cols-2"><SelectField label="Type" value={aKind} onChange={(e) => setAKind(e.target.value)} options={KINDS} />
                <SelectField label="Related career (optional)" value={aCareer} onChange={(e) => setACareer(e.target.value)} placeholder="None" options={(careers.data ?? []).map((c) => ({ value: c.slug, label: c.name }))} /></div>
              <TextField label="What did you achieve?" value={aTitle} onChange={(e) => setATitle(e.target.value)} error={aErr} maxLength={200} />
              <Button type="submit" loading={busy === "ach"}>Add achievement</Button>
            </form>
          </Panel>
        </div>
      </div>
    </div>
  );
}

"use client";
import { Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { NeedsAssessment, ModelTag } from "@/components/domain";
import { AsyncPanel, Panel, SkillBar } from "@/components/panels";
import { Button, Chip, EmptyState, Notice, PageHeader, SelectField } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { acis } from "@/lib/endpoints";
import { humanize } from "@/lib/format";
import { SKILL_LEVELS } from "@/lib/labels";
import { useAsync } from "@/lib/useAsync";

function Skills() {
  const preset = useSearchParams().get("career") ?? "";
  const portfolio = useAsync(() => acis.careers.portfolio().catch(() => null), []);
  const careers = useAsync(() => acis.careers.list(), []);
  const mine = useAsync(() => acis.growth.skills(), []);
  const catalogue = useAsync(() => acis.growth.catalogue(), []);
  const [career, setCareer] = useState(preset);
  const gap = useAsync(() => (career ? acis.careers.skillGap(career) : Promise.resolve(null)), [career]);
  const [slug, setSlug] = useState("");
  const [level, setLevel] = useState("3");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (career || !portfolio.data) return;
    const first = portfolio.data.primary ?? portfolio.data.secondary[0] ?? portfolio.data.emerging[0];
    if (first) setCareer(first.slug);
  }, [portfolio.data, career]);

  const byCategory = useMemo(() => {
    const m = new Map<string, number[]>();
    for (const s of mine.data ?? []) m.set(s.category || "other", [...(m.get(s.category || "other") ?? []), s.level]);
    return [...m.entries()].map(([cat, lv]) => ({ category: humanize(cat), level: Math.round((lv.reduce((a, b) => a + b, 0) / lv.length) * 10) / 10 }));
  }, [mine.data]);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!slug) { setMsg({ tone: "error", text: "Choose a skill first." }); return; }
    setBusy(true); setMsg(null);
    try { await acis.growth.setSkill(slug, Number(level)); setMsg({ tone: "success", text: "Saved. Your skill gaps are updated." }); mine.reload(); gap.reload(); }
    catch (ex) { setMsg({ tone: "error", text: ex instanceof ApiError ? ex.message : "Could not save." }); } finally { setBusy(false); }
  }

  if (portfolio.data === null && !portfolio.loading && !preset) return <><PageHeader title="Skills" /><NeedsAssessment /></>;
  const order = gap.data?.skills ?? [];
  const learnFirst = new Set(order.filter((s) => s.status !== "met").slice(0, 3).map((s) => s.slug));

  return (
    <div>
      <PageHeader eyebrow="Growth model" title="Skills dashboard" description="Where you stand against what a career asks for, and the skills worth learning first. Levels run from 1 (beginner) to 5 (expert) and are set by you." />
      <div className="grid gap-5 lg:grid-cols-[3fr_2fr]">
        <Panel title="Skill gap">
          <SelectField label="Career to measure against" value={career} onChange={(e) => setCareer(e.target.value)} placeholder="Choose a career" options={(careers.data ?? []).map((c) => ({ value: c.slug, label: c.name }))} fieldClassName="mb-4" />
          {!career ? <EmptyState title="Choose a career" description="Pick one to see which skills it needs and where you stand." /> : (
            <AsyncPanel state={gap} rows={3} label="Loading skill gap">
              {(g) => g && (g.skills.length === 0 ? <p className="text-sm text-ink-soft">No skills are listed for this career yet.</p> : (
                <>
                  <p className="mb-3 text-xs text-ink-faint">{g.career}. Most important gaps first. “Learn first” marks the top three still open.</p>
                  <ul className="space-y-4">{g.skills.map((s) => (
                    <div key={s.slug} className="flex items-start gap-2">
                      <div className="flex-1"><SkillBar skill={s} /></div>
                      {learnFirst.has(s.slug) && <Chip tone="growth" className="mt-0.5 shrink-0">Learn first</Chip>}
                    </div>
                  ))}</ul>
                </>
              ))}
            </AsyncPanel>
          )}
        </Panel>

        <div className="space-y-5">
          <Panel title="Update a skill" aside={<ModelTag model="growth" />}>
            <form onSubmit={save} noValidate className="space-y-3">
              <SelectField label="Skill" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="Choose a skill" options={(catalogue.data ?? []).map((s) => ({ value: s.slug, label: s.name }))} />
              <SelectField label="Your level" value={level} onChange={(e) => setLevel(e.target.value)} options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} · ${SKILL_LEVELS[n]}` }))} hint="Be honest. This only helps ACIS plan your next steps." />
              {msg && <Notice tone={msg.tone}>{msg.text}</Notice>}
              <Button type="submit" loading={busy} className="w-full">Save level</Button>
            </form>
          </Panel>
          <Panel title="Your skill map">
            <AsyncPanel state={mine} rows={2}>
              {(rows) => rows.length === 0 ? <p className="text-sm text-ink-soft">You haven&apos;t recorded any skills yet. Add one above, or finish a project and ACIS will do it for you.</p> : (
                <>
                  <div className="h-52" role="img" aria-label="Average skill level by category">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={byCategory} margin={{ left: -20, right: 8 }}><CartesianGrid stroke="#E4DDD0" vertical={false} /><XAxis dataKey="category" tick={{ fontSize: 11, fill: "#47525E" }} /><YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={{ fontSize: 11, fill: "#47525E" }} /><Tooltip /><Bar dataKey="level" fill="#B96A0B" radius={[3, 3, 0, 0]} /></BarChart>
                    </ResponsiveContainer>
                  </div>
                  <ul className="mt-3 flex flex-wrap gap-1.5">{rows.map((s) => <Chip key={s.slug} tone="growth">{s.name} · {s.level}</Chip>)}</ul>
                </>
              )}
            </AsyncPanel>
          </Panel>
        </div>
      </div>
    </div>
  );
}

export default function SkillsPage() { return <Suspense fallback={null}><Skills /></Suspense>; }

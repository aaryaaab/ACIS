"use client";
import Link from "next/link";
import { ArrowRight, Briefcase, MessageCircle, Newspaper, PenLine } from "lucide-react";
import { ModelTag, NeedsAssessment, StageTracker } from "@/components/domain";
import { AsyncPanel, LearningStyleBars, Panel, SkillBar, Stat } from "@/components/panels";
import { PortfolioCards } from "@/components/PortfolioCards";
import { ButtonLink, Chip, EmptyState, ErrorState, Notice, ProgressBar } from "@/components/ui";
import { useAuth } from "@/lib/auth";
import { acis } from "@/lib/endpoints";
import { formatDate } from "@/lib/format";
import { useAsync } from "@/lib/useAsync";

function greeting(name: string) {
  const h = new Date().getHours();
  return `${h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"}${name ? `, ${name.split(" ")[0]}` : ""}`;
}

export default function Dashboard() {
  const { user, profile } = useAuth();
  const portfolio = useAsync(() => acis.careers.portfolio(), []);
  const style = useAsync(() => acis.learning.preferences(), []);
  const progress = useAsync(() => acis.growth.progress(), []);
  const roadmaps = useAsync(() => acis.roadmaps.list(), []);
  const prompt = useAsync(() => acis.reflections.prompt(), []);
  const intel = useAsync(() => acis.intelligence.list({ limit: 2 }), []);
  const opps = useAsync(() => acis.opportunities.list({ limit: 2 }), []);
  const primarySlug = portfolio.data?.primary?.slug ?? portfolio.data?.emerging?.[0]?.slug;
  const gap = useAsync(() => (primarySlug ? acis.careers.skillGap(primarySlug) : Promise.resolve(null)), [primarySlug]);
  const exploring = portfolio.data ? !portfolio.data.recommendation_allowed : false;
  const ideas = useAsync(() => (exploring ? acis.growth.ideas({ max_difficulty: 1 }) : Promise.resolve(null)), [exploring]);
  const activeRoadmap = roadmaps.data?.find((r) => r.active);

  return (
    <div className="space-y-6">
      <header className="animate-fade-up">
        <p className="eyebrow mb-1.5">Dashboard</p>
        <h1 className="text-3xl font-semibold sm:text-4xl">{greeting(user?.full_name ?? "")}</h1>
        {profile && <div className="mt-5 max-w-2xl"><StageTracker stage={profile.stage} /></div>}
      </header>

      {portfolio.error?.status === 409 ? <NeedsAssessment /> : (
        <div className="grid gap-5 lg:grid-cols-3">
          <Panel title="Your career directions" className="lg:col-span-2" aside={<Link href="/careers" className="font-medium text-career hover:underline">See details</Link>}>
            <AsyncPanel state={portfolio} rows={3} label="Loading career directions">
              {(p) => (
                <>
                  {p.explore_message && <Notice tone="info" className="mb-3">{p.explore_message}</Notice>}
                  <PortfolioCards portfolio={p} href="/careers" compact />
                  <p className="mt-3 text-xs text-ink-faint">Confidence reflects how much evidence points that way. It is not a prediction.</p>
                </>
              )}
            </AsyncPanel>
          </Panel>

          <div className="space-y-5">
            <Panel title="Reflection" aside={<PenLine className="h-4 w-4 text-ink-faint" aria-hidden />}>
              <AsyncPanel state={prompt} rows={1} label="Loading reflection prompt">
                {(r) => r.due ? (
                  <>
                    <p className="text-sm leading-relaxed text-ink-soft">{r.days_since_last === null ? "You haven't reflected yet. It only takes a few minutes." : `It has been ${r.days_since_last} days since your last reflection.`}</p>
                    <p className="mt-2 font-display text-lg leading-snug">{r.prompts[0]?.question}</p>
                    <ButtonLink href="/reflections" className="mt-3 w-full">Reflect now</ButtonLink>
                  </>
                ) : <p className="text-sm leading-relaxed text-ink-soft">Your next reflection is due in about {r.next_due_in_days} days. You can always write a journal entry sooner.</p>}
              </AsyncPanel>
            </Panel>
            <Panel title="Ask your mentor" aside={<MessageCircle className="h-4 w-4 text-ink-faint" aria-hidden />}>
              <p className="text-sm leading-relaxed text-ink-soft">Compare two careers, ask why something was suggested, or talk through a doubt.</p>
              <ButtonLink href="/mentor" variant="secondary" className="mt-3 w-full">Open the mentor</ButtonLink>
            </Panel>
          </div>
        </div>
      )}

      {exploring && (
        <Panel title="Try something small" aside={<Chip tone="growth">Explore stage</Chip>}>
          <p className="mb-3 text-sm text-ink-soft">The best way to find out what you enjoy is to try it. Pick one, then write a short reflection about how it felt.</p>
          <AsyncPanel state={ideas} rows={1}>
            {(list) => list && list.length ? (
              <ul className="grid gap-3 sm:grid-cols-2">{list.slice(0, 2).map((i) => (
                <li key={i.id} className="rounded-md border border-line p-4"><p className="font-semibold">{i.title}</p><p className="mt-1 text-sm text-ink-soft">{i.description}</p><p className="mt-2 text-xs text-ink-faint">About {i.est_hours} hours</p></li>
              ))}</ul>
            ) : <p className="text-sm text-ink-soft">No new beginner projects right now.</p>}
          </AsyncPanel>
          <Link href="/progress" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-career hover:underline">Start one <ArrowRight className="h-4 w-4" aria-hidden /></Link>
        </Panel>
      )}

      <section aria-labelledby="models-h">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="models-h" className="text-xl font-semibold">Your three models</h2>
          <p className="text-sm text-ink-soft">Tracked separately, so one never distorts another.</p>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          <Panel title={<ModelTag model="career" />}>
            <p className="mb-3 text-sm text-ink-soft">Which directions fit you?</p>
            <AsyncPanel state={portfolio} rows={1}>{(p) => {
              const top = p.primary ?? p.emerging[0];
              return top ? <><p className="font-display text-xl font-semibold">{top.career}</p><p className="mt-0.5 text-xs text-ink-faint">{p.primary ? "Current primary direction" : "Worth exploring"}</p></> : <p className="text-sm text-ink-soft">Nothing yet.</p>;
            }}</AsyncPanel>
          </Panel>
          <Panel title={<ModelTag model="learning" />}>
            <p className="mb-3 text-sm text-ink-soft">How do you learn best?</p>
            <AsyncPanel state={style} rows={1}>{(s) => <LearningStyleBars style={s} only={["project", "theory", "long_sessions"]} />}</AsyncPanel>
            <Link href="/resources" className="mt-3 inline-block text-sm font-medium text-learning-ink hover:underline">Resources for you</Link>
          </Panel>
          <Panel title={<ModelTag model="growth" />}>
            <p className="mb-3 text-sm text-ink-soft">What have you actually done?</p>
            <AsyncPanel state={progress} rows={1}>{(g) => (
              <div className="grid grid-cols-2 gap-4"><Stat label="Skills" value={g.skills_tracked} /><Stat label="Projects done" value={g.projects_completed} /></div>
            )}</AsyncPanel>
            <Link href="/progress" className="mt-3 inline-block text-sm font-medium text-growth-ink hover:underline">See your progress</Link>
          </Panel>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Skill progress" aside={primarySlug && <Link href="/skills" className="font-medium text-career hover:underline">All skills</Link>}>
          <AsyncPanel state={gap} rows={2} label="Loading skills">
            {(g) => g && g.skills.length ? (
              <><p className="mb-3 text-xs text-ink-faint">Skills for {g.career}, most important first</p><ul className="space-y-3.5">{g.skills.slice(0, 5).map((s) => <SkillBar key={s.slug} skill={s} />)}</ul></>
            ) : <EmptyState title="No skills to show yet" description="Once a direction shows up, you'll see which skills it needs and where you stand." />}
          </AsyncPanel>
        </Panel>

        <Panel title="Current roadmap" aside={<Link href="/roadmap" className="font-medium text-career hover:underline">Open</Link>}>
          <AsyncPanel state={roadmaps} rows={1} label="Loading roadmap">
            {() => activeRoadmap ? (
              <>
                <p className="font-display text-lg font-semibold">{activeRoadmap.title}</p>
                <div className="my-3"><ProgressBar value={activeRoadmap.progress.done} max={activeRoadmap.progress.total} tone="growth" label="Roadmap progress" /></div>
                <p className="text-sm text-ink-soft">{activeRoadmap.progress.done} of {activeRoadmap.progress.total} steps done</p>
              </>
            ) : (
              <>
                <p className="text-sm leading-relaxed text-ink-soft">{exploring ? "Roadmaps begin once you are past the Explore stage. For now, try small projects." : "You don't have a roadmap yet. ACIS builds one from your skill gaps for any career you choose."}</p>
                {!exploring && <ButtonLink href="/roadmap" variant="secondary" className="mt-3">Build a roadmap</ButtonLink>}
              </>
            )}
          </AsyncPanel>
        </Panel>

        <Panel title="Latest career intelligence" aside={<Newspaper className="h-4 w-4 text-ink-faint" aria-hidden />}>
          <AsyncPanel state={intel} rows={1} label="Loading updates">
            {(d) => d.items.length ? (
              <ul className="space-y-3">{d.items.map((i) => (
                <li key={i.id}><a href={i.url} target="_blank" rel="noopener noreferrer" className="font-medium text-career hover:underline">{i.title}</a>
                  <p className="text-xs text-ink-faint">{i.source?.name ?? "Unknown source"} · retrieved {formatDate(i.retrieved_on)}</p></li>
              ))}</ul>
            ) : <p className="text-sm leading-relaxed text-ink-soft">{d.message || "Nothing saved yet."}</p>}
          </AsyncPanel>
          <Link href="/intelligence" className="mt-3 inline-block text-sm font-medium text-career hover:underline">View all</Link>
        </Panel>

        <Panel title="Opportunities" aside={<Briefcase className="h-4 w-4 text-ink-faint" aria-hidden />}>
          <AsyncPanel state={opps} rows={1} label="Loading opportunities">
            {(d) => d.items.length ? (
              <ul className="space-y-3">{d.items.map((o) => (
                <li key={o.id}><a href={o.url} target="_blank" rel="noopener noreferrer" className="font-medium text-career hover:underline">{o.title}</a>
                  <p className="text-xs text-ink-faint">{o.provider} · {o.deadline ? `deadline ${formatDate(o.deadline)}` : "no deadline listed"}</p></li>
              ))}</ul>
            ) : <p className="text-sm leading-relaxed text-ink-soft">{d.message || "Nothing saved yet."}</p>}
          </AsyncPanel>
          <Link href="/opportunities" className="mt-3 inline-block text-sm font-medium text-career hover:underline">View all</Link>
        </Panel>
      </div>

      {(portfolio.error && portfolio.error.status !== 409) && <ErrorState error={portfolio.error} onRetry={portfolio.reload} />}
    </div>
  );
}

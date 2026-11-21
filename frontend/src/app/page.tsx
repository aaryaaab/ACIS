import Link from "next/link";
import { ArrowRight, BookMarked, Brain, Compass, History, Lock, MessageCircle, ShieldCheck, Target, Telescope } from "lucide-react";
import { ConfidencePips, Mark, Wordmark } from "@/components/domain";
import { LandingAuthButtons, LandingNavActions } from "@/components/LandingParts";
import { ButtonLink } from "@/components/ui";
import { STAGES } from "@/lib/format";

const STEPS = [
  { n: "01", t: "Tell us about you", d: "Your class or year, marks, interests and how you like to work. Takes about ten minutes, and you can retake it any time." },
  { n: "02", t: "See directions, with honest confidence", d: "A primary, secondary and emerging direction, each labelled High, Moderate or Emerging, never a fake percentage." },
  { n: "03", t: "Learn and build", d: "A roadmap built from your real skill gaps, with resources that suit how you learn and projects that prove it." },
  { n: "04", t: "Reflect and adapt", d: "Projects, reflections and journal entries slowly shape your profile. No single click or bad week can flip it." },
];

const MODELS = [
  { k: "career", name: "Career model", q: "Which directions fit you?", d: "Built from interests, aptitude, projects, competitions and reflections. It moves slowly and needs repeated evidence.", cls: "border-career/30 bg-career-soft text-career-ink", dot: "bg-career" },
  { k: "learning", name: "Learning model", q: "How do you learn best?", d: "Built from what you finish, abandon and rate: videos or reading, theory or hands-on, short or long sessions.", cls: "border-learning/30 bg-learning-soft text-learning-ink", dot: "bg-learning" },
  { k: "growth", name: "Growth model", q: "What have you actually done?", d: "Built from skills gained, projects completed, certifications and milestones. Your real progress.", cls: "border-growth/30 bg-growth-soft text-growth-ink", dot: "bg-growth" },
];

const FEATURES = [
  { icon: MessageCircle, t: "A mentor that remembers", d: "Compare careers, ask why something was suggested, and talk through doubts. It uses your own saved history and never pressures a choice." },
  { icon: History, t: "A timeline of how you change", d: "Your first project, the club you joined, the hackathon, the moment an interest grew, all in one honest timeline." },
  { icon: Target, t: "Skill gaps that are specific", d: "For any career, see which skills you already meet, which you are building and which are missing, in priority order." },
  { icon: BookMarked, t: "Memory you control", d: "See exactly what ACIS remembers about you. Edit it, delete it, or download all of it." },
  { icon: Telescope, t: "Sourced career intelligence", d: "Every update shows where it came from and when it was retrieved. If nothing is saved yet, it says so." },
  { icon: Lock, t: "Private by design", d: "Journals are visible only to you. Anything used for research is anonymous and opt-in." },
];

export default function Landing() {
  return (
    <div>
      <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur">
        <div className="page-wrap flex items-center justify-between py-3">
          <Link href="/" aria-label="ACIS home"><Wordmark /></Link>
          <nav aria-label="Sections" className="hidden items-center gap-7 text-sm font-medium text-ink-soft md:flex">
            <a href="#models" className="hover:text-ink">Three models</a>
            <a href="#how" className="hover:text-ink">How it works</a>
            <a href="#principles" className="hover:text-ink">Principles</a>
          </nav>
          <div className="flex items-center gap-2"><LandingNavActions /></div>
        </div>
      </header>

      <section className="page-wrap grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="animate-fade-up">
          <p className="eyebrow mb-4">Adaptive Career Intelligence System · for students in India</p>
          <h1 className="text-5xl font-semibold leading-[1.05] sm:text-6xl">Don&apos;t just choose a career. <span className="text-career">Build one.</span></h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-ink-soft">
            Most career tools give you a quiz result and forget you. ACIS keeps learning about your interests, strengths and projects over time, explains every suggestion, and never pushes a decision you are not ready for.
          </p>
          <div className="mt-8 flex flex-wrap gap-3"><LandingAuthButtons size="lg" /></div>
          <p className="mt-4 text-sm text-ink-faint">Free to use. Need an answer quickly? <Link href="/signup?mode=rapid" className="font-medium text-career underline-offset-2 hover:underline">Try Rapid Decision Mode</Link>.</p>
        </div>

        <figure className="animate-fade-up [animation-delay:120ms]" aria-label="Example career profile">
          <div className="card p-5 shadow-lift">
            <div className="mb-4 flex items-center justify-between">
              <p className="eyebrow">Career directions</p>
              <span className="rounded-full bg-growth-soft px-2.5 py-0.5 text-[11px] font-semibold text-growth-ink">Illustrative example</span>
            </div>
            <div className="space-y-3">
              {[{ r: "Primary", n: "Software Engineer", l: "moderate" as const }, { r: "Secondary", n: "Data Scientist", l: "moderate" as const }, { r: "Emerging", n: "UI / UX Designer", l: "emerging" as const }].map((x) => (
                <div key={x.n} className="flex items-center justify-between gap-3 rounded-md border border-line bg-paper px-4 py-3">
                  <div><p className="text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{x.r}</p><p className="font-display text-lg font-semibold">{x.n}</p></div>
                  <ConfidencePips level={x.l} />
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-md bg-career-soft px-4 py-3 text-sm leading-relaxed text-career-ink">
              <p className="font-semibold">Why this?</p>
              <p>You rated technology and mathematics highly and your logical reasoning results are strong. One finished project would strengthen this.</p>
            </div>
          </div>
          <figcaption className="mt-3 text-center text-xs text-ink-faint">A made-up example to show the format. Not a real student.</figcaption>
        </figure>
      </section>

      <section aria-label="Six stages" className="border-y border-line bg-card/60">
        <div className="page-wrap py-8">
          <p className="eyebrow mb-4 text-center">One companion across six stages</p>
          <ol className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {STAGES.map((s, i) => (
              <li key={s.key} className="border-t-2 border-career/60 pt-3">
                <p className="text-xs font-semibold text-ink-faint">{String(i + 1).padStart(2, "0")}</p>
                <p className="font-display text-xl font-semibold">{s.label}</p>
                <p className="text-sm text-ink-soft">{s.hint}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="models" className="page-wrap py-16 sm:py-24">
        <div className="max-w-2xl">
          <p className="eyebrow mb-3">What makes ACIS different</p>
          <h2 className="text-4xl font-semibold leading-tight">Three models, kept completely apart</h2>
          <p className="mt-4 text-lg leading-relaxed text-ink-soft">What you are interested in, how you learn, and what you have achieved are different things. Mixing them is how most tools go wrong.</p>
        </div>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {MODELS.map((m) => (
            <article key={m.k} className={`rounded-lg border p-6 ${m.cls}`}>
              <span className={`mb-4 block h-2.5 w-2.5 rounded-full ${m.dot}`} aria-hidden />
              <h3 className="text-xl font-semibold">{m.name}</h3>
              <p className="mt-0.5 text-sm font-semibold opacity-80">{m.q}</p>
              <p className="mt-3 text-[15px] leading-relaxed text-ink-soft">{m.d}</p>
            </article>
          ))}
        </div>
        <div className="card mt-6 grid gap-6 p-6 sm:p-8 md:grid-cols-[auto_1fr] md:items-center">
          <Brain className="h-8 w-8 text-career" aria-hidden />
          <div>
            <p className="font-display text-xl font-semibold">What this looks like in practice</p>
            <p className="mt-2 leading-relaxed text-ink-soft">
              You love AI but give up on a long, theoretical course. ACIS does <strong className="text-ink">not</strong> decide you are less interested in AI. Your interest stays put. What changes is how it teaches you: fewer long theory videos, more hands-on projects.
            </p>
          </div>
        </div>
      </section>

      <section id="how" className="bg-ink py-16 text-paper sm:py-24">
        <div className="page-wrap">
          <h2 className="max-w-xl text-4xl font-semibold leading-tight !text-paper">How it works</h2>
          <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <li key={s.n}>
                <p className="font-display text-3xl text-[#E8A64C]">{s.n}</p>
                <h3 className="mt-2 text-lg font-semibold !text-paper">{s.t}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-paper/70">{s.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="page-wrap py-16 sm:py-24">
        <h2 className="max-w-xl text-4xl font-semibold leading-tight">Everything in one calm place</h2>
        <div className="mt-10 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, t, d }) => (
            <div key={t}>
              <Icon className="mb-3 h-6 w-6 text-career" aria-hidden />
              <h3 className="text-lg font-semibold">{t}</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-ink-soft">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="principles" className="border-t border-line bg-card/60 py-16 sm:py-20">
        <div className="page-wrap grid gap-10 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <ShieldCheck className="mb-4 h-8 w-8 text-ok" aria-hidden />
            <h2 className="text-4xl font-semibold leading-tight">What ACIS will never do</h2>
          </div>
          <ul className="space-y-4 text-[15px] leading-relaxed text-ink-soft">
            {[
              ["Guarantee anything.", "No promises about jobs, salaries, marks or admissions."],
              ["Make up opportunities or news.", "Internships, scholarships and updates only appear with a source, a link and a verification date."],
              ["Force a choice on you.", "If you are in the Explore stage, you get directions to try, not a verdict."],
              ["Read your mind.", "ACIS does not guess your mood, health or personality from what you write."],
              ["Hide how it decides.", "Every suggestion explains why, and what would change it."],
            ].map(([a, b]) => (
              <li key={a} className="flex gap-3"><Compass className="mt-0.5 h-5 w-5 shrink-0 text-career" aria-hidden /><p><strong className="text-ink">{a}</strong> {b}</p></li>
            ))}
          </ul>
        </div>
      </section>

      <section className="page-wrap py-16 text-center sm:py-20">
        <Mark size={44} />
        <h2 className="mx-auto mt-4 max-w-2xl text-4xl font-semibold leading-tight">Start with what you know today</h2>
        <p className="mx-auto mt-3 max-w-lg text-ink-soft">You do not need a plan yet. You only need to start.</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3"><ButtonLink href="/signup" className="px-6 py-3 text-base">Create your free account <ArrowRight className="h-4 w-4" aria-hidden /></ButtonLink></div>
      </section>

      <footer className="border-t border-line py-8">
        <div className="page-wrap flex flex-col justify-between gap-3 text-sm text-ink-faint sm:flex-row">
          <Wordmark />
          <p className="max-w-xl">ACIS is an academic project. Its suggestions are guidance to help you think, not professional counselling and not a guarantee of any outcome.</p>
        </div>
      </footer>
    </div>
  );
}

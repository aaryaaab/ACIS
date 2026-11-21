"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { PolarAngleAxis, PolarGrid, Radar, RadarChart, ResponsiveContainer } from "recharts";
import { ArrowRight } from "lucide-react";
import { PortfolioCards } from "@/components/PortfolioCards";
import { Button, ButtonLink, Card, Chip, ErrorState, LoadingBlock, Notice, ProgressBar, Scale } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { acis } from "@/lib/endpoints";
import { humanize } from "@/lib/format";
import { cn } from "@/lib/cn";
import type { AssessmentQuestions, AssessmentResult } from "@/lib/types";
import { useAsync } from "@/lib/useAsync";

type Answers = { interests: Record<string, number>; aptitude: Record<string, number>; creative: Record<string, number>; personality: Record<string, number> };
const empty = (): Answers => ({ interests: {}, aptitude: {}, creative: {}, personality: {} });
const DRAFT = "acis_assessment_draft";
const STEPS = ["intro", "interests", "reasoning1", "reasoning2", "style", "review"] as const;
const LABELS: Record<(typeof STEPS)[number], string> = { intro: "Before you start", interests: "What interests you", reasoning1: "Reasoning (1 of 2)", reasoning2: "Reasoning (2 of 2)", style: "How you work", review: "Review and submit" };

function Result({ result, rapid }: { result: AssessmentResult; rapid: boolean }) {
  const radar = Object.entries(result.aptitude).map(([k, v]) => ({ skill: humanize(k), value: Math.round(v * 100) }));
  const { portfolio } = result;
  return (
    <div className="animate-fade-up space-y-8">
      <div>
        <p className="eyebrow mb-2">{rapid ? "Rapid Decision results" : "Your starting picture"}</p>
        <h1 className="text-4xl font-semibold">{portfolio.recommendation_allowed ? "Here is where you stand today" : "Directions worth exploring"}</h1>
        <p className="mt-3 max-w-2xl text-ink-soft">
          {portfolio.recommendation_allowed
            ? "This is a starting point based on one assessment, so confidence is at most Moderate. It strengthens as you build projects and reflect."
            : "You are in the Explore stage, so ACIS isn't picking a career for you. These are directions to try out, and a good first step is a small project in one or two of them."}
        </p>
      </div>
      <PortfolioCards portfolio={portfolio} />

      {result.rapid && (
        <Card className="space-y-5 p-5 sm:p-6">
          <h2 className="text-2xl font-semibold">Your immediate plan</h2>
          {[result.rapid.primary, ...result.rapid.secondary].map((d, i) => (
            <div key={d.career} className={cn("space-y-3", i > 0 && "border-t border-line pt-5")}>
              <div className="flex flex-wrap items-center gap-2"><h3 className="text-lg font-semibold">{d.career}</h3><Chip tone={i === 0 ? "career" : "neutral"}>{i === 0 ? "Primary" : "Secondary"}</Chip></div>
              <p className="text-[15px] leading-relaxed text-ink-soft">{d.pathway}</p>
              {d.degrees.length > 0 && (
                <ul className="space-y-1 text-sm text-ink-soft">
                  {d.degrees.map((g) => <li key={g.name}><strong className="text-ink">{g.name}</strong>{g.entrance_exams ? ` · entrance: ${g.entrance_exams}` : ""}</li>)}
                </ul>
              )}
              {d.first_skills.length > 0 && <p className="text-sm text-ink-soft">First skills to build: <strong className="text-ink">{d.first_skills.join(", ")}</strong></p>}
            </div>
          ))}
          <div className="border-t border-line pt-5">
            <h3 className="mb-2 text-lg font-semibold">Next steps</h3>
            <ol className="list-decimal space-y-1.5 pl-5 text-[15px] leading-relaxed text-ink-soft">{result.rapid.next_steps.map((s) => <li key={s}>{s}</li>)}</ol>
          </div>
          <Notice tone="info">{result.rapid.note} Always check entrance exam dates on the official websites.</Notice>
        </Card>
      )}

      <Card className="p-5 sm:p-6">
        <h2 className="text-xl font-semibold">Your reasoning results</h2>
        <p className="mt-1 text-sm text-ink-soft">Short screening questions, not a validated test. ACIS uses them as one kind of evidence among many.</p>
        <div className="mx-auto mt-2 h-64 max-w-sm" aria-label="Reasoning results chart" role="img">
          <ResponsiveContainer width="100%" height="100%">
            <RadarChart data={radar} outerRadius="72%"><PolarGrid stroke="#E4DDD0" /><PolarAngleAxis dataKey="skill" tick={{ fill: "#47525E", fontSize: 12 }} /><Radar dataKey="value" stroke="#26418F" fill="#26418F" fillOpacity={0.25} /></RadarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="flex flex-wrap gap-3">
        <ButtonLink href="/dashboard">Go to your dashboard <ArrowRight className="h-4 w-4" aria-hidden /></ButtonLink>
        <ButtonLink href="/mentor" variant="secondary">Ask the mentor why</ButtonLink>
      </div>
    </div>
  );
}

function Assessment() {
  const rapid = useSearchParams().get("mode") === "rapid";
  const { refresh } = useAuth();
  const q = useAsync<AssessmentQuestions>(() => acis.assessment.questions(), []);
  const [step, setStep] = useState(0);
  const [a, setA] = useState<Answers>(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warn, setWarn] = useState<string | null>(null);
  const [result, setResult] = useState<AssessmentResult | null>(null);

  useEffect(() => { try { const d = sessionStorage.getItem(DRAFT); if (d) setA({ ...empty(), ...JSON.parse(d) }); } catch { /* ignore */ } }, []);
  useEffect(() => { try { sessionStorage.setItem(DRAFT, JSON.stringify(a)); } catch { /* ignore */ } }, [a]);
  useEffect(() => { window.scrollTo?.({ top: 0 }); }, [step]);

  const questions = q.data;
  const half = useMemo(() => Math.ceil((questions?.aptitude.length ?? 0) / 2), [questions]);
  const name = STEPS[step];
  const answered = (r: Record<string, number>) => Object.keys(r).length;

  function next() {
    setWarn(null);
    if (name === "interests" && questions && answered(a.interests) < questions.interests.length) {
      setWarn(`Please rate all ${questions.interests.length} areas. ${questions.interests.length - answered(a.interests)} left.`);
      return;
    }
    setStep((s) => s + 1);
  }

  async function submit() {
    if (!questions) return;
    setBusy(true); setError(null);
    const body = { interests: a.interests, aptitude_answers: a.aptitude, creative: a.creative, personality: a.personality };
    try {
      const r = rapid ? await acis.assessment.rapid(body) : await acis.assessment.submit(body);
      try { sessionStorage.removeItem(DRAFT); } catch { /* ignore */ }
      await refresh();
      setResult(r);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not submit the assessment. Please try again.");
    } finally { setBusy(false); }
  }

  if (result) return <Result result={result} rapid={rapid} />;
  if (q.loading) return <LoadingBlock rows={4} label="Loading questions" />;
  if (q.error || !questions) return <ErrorState error={q.error ?? "No questions were returned."} onRetry={q.reload} />;

  const missingReasoning = questions.aptitude.length - answered(a.aptitude);
  const missingStyle = questions.personality.length + questions.creative.length - answered(a.personality) - answered(a.creative);

  return (
    <div className="animate-fade-up">
      <p className="eyebrow mb-2">{rapid ? "Rapid Decision Mode" : "Assessment"} · step {step + 1} of {STEPS.length}</p>
      <h1 className="text-4xl font-semibold">{LABELS[name]}</h1>
      <div className="my-5"><ProgressBar value={step + 1} max={STEPS.length} label="Assessment progress" /></div>
      {warn && <Notice tone="warn" className="mb-4">{warn}</Notice>}

      {name === "intro" && (
        <Card className="space-y-4 p-5 text-[15px] leading-relaxed text-ink-soft sm:p-6">
          <p>{rapid ? "Rapid Decision Mode uses the same questions, then gives you primary and secondary directions, education pathways and next steps straight away. Afterwards ACIS carries on as your long-term mentor." : "This takes about 10 minutes. There are three parts: what interests you, some short reasoning questions, and how you like to work."}</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>There are no wrong answers in the interest and style sections. Answer honestly, not impressively.</li>
            <li>The reasoning questions are short screening items, not an exam. Skipping some is okay.</li>
            <li>Nothing here labels you. Your results are one piece of evidence, and you can retake this at any time.</li>
          </ul>
          <p className="text-sm text-ink-faint">Your progress is kept on this device while you work, so a refresh won&apos;t lose your answers.</p>
        </Card>
      )}

      {name === "interests" && (
        <Card className="space-y-6 p-5 sm:p-6">
          <p className="text-sm text-ink-soft">How much would you enjoy spending time on each of these? 1 is not at all, 5 is a lot.</p>
          {questions.interests.map((it) => (
            <Scale key={it.domain} name={`i-${it.domain}`} legend={it.text} labels={["Not at all", "A lot"]} value={a.interests[it.domain]} onChange={(v) => setA((p) => ({ ...p, interests: { ...p.interests, [it.domain]: v } }))} />
          ))}
        </Card>
      )}

      {(name === "reasoning1" || name === "reasoning2") && (
        <div className="space-y-4">
          {questions.aptitude.slice(name === "reasoning1" ? 0 : half, name === "reasoning1" ? half : undefined).map((it, i) => (
            <Card key={it.id} className="p-5">
              <fieldset>
                <legend className="mb-3 text-[15px] font-medium leading-snug">{(name === "reasoning1" ? 0 : half) + i + 1}. {it.text}</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {it.options.map((opt, idx) => (
                    <label key={idx} className={cn("flex cursor-pointer items-center gap-3 rounded-md border px-3.5 py-2.5 text-sm focus-within:ring-2 focus-within:ring-career",
                      a.aptitude[it.id] === idx ? "border-career bg-career-soft font-medium text-career-ink" : "border-line bg-card hover:border-career/40")}>
                      <input type="radio" className="sr-only" name={`q-${it.id}`} checked={a.aptitude[it.id] === idx} onChange={() => setA((p) => ({ ...p, aptitude: { ...p.aptitude, [it.id]: idx } }))} />
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-current text-xs font-semibold" aria-hidden>{String.fromCharCode(65 + idx)}</span>{opt}
                    </label>
                  ))}
                </div>
              </fieldset>
            </Card>
          ))}
        </div>
      )}

      {name === "style" && (
        <Card className="space-y-6 p-5 sm:p-6">
          <p className="text-sm text-ink-soft">How much does each statement describe you? 1 is not me, 5 is very me.</p>
          {[...questions.creative, ...questions.personality].map((it) => {
            const isCreative = questions.creative.some((c) => c.id === it.id);
            const key = isCreative ? "creative" : "personality";
            return <Scale key={it.id} name={it.id} legend={it.text} labels={["Not me", "Very me"]} value={a[key][it.id]} onChange={(v) => setA((p) => ({ ...p, [key]: { ...p[key], [it.id]: v } }))} />;
          })}
        </Card>
      )}

      {name === "review" && (
        <Card className="space-y-4 p-5 sm:p-6">
          <dl className="grid gap-3 text-sm sm:grid-cols-3">
            <div><dt className="text-ink-faint">Interests rated</dt><dd className="text-lg font-semibold">{answered(a.interests)} of {questions.interests.length}</dd></div>
            <div><dt className="text-ink-faint">Reasoning answered</dt><dd className="text-lg font-semibold">{answered(a.aptitude)} of {questions.aptitude.length}</dd></div>
            <div><dt className="text-ink-faint">Style statements</dt><dd className="text-lg font-semibold">{questions.personality.length + questions.creative.length - missingStyle} of {questions.personality.length + questions.creative.length}</dd></div>
          </dl>
          {missingReasoning > 0 && <Notice tone="warn">{missingReasoning} reasoning question{missingReasoning === 1 ? "" : "s"} unanswered. Blank answers count as incorrect, so go back if you&apos;d like to try them.</Notice>}
          {missingStyle > 0 && <Notice tone="info">Unanswered style statements are treated as neutral.</Notice>}
          {error && <Notice tone="error">{error}</Notice>}
        </Card>
      )}

      <div className="mt-6 flex items-center justify-between">
        <Button variant="ghost" onClick={() => { setWarn(null); setStep((s) => Math.max(0, s - 1)); }} disabled={step === 0 || busy}>Back</Button>
        {name === "review"
          ? <Button onClick={submit} loading={busy}>{rapid ? "Get my directions" : "See my results"}</Button>
          : <Button onClick={next}>{name === "intro" ? "Begin" : "Continue"}</Button>}
      </div>
      {step === 0 && <p className="mt-6 text-sm text-ink-faint">Already did this? <Link href="/dashboard" className="font-medium text-career hover:underline">Go to your dashboard</Link>.</p>}
    </div>
  );
}

export default function AssessmentPage() {
  return <Suspense fallback={null}><Assessment /></Suspense>;
}

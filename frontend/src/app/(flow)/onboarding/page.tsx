"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { ArrowRight, Zap, ListChecks } from "lucide-react";
import { Button, Card, Chip, Notice, ProgressBar, SelectField, TextAreaField, TextField } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { acis } from "@/lib/endpoints";
import { ageFromDob, EDUCATION_LEVELS, STAGES } from "@/lib/format";
import { emptyForm, stageFor, SUBJECTS, toPayload, validateStep, type FormErrors, type OnboardingForm } from "@/lib/onboarding";
import { cn } from "@/lib/cn";

const STEP_TITLES = ["About you", "Your marks", "Goals and preferences", "Review"];

function Onboarding() {
  const { profile, refresh } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const rapid = params.get("mode") === "rapid";
  const editing = params.get("edit") === "1";
  const [step, setStep] = useState(0);
  const [f, setF] = useState<OnboardingForm>(emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [prefilled, setPrefilled] = useState(false);

  // Editing: pre-fill from the saved profile so nothing (especially marks) is lost on re-submit.
  useEffect(() => {
    if (!editing || prefilled || !profile) return;
    setF({
      dob: profile.date_of_birth ?? "", education: profile.education_level, institution: profile.institution, city: profile.city,
      marks: Object.fromEntries((profile.academics ?? []).map((a) => [a.subject, String(a.score_percent)])),
      goal: profile.long_term_goal, workStyle: profile.lifestyle?.work_style ?? "", environment: profile.lifestyle?.environment ?? "",
      priority: profile.lifestyle?.priority ?? "", money: profile.financial_context, guardian: profile.is_minor,
    });
    setPrefilled(true);
  }, [editing, prefilled, profile]);

  const set = <K extends keyof OnboardingForm>(k: K, v: OnboardingForm[K]) => setF((p) => ({ ...p, [k]: v }));
  const isMinor = f.dob ? ageFromDob(f.dob) < 18 : false;
  const stage = stageFor(f.education);

  function next() {
    const e = validateStep(step, f);
    setErrors(e);
    if (Object.keys(e).length === 0) setStep((s) => s + 1);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const err = validateStep(3, f);
    setErrors(err);
    if (Object.keys(err).length) return;
    setBusy(true);
    setError(null);
    try {
      await acis.profile.onboard(toPayload(f));
      await refresh();
      if (editing) router.replace("/profile");
      else setDone(true);
    } catch (ex) {
      setError(ex instanceof ApiError ? ex.message : "Could not save your details. Please try again.");
    } finally { setBusy(false); }
  }

  if (done) {
    return (
      <div className="animate-fade-up">
        <p className="eyebrow mb-2">You&apos;re in</p>
        <h1 className="text-4xl font-semibold">How would you like to begin?</h1>
        <p className="mt-3 text-ink-soft">Both options give you career directions with honest confidence levels. You can always do the other later.</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Link href="/assessment" className={cn("card block p-6 transition-shadow hover:shadow-lift", !rapid && "ring-2 ring-career")}>
            <ListChecks className="mb-3 h-7 w-7 text-career" aria-hidden />
            <h2 className="text-xl font-semibold">Full assessment</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">Interests, reasoning and working style. About 10 minutes. Best if you have time to explore.</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-career">Begin <ArrowRight className="h-4 w-4" aria-hidden /></span>
          </Link>
          <Link href="/assessment?mode=rapid" className={cn("card block p-6 transition-shadow hover:shadow-lift", rapid && "ring-2 ring-career")}>
            <Zap className="mb-3 h-7 w-7 text-growth" aria-hidden />
            <h2 className="text-xl font-semibold">Rapid Decision Mode</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">Need a direction soon? The same questions, then immediate directions, education pathways and next steps.</p>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-career">Begin <ArrowRight className="h-4 w-4" aria-hidden /></span>
          </Link>
        </div>
        <p className="mt-6 text-sm text-ink-faint">Starting stage: <strong className="text-ink-soft">{STAGES.find((s) => s.key === profile?.stage)?.label ?? "Explore"}</strong>. Students in the Explore stage get ideas to try, not a verdict.</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      <p className="eyebrow mb-2">{editing ? "Update your details" : `Step ${step + 1} of 4`}</p>
      <h1 className="text-4xl font-semibold">{editing ? "Your details" : STEP_TITLES[step]}</h1>
      <div className="my-5"><ProgressBar value={step + 1} max={4} label="Onboarding progress" /></div>
      {editing && !profile?.date_of_birth && prefilled === false && profile && <Notice tone="warn" className="mb-4">Some saved details couldn&apos;t be loaded. Please re-enter them.</Notice>}

      <form onSubmit={submit} noValidate className="space-y-6">
        {error && <Notice tone="error">{error}</Notice>}

        {step === 0 && (
          <Card className="space-y-5 p-5 sm:p-6">
            <TextField label="Date of birth" type="date" required value={f.dob} onChange={(e) => set("dob", e.target.value)} error={errors.dob} hint="Used to confirm whether a parent or guardian needs to agree. It is not shown to anyone." />
            <SelectField label="Current class or year" required value={f.education} onChange={(e) => set("education", e.target.value)} error={errors.education}
              placeholder="Choose one" options={EDUCATION_LEVELS.map((x) => ({ value: x.value, label: x.label }))} />
            {stage && <p className="text-sm text-ink-soft">You&apos;ll start in the <Chip tone="career">{STAGES.find((s) => s.key === stage)?.label}</Chip> stage. It updates as you grow.</p>}
            <TextField label="School or college" value={f.institution} onChange={(e) => set("institution", e.target.value)} placeholder="Optional" />
            <TextField label="City" value={f.city} onChange={(e) => set("city", e.target.value)} placeholder="Optional" />
          </Card>
        )}

        {step === 1 && (
          <Card className="space-y-5 p-5 sm:p-6">
            <p className="text-sm leading-relaxed text-ink-soft">Pick the subjects you have marks for and enter your latest percentage. This is optional and helps a little with matching. You can skip it.</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Subjects">
              {SUBJECTS.map((s) => {
                const on = s in f.marks;
                return (
                  <button type="button" key={s} aria-pressed={on} onClick={() => setF((p) => { const m = { ...p.marks }; if (on) delete m[s]; else m[s] = ""; return { ...p, marks: m }; })}
                    className={cn("rounded-full border px-3.5 py-1.5 text-sm font-medium", on ? "border-career bg-career text-white" : "border-line bg-card text-ink-soft hover:border-career/50")}>{s}</button>
                );
              })}
            </div>
            {Object.keys(f.marks).length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2">
                {Object.keys(f.marks).map((s) => (
                  <TextField key={s} label={`${s} (%)`} type="number" inputMode="decimal" min={0} max={100} value={f.marks[s]} onChange={(e) => setF((p) => ({ ...p, marks: { ...p.marks, [s]: e.target.value } }))} />
                ))}
              </div>
            )}
            {errors.marks && <p role="alert" className="text-sm font-medium text-danger">{errors.marks}</p>}
          </Card>
        )}

        {step === 2 && (
          <Card className="space-y-5 p-5 sm:p-6">
            <TextAreaField label="Where would you like to be in the long run?" hint="Optional. In your own words. It can be vague. ACIS will never hold you to it." value={f.goal} onChange={(e) => set("goal", e.target.value)} maxLength={1000} placeholder="For example: build things that help people, or I honestly don't know yet" />
            <div className="grid gap-5 sm:grid-cols-2">
              <SelectField label="How do you like to work?" value={f.workStyle} onChange={(e) => set("workStyle", e.target.value)} placeholder="No preference"
                options={[{ value: "team", label: "With a team" }, { value: "solo", label: "Mostly on my own" }, { value: "mixed", label: "A mix of both" }]} />
              <SelectField label="Where do you picture yourself working?" value={f.environment} onChange={(e) => set("environment", e.target.value)} placeholder="No preference"
                options={[{ value: "office", label: "In an office or lab" }, { value: "remote", label: "From anywhere" }, { value: "field", label: "Out in the field" }]} />
              <SelectField label="What matters most to you?" value={f.priority} onChange={(e) => set("priority", e.target.value)} placeholder="Not sure"
                options={[{ value: "stability", label: "Stability" }, { value: "growth", label: "Fast growth" }, { value: "impact", label: "Making an impact" }, { value: "creativity", label: "Creative freedom" }]} />
              <SelectField label="Money for education" hint="Optional. Helps us suggest realistic pathways." value={f.money} onChange={(e) => set("money", e.target.value as OnboardingForm["money"])} placeholder="Prefer not to say"
                options={[{ value: "budget_limited", label: "Budget is limited" }, { value: "moderate", label: "Moderate" }, { value: "flexible", label: "Flexible" }]} />
            </div>
          </Card>
        )}

        {step === 3 && (
          <Card className="space-y-5 p-5 sm:p-6">
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div><dt className="text-ink-faint">Class or year</dt><dd className="font-medium">{EDUCATION_LEVELS.find((x) => x.value === f.education)?.label}</dd></div>
              <div><dt className="text-ink-faint">Starting stage</dt><dd className="font-medium">{STAGES.find((s) => s.key === stage)?.label}</dd></div>
              <div><dt className="text-ink-faint">Subjects with marks</dt><dd className="font-medium">{Object.keys(f.marks).length || "None added"}</dd></div>
              <div><dt className="text-ink-faint">Long-term goal</dt><dd className="font-medium">{f.goal.trim() ? "Added" : "Not set"}</dd></div>
            </dl>
            {isMinor && (
              <div className="rounded-md border border-growth/30 bg-growth-soft p-4">
                <p className="mb-2 text-sm font-semibold text-growth-ink">You are under 18, so a parent or guardian must agree.</p>
                <label className="flex items-start gap-2.5 text-sm leading-relaxed text-ink-soft">
                  <input type="checkbox" checked={f.guardian} onChange={(e) => set("guardian", e.target.checked)} className="mt-1 h-4 w-4 accent-[#26418F]" />
                  <span>My parent or guardian has read how ACIS stores and uses my information, and agrees to me using it.</span>
                </label>
                {errors.guardian && <p role="alert" className="mt-2 text-xs font-medium text-danger">{errors.guardian}</p>}
              </div>
            )}
            <Notice tone="info">ACIS never guesses your mood, health or personality from what you write, and nothing you enter is shared. You can download or delete everything in Settings.</Notice>
          </Card>
        )}

        <div className="flex items-center justify-between">
          <Button type="button" variant="ghost" onClick={() => { setErrors({}); setStep((s) => Math.max(0, s - 1)); }} disabled={step === 0}>Back</Button>
          {step < 3
            ? <Button type="button" onClick={next}>Continue</Button>
            : <Button type="submit" loading={busy}>{editing ? "Save changes" : "Save and continue"}</Button>}
        </div>
      </form>
    </div>
  );
}

export default function OnboardingPage() {
  return <Suspense fallback={null}><Onboarding /></Suspense>;
}

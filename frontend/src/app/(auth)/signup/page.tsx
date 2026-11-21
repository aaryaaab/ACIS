"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { Button, Notice, TextField } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { emailError, passwordError } from "@/lib/validate";

function SignupForm() {
  const { register, status } = useAuth();
  const router = useRouter();
  const mode = useSearchParams().get("mode");
  const after = mode === "rapid" ? "/onboarding?mode=rapid" : "/onboarding";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agree, setAgree] = useState(false);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (status === "authed") router.replace(after); }, [status, after, router]);

  const errs = {
    name: name.trim() ? null : "Tell us what to call you.",
    email: emailError(email),
    password: passwordError(password),
    confirm: confirm === password ? null : "The two passwords don't match.",
    agree: agree ? null : "Please confirm to continue.",
  };
  const hasErrors = Object.values(errs).some(Boolean);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (hasErrors) return;
    setBusy(true);
    try {
      await register(name.trim(), email.trim(), password);
      router.replace(after);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not create your account. Please try again.");
    } finally { setBusy(false); }
  }

  return (
    <div className="animate-fade-up">
      <h1 className="text-4xl font-semibold">Create your account</h1>
      <p className="mt-2 text-ink-soft">Free, and you can delete everything at any time.</p>
      <form onSubmit={submit} noValidate className="mt-8 space-y-5">
        {error && <Notice tone="error">{error}</Notice>}
        <TextField label="Your name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} error={touched ? errs.name : null} />
        <TextField label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={touched ? errs.email : null} />
        <TextField label="Password" type="password" autoComplete="new-password" hint="At least 8 characters." value={password} onChange={(e) => setPassword(e.target.value)} error={touched ? errs.password : null} />
        <TextField label="Confirm password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={touched ? errs.confirm : null} />
        <div>
          <label className="flex items-start gap-2.5 text-sm leading-relaxed text-ink-soft">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 h-4 w-4 accent-[#26418F]" />
            <span>I understand ACIS saves my answers, journal and activity to personalise guidance. I can download or delete my data in Settings. If I am under 18, a parent or guardian will confirm in the next step.</span>
          </label>
          {touched && errs.agree && <p role="alert" className="mt-1.5 text-xs font-medium text-danger">{errs.agree}</p>}
        </div>
        <Button type="submit" loading={busy} className="w-full">Create account</Button>
      </form>
      <p className="mt-6 text-sm text-ink-soft">Already have an account? <Link href="/login" className="font-semibold text-career hover:underline">Log in</Link></p>
    </div>
  );
}

export default function SignupPage() {
  return <Suspense fallback={null}><SignupForm /></Suspense>;
}

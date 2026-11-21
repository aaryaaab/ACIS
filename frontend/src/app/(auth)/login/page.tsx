"use client";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type FormEvent } from "react";
import { Button, Notice, TextField } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { safeNext } from "@/lib/nav";
import { emailError } from "@/lib/validate";

function LoginForm() {
  const { login, status } = useAuth();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (status === "authed") router.replace(next); }, [status, next, router]);

  const errs = { email: emailError(email), password: password ? null : "Enter your password." };

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (errs.email || errs.password) return;
    setBusy(true);
    try {
      await login(email.trim(), password);
      router.replace(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not log in. Please try again.");
    } finally { setBusy(false); }
  }

  return (
    <div className="animate-fade-up">
      <h1 className="text-4xl font-semibold">Welcome back</h1>
      <p className="mt-2 text-ink-soft">Log in to pick up where you left off.</p>
      <form onSubmit={submit} noValidate className="mt-8 space-y-5">
        {error && <Notice tone="error">{error}</Notice>}
        <TextField label="Email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={touched ? errs.email : null} />
        <TextField label="Password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={touched ? errs.password : null} />
        <Button type="submit" loading={busy} className="w-full">Log in</Button>
      </form>
      <p className="mt-6 text-sm text-ink-soft">New to ACIS? <Link href="/signup" className="font-semibold text-career hover:underline">Create an account</Link></p>
    </div>
  );
}

export default function LoginPage() {
  return <Suspense fallback={null}><LoginForm /></Suspense>;
}

"use client";
import Link from "next/link";
import { useEffect, useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { AlertCircle, CheckCircle2, Info, Loader2, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/cn";
import type { ApiError } from "@/lib/api";

// ------------------------------------------------------------------ buttons
type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-career text-white hover:bg-career-ink disabled:bg-career/50",
  secondary: "border border-line bg-card text-ink hover:bg-paper disabled:text-ink-faint",
  ghost: "text-ink-soft hover:bg-ink/5 disabled:text-ink-faint",
  danger: "bg-danger text-white hover:bg-danger/90 disabled:bg-danger/50",
};
const base = "inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed";

export function Button({ variant = "primary", loading, children, className, disabled, ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean }) {
  return (
    <button {...rest} disabled={disabled || loading} aria-busy={loading || undefined} className={cn(base, variants[variant], className)}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function ButtonLink({ href, variant = "primary", children, className }: { href: string; variant?: Variant; children: ReactNode; className?: string }) {
  return <Link href={href} className={cn(base, variants[variant], className)}>{children}</Link>;
}

// ------------------------------------------------------------------ layout
export function Card({ children, className, as: Tag = "div" }: { children: ReactNode; className?: string; as?: "div" | "section" | "article" | "li" }) {
  return <Tag className={cn("card", className)}>{children}</Tag>;
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="max-w-2xl">
        {eyebrow && <p className="eyebrow mb-1.5">{eyebrow}</p>}
        <h1 className="text-3xl font-semibold leading-tight sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </header>
  );
}

export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h2 className="text-xl font-semibold">{children}</h2>
      {aside && <div className="text-sm text-ink-soft">{aside}</div>}
    </div>
  );
}

export function Chip({ children, tone = "neutral", className }: { children: ReactNode; tone?: "neutral" | "career" | "learning" | "growth" | "ok" | "warn" | "danger"; className?: string }) {
  const tones = {
    neutral: "bg-ink/5 text-ink-soft", career: "bg-career-soft text-career-ink", learning: "bg-learning-soft text-learning-ink",
    growth: "bg-growth-soft text-growth-ink", ok: "bg-ok-soft text-ok", warn: "bg-growth-soft text-growth-ink", danger: "bg-danger-soft text-danger",
  };
  return <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium", tones[tone], className)}>{children}</span>;
}

export function ProgressBar({ value, max = 100, tone = "career", label }: { value: number; max?: number; tone?: "career" | "learning" | "growth"; label?: string }) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const colour = { career: "bg-career", learning: "bg-learning", growth: "bg-growth" }[tone];
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.round(value)} className="h-2 w-full overflow-hidden rounded-full bg-ink/10">
      <div className={cn("h-full rounded-full transition-[width] duration-500", colour)} style={{ width: `${pct}%` }} />
    </div>
  );
}

// ------------------------------------------------------------------ states
export function Spinner({ label = "Loading" }: { label?: string }) {
  return <span role="status" className="inline-flex items-center gap-2 text-sm text-ink-soft"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{label}…</span>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden className={cn("animate-pulse rounded-md bg-ink/10", className)} />;
}

export function LoadingBlock({ rows = 3, label = "Loading" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label} className="space-y-3">
      <span className="sr-only">{label}…</span>
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className={cn("h-16", i === 0 && "h-24")} />)}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-line bg-card/60 px-6 py-10 text-center">
      {icon && <div className="mb-3 text-ink-faint" aria-hidden>{icon}</div>}
      <h3 className="text-lg font-semibold">{title}</h3>
      {description && <p className="mt-1.5 max-w-md text-sm leading-relaxed text-ink-soft">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, title = "We couldn't load this" }: { error: ApiError | Error | string; onRetry?: () => void; title?: string }) {
  const message = typeof error === "string" ? error : error.message;
  return (
    <div role="alert" className="rounded-lg border border-danger/25 bg-danger-soft px-5 py-4">
      <div className="flex items-start gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-danger">{title}</p>
          <p className="mt-0.5 text-sm text-ink-soft">{message}</p>
          {onRetry && <Button variant="secondary" className="mt-3" onClick={onRetry}>Try again</Button>}
        </div>
      </div>
    </div>
  );
}

export function Notice({ tone = "info", children, className }: { tone?: "info" | "success" | "warn" | "error"; children: ReactNode; className?: string }) {
  const map = {
    info: { cls: "border-career/20 bg-career-soft text-career-ink", icon: Info },
    success: { cls: "border-ok/25 bg-ok-soft text-ok", icon: CheckCircle2 },
    warn: { cls: "border-growth/25 bg-growth-soft text-growth-ink", icon: TriangleAlert },
    error: { cls: "border-danger/25 bg-danger-soft text-danger", icon: AlertCircle },
  }[tone];
  const Icon = map.icon;
  return (
    <div role={tone === "error" ? "alert" : "status"} className={cn("flex items-start gap-2.5 rounded-md border px-3.5 py-2.5 text-sm", map.cls, className)}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0 leading-relaxed">{children}</div>
    </div>
  );
}

// ------------------------------------------------------------------ forms
interface FieldShellProps { label: string; hint?: ReactNode; error?: string | null; required?: boolean; children: (ids: { id: string; describedBy?: string; invalid: boolean }) => ReactNode; className?: string }
export function Field({ label, hint, error, required, children, className }: FieldShellProps) {
  const id = useId();
  const describedBy = [hint ? `${id}-hint` : "", error ? `${id}-err` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink">
        {label}{required && <span className="text-danger" aria-hidden> *</span>}
      </label>
      {children({ id, describedBy, invalid: !!error })}
      {hint && !error && <p id={`${id}-hint`} className="mt-1.5 text-xs leading-relaxed text-ink-faint">{hint}</p>}
      {error && <p id={`${id}-err`} role="alert" className="mt-1.5 text-xs font-medium text-danger">{error}</p>}
    </div>
  );
}

const controlCls = "w-full rounded-md border bg-card px-3 py-2 text-[15px] text-ink placeholder:text-ink-faint focus:border-career";
const controlBorder = (invalid: boolean) => (invalid ? "border-danger" : "border-line");

type TextProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & { label: string; hint?: ReactNode; error?: string | null; fieldClassName?: string };
export function TextField({ label, hint, error, fieldClassName, required, ...rest }: TextProps) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={fieldClassName}>
      {({ id, describedBy, invalid }) => (
        <input id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined} required={required} {...rest} className={cn(controlCls, controlBorder(invalid), rest.className)} />
      )}
    </Field>
  );
}

type AreaProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> & { label: string; hint?: ReactNode; error?: string | null; fieldClassName?: string };
export function TextAreaField({ label, hint, error, fieldClassName, required, ...rest }: AreaProps) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={fieldClassName}>
      {({ id, describedBy, invalid }) => (
        <textarea id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined} required={required} rows={4} {...rest} className={cn(controlCls, controlBorder(invalid), "resize-y leading-relaxed", rest.className)} />
      )}
    </Field>
  );
}

type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> & { label: string; hint?: ReactNode; error?: string | null; fieldClassName?: string; options: { value: string; label: string }[]; placeholder?: string };
export function SelectField({ label, hint, error, fieldClassName, options, placeholder, required, ...rest }: SelectProps) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={fieldClassName}>
      {({ id, describedBy, invalid }) => (
        <select id={id} aria-describedby={describedBy} aria-invalid={invalid || undefined} required={required} {...rest} className={cn(controlCls, controlBorder(invalid), rest.className)}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      )}
    </Field>
  );
}

/** A 1–5 scale as a radio group. `labels` names the two ends. */
export function Scale({ name, value, onChange, labels, legend, size = 5 }: { name: string; value: number | undefined; onChange: (v: number) => void; labels: [string, string]; legend: string; size?: number }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-[15px] font-medium leading-snug text-ink">{legend}</legend>
      <div className="flex items-center gap-2">
        <span className="hidden w-20 text-right text-xs text-ink-faint sm:block">{labels[0]}</span>
        <div className="flex flex-1 gap-1.5 sm:max-w-xs">
          {Array.from({ length: size }, (_, i) => i + 1).map((n) => (
            <label key={n} className={cn("flex h-10 flex-1 cursor-pointer items-center justify-center rounded-md border text-sm font-semibold transition-colors focus-within:ring-2 focus-within:ring-career",
              value === n ? "border-career bg-career text-white" : "border-line bg-card text-ink-soft hover:border-career/50")}>
              <input type="radio" name={name} value={n} checked={value === n} onChange={() => onChange(n)} className="sr-only" aria-label={`${n} of ${size}`} />
              {n}
            </label>
          ))}
        </div>
        <span className="hidden w-20 text-xs text-ink-faint sm:block">{labels[1]}</span>
      </div>
      <div className="mt-1 flex justify-between text-xs text-ink-faint sm:hidden"><span>{labels[0]}</span><span>{labels[1]}</span></div>
    </fieldset>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange, label }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="mb-5 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button key={t.id} role="tab" type="button" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cn("-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-semibold transition-colors",
            value === t.id ? "border-career text-career-ink" : "border-transparent text-ink-soft hover:text-ink")}>
          {t.label}{t.count !== undefined && <span className="ml-1.5 text-xs font-normal text-ink-faint">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-4" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-lg bg-card p-5 shadow-lift sm:rounded-lg">
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id={titleId} className="text-xl font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded p-1 text-ink-faint hover:bg-ink/5 hover:text-ink"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

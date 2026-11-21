"use client";
import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/domain";
import { RequireAuth } from "@/components/RequireAuth";

/** Onboarding and the assessment: focused pages with no sidebar. */
export default function FlowLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth needsOnboarding={false}>
      <div className="min-h-screen">
        <header className="border-b border-line bg-card/70">
          <div className="page-wrap flex items-center justify-between py-3.5">
            <Link href="/" aria-label="ACIS home"><Wordmark /></Link>
            <Link href="/dashboard" className="text-sm font-medium text-ink-soft hover:text-ink">Skip for now</Link>
          </div>
        </header>
        <main className="page-wrap max-w-3xl py-8 sm:py-12">{children}</main>
      </div>
    </RequireAuth>
  );
}

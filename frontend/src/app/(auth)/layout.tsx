import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/domain";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col px-5 py-6 sm:px-10">
        <Link href="/" aria-label="ACIS home" className="w-fit"><Wordmark /></Link>
        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">{children}</main>
      </div>
      <aside className="relative hidden overflow-hidden bg-ink text-paper lg:flex lg:flex-col lg:justify-end lg:p-14">
        <svg className="absolute inset-0 h-full w-full opacity-60" viewBox="0 0 600 800" fill="none" aria-hidden preserveAspectRatio="xMidYMid slice">
          <path className="animate-draw" strokeDasharray="400" d="M-20 620C120 620 160 360 300 360S460 520 620 480" stroke="#7F95E0" strokeWidth="2.2" />
          <path className="animate-draw" strokeDasharray="400" style={{ animationDelay: ".2s" }} d="M-20 520C110 520 170 260 300 260S470 420 620 380" stroke="#4FC3BF" strokeWidth="2.2" />
          <path className="animate-draw" strokeDasharray="400" style={{ animationDelay: ".4s" }} d="M-20 420C100 420 180 160 300 160S480 330 620 280" stroke="#E8A64C" strokeWidth="2.2" />
        </svg>
        <div className="relative max-w-md">
          <p className="font-display text-3xl leading-snug">Don&apos;t just choose a career. <em className="not-italic text-[#E8A64C]">Build one.</em></p>
          <p className="mt-4 text-sm leading-relaxed text-paper/70">ACIS keeps learning about you over time, explains every suggestion, and never pushes a decision you are not ready for.</p>
        </div>
      </aside>
    </div>
  );
}

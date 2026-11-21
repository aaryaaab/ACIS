import type { Memory, MemoryCategory } from "./types";

export const MEMORY_INFO: Record<MemoryCategory, { label: string; blurb: string }> = {
  stable: { label: "Stable", blurb: "Long-lasting facts about you, like your class and goals." },
  evolving: { label: "Evolving", blurb: "Things that change over time, like your strongest interests." },
  episodic: { label: "Episodic", blurb: "Specific things that happened: a project, an assessment, a reflection." },
  temporary: { label: "Temporary", blurb: "Short-lived context, like what you asked the mentor recently. It fades by itself." },
};

export function certaintyWord(c: number) { return c >= 0.75 ? "Confident" : c >= 0.5 ? "Fairly sure" : "Tentative"; }

export function memorySource(source: string): string {
  const kind = source.split(":")[0];
  return ({ student: "Added by you", onboarding: "From onboarding", assessment: "From your assessment", journal: "From a journal entry",
    reflection: "From a reflection", mentor: "From a mentor chat", growth: "From your progress" } as Record<string, string>)[kind] ?? "From ACIS";
}

export function fadesIn(m: Memory, now = Date.now()): string | null {
  if (!m.expires_at) return null;
  const d = Math.ceil((new Date(m.expires_at.endsWith("Z") ? m.expires_at : `${m.expires_at}Z`).getTime() - now) / 86_400_000);
  return d <= 0 ? "fades today" : `fades in ${d} day${d === 1 ? "" : "s"}`;
}

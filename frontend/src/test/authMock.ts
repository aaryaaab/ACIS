import { vi } from "vitest";
import type { StudentProfile } from "@/lib/types";

export const profile = (over: Partial<StudentProfile> = {}): StudentProfile => ({
  stage: "learn", education_level: "btech_2", institution: "Test College", city: "Pune", long_term_goal: "Build intelligent systems",
  is_minor: false, onboarding_done: true, rapid_mode_used: false, lifestyle: { work_style: "team" }, financial_context: "",
  date_of_birth: "2004-05-01", academics: [{ subject: "Mathematics", score_percent: 88 }], research_consent: false, ...over,
});

export const authState = {
  current: {
    status: "authed" as "loading" | "anon" | "authed",
    user: { id: 1, email: "asha@example.com", full_name: "Asha Rao" } as { id: number; email: string; full_name: string } | null,
    profile: profile() as StudentProfile | null,
    login: vi.fn(async () => {}), register: vi.fn(async () => {}), logout: vi.fn(), refresh: vi.fn(async () => {}),
  },
};
export function resetAuth(over: Partial<typeof authState.current> = {}) {
  authState.current = {
    status: "authed", user: { id: 1, email: "asha@example.com", full_name: "Asha Rao" }, profile: profile(),
    login: vi.fn(async () => {}), register: vi.fn(async () => {}), logout: vi.fn(), refresh: vi.fn(async () => {}), ...over,
  };
}
export const authModule = { useAuth: () => authState.current, AuthProvider: ({ children }: { children: unknown }) => children };

import { ageFromDob, EDUCATION_LEVELS } from "./format";
import type { OnboardingInput } from "./types";

export const SUBJECTS = ["Mathematics", "Physics", "Chemistry", "Biology", "Computer Science", "English", "Social Science", "Economics", "Accountancy", "Art"];

export interface OnboardingForm {
  dob: string; education: string; institution: string; city: string;
  marks: Record<string, string>;                      // subject -> percent as typed
  goal: string; workStyle: string; environment: string; priority: string; money: string;
  guardian: boolean;
}
export const emptyForm = (): OnboardingForm => ({
  dob: "", education: "", institution: "", city: "", marks: {}, goal: "", workStyle: "", environment: "", priority: "", money: "", guardian: false,
});

export type FormErrors = Partial<Record<"dob" | "education" | "marks" | "guardian", string>>;

export function validateStep(step: number, f: OnboardingForm, today = new Date()): FormErrors {
  const e: FormErrors = {};
  if (step === 0) {
    if (!f.dob) e.dob = "Enter your date of birth.";
    else if (new Date(`${f.dob}T12:00:00`) > today) e.dob = "Your date of birth can't be in the future.";
    else if (ageFromDob(f.dob, today) < 10 || ageFromDob(f.dob, today) > 100) e.dob = "Please check this date. ACIS is built for students aged 10 and over.";
    if (!f.education) e.education = "Choose your current class or year.";
  }
  if (step === 1) {
    for (const [subject, raw] of Object.entries(f.marks)) {
      const n = Number(raw);
      if (raw.trim() === "" || Number.isNaN(n) || n < 0 || n > 100) { e.marks = `${subject}: enter a percentage between 0 and 100.`; break; }
    }
  }
  if (step === 3 && f.dob && ageFromDob(f.dob, today) < 18 && !f.guardian) {
    e.guardian = "A parent or guardian needs to agree before a student under 18 can continue.";
  }
  return e;
}

export function toPayload(f: OnboardingForm): OnboardingInput {
  const lifestyle: Record<string, string> = {};
  if (f.workStyle) lifestyle.work_style = f.workStyle;
  if (f.environment) lifestyle.environment = f.environment;
  if (f.priority) lifestyle.priority = f.priority;
  const academics: Record<string, number> = {};
  for (const [s, raw] of Object.entries(f.marks)) academics[s] = Number(raw);
  return {
    date_of_birth: f.dob, guardian_consent: f.guardian, education_level: f.education, institution: f.institution.trim(),
    city: f.city.trim(), long_term_goal: f.goal.trim(), lifestyle, financial_context: f.money as OnboardingInput["financial_context"], academics,
  };
}

export const stageFor = (education: string) => EDUCATION_LEVELS.find((e) => e.value === education)?.stage ?? null;

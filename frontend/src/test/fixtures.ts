import type { Portfolio, Resource } from "@/lib/types";

export const portfolio = (over: Partial<Portfolio> = {}): Portfolio => ({
  primary: { career_id: 1, career: "Software Engineer", slug: "software_engineer", confidence: "moderate", evidence_count: 0 },
  secondary: [{ career_id: 2, career: "Data Scientist", slug: "data_scientist", confidence: "moderate", evidence_count: 2 }],
  emerging: [{ career_id: 3, career: "UI / UX Designer", slug: "ux_designer", confidence: "emerging", evidence_count: 0 }],
  recommendation_allowed: true, stage: "learn", explore_message: "", algorithm_version: "cm-1.0", ...over,
});
export const explorePortfolio = (): Portfolio => ({
  primary: null, secondary: [], recommendation_allowed: false, stage: "explore",
  explore_message: "You are in the Explore stage, so ACIS shows possible directions to try out, not a recommendation.",
  emerging: [{ career_id: 1, career: "Software Engineer", slug: "software_engineer", confidence: "emerging", evidence_count: 0 }],
});
export const prefs = { video: 0.5, reading: 0.5, interactive: 0.5, project: 0.5, theory: 0.5, long_sessions: 0.5, difficulty: 0.5 };
export const resource = (over: Partial<Resource> = {}): Resource => ({
  id: 7, title: "CS50P: Introduction to Programming with Python", provider: "Harvard CS50", url: "https://cs50.harvard.edu/python/", kind: "video",
  difficulty: 1, duration_hours: 40, cost: "free", skills: ["python"], verified: null, verification_note: "Link not verified yet. Please check it before relying on it.", fit: 0.7, ...over,
});
export const skillGap = {
  career: "Software Engineer",
  skills: [
    { skill_id: 1, slug: "python", skill: "Python", required_level: 3, current_level: 0, gap: 3, importance: 0.6, priority: 1.8, status: "missing" as const },
    { skill_id: 2, slug: "git", skill: "Git & version control", required_level: 3, current_level: 3, gap: 0, importance: 0.7, priority: 0, status: "met" as const },
  ],
};
export const emptyIntel = { total: 0, items: [], message: "No saved updates match your directions yet. ACIS only shows items it has actually retrieved from a named source, and never makes any up.", note: "n" };
export const emptyOpps = { total: 0, items: [], message: "No verified opportunities are saved yet. ACIS never invents opportunities or deadlines.", note: "Deadlines can change." };
export const duePrompt = { due: true, days_since_last: null, next_due_in_days: 0, note: "One reflection only nudges slightly.", prompts: [
  { field: "enjoyed", question: "What did you enjoy most over the last few weeks?" }, { field: "disliked", question: "What did you dislike or find draining?" },
  { field: "surprised", question: "Was there anything that surprised you?" }, { field: "interests_changed", question: "Do you feel your interests have changed recently?" }] };

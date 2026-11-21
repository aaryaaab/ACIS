import type { MentorSource } from "./types";

export const SUGGESTED_PROMPTS = [
  "Why was this career suggested to me?",
  "What should I learn next?",
  "I'm not sure what to choose. Can you help?",
  "What projects could I try?",
  "What do you remember about me?",
];

/** Turns a source record from the API into a short, honest label. */
export function describeSource(s: MentorSource): { label: string; href?: string } {
  switch (s.type) {
    case "career_knowledge_base": return { label: `Career knowledge base: ${s.name ?? "unknown"}${s.verified ? "" : " (not verified)"}` };
    case "your_profile": return { label: "Your profile" };
    case "your_memory": return { label: "Your saved memory" };
    case "your_skills_and_learning_style": return { label: "Your skills and learning style" };
    case "project_catalogue": return { label: `Project catalogue: ${s.name ?? "ACIS"}` };
    case "market_update": return { label: `${s.name ?? "Source"}${s.retrieved_on ? `, retrieved ${s.retrieved_on}` : ""}`, href: s.url };
    case "opportunities": return { label: s.name ?? "Opportunity source", href: s.url };
    case "safety": return { label: s.name ?? "Safety information" };
    default: return { label: s.name ?? s.type };
  }
}

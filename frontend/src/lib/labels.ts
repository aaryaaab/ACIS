export const DIFFICULTY = ["", "Beginner", "Intermediate", "Advanced"];
export const KIND_LABEL: Record<string, string> = { video: "Video", reading: "Reading", interactive: "Interactive", project: "Project-based" };
export const fitWords = (fit: number | undefined) => (fit === undefined ? null : fit >= 0.65 ? "Suits how you learn" : fit >= 0.5 ? "Reasonable match for your style" : "Weaker match for your style");
export const SKILL_LEVELS = ["", "Beginner", "Basic", "Working", "Strong", "Expert"];

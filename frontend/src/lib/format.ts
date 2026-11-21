export const humanize = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export function formatDate(iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" }) {
  if (!iso) return "";
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-IN", opts);
}

export function monthLabel(ym: string) {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

export function ageFromDob(dob: string, today = new Date()): number {
  const d = new Date(`${dob}T12:00:00`);
  let age = today.getFullYear() - d.getFullYear();
  const beforeBirthday = today.getMonth() < d.getMonth() || (today.getMonth() === d.getMonth() && today.getDate() < d.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export function timeAgo(iso: string, now = Date.now()): string {
  const d = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : `${iso}Z`).getTime();
  const days = Math.floor((now - d) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? "1 month ago" : `${months} months ago`;
}

export const EDUCATION_LEVELS: { value: string; label: string; stage: string }[] = [
  { value: "class_8", label: "Class 8", stage: "explore" }, { value: "class_9", label: "Class 9", stage: "explore" },
  { value: "class_10", label: "Class 10", stage: "explore" }, { value: "class_11", label: "Class 11", stage: "decide" },
  { value: "class_12", label: "Class 12", stage: "decide" }, { value: "btech_1", label: "College, year 1", stage: "learn" },
  { value: "btech_2", label: "College, year 2", stage: "learn" }, { value: "btech_3", label: "College, year 3", stage: "build" },
  { value: "btech_4", label: "College, final year", stage: "launch" }, { value: "graduate", label: "Recently graduated", stage: "launch" },
  { value: "working", label: "Working", stage: "grow" },
];
export const educationLabel = (v: string) => EDUCATION_LEVELS.find((e) => e.value === v)?.label ?? humanize(v);

export const STAGES = [
  { key: "explore", label: "Explore", hint: "Discover what you enjoy" },
  { key: "decide", label: "Decide", hint: "Narrow down your options" },
  { key: "learn", label: "Learn", hint: "Build the right skills" },
  { key: "build", label: "Build", hint: "Make real projects" },
  { key: "launch", label: "Launch", hint: "Apply and begin" },
  { key: "grow", label: "Grow", hint: "Keep developing" },
] as const;

export const CONFIDENCE_LABEL = { high: "High", moderate: "Moderate", emerging: "Emerging" } as const;

/** Splits text into plain and link parts. Only http(s) links are made clickable. */
export function linkify(text: string): { text: string; href?: string }[] {
  const out: { text: string; href?: string }[] = [];
  const re = /https?:\/\/[^\s)]+[^\s).,;:!?]/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const i = m.index ?? 0;
    if (i > last) out.push({ text: text.slice(last, i) });
    out.push({ text: m[0], href: m[0] });
    last = i + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

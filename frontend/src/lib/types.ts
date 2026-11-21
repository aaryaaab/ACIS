// Types mirror the FastAPI responses documented in docs/API.md.

export type Confidence = "high" | "moderate" | "emerging";
export type Stage = "explore" | "decide" | "learn" | "build" | "launch" | "grow";

export interface User { id: number; email: string; full_name: string }

export interface AcademicRow { subject: string; score_percent: number }

export interface StudentProfile {
  stage: Stage;
  education_level: string;
  institution: string;
  city: string;
  long_term_goal: string;
  is_minor: boolean;
  onboarding_done: boolean;
  rapid_mode_used: boolean;
  lifestyle: Record<string, string>;
  financial_context: string;
  date_of_birth?: string | null;
  academics?: AcademicRow[];
  research_consent?: boolean;
}
export interface ProfileResponse { user: { email: string; full_name: string }; profile: StudentProfile | null }

export interface OnboardingInput {
  date_of_birth: string;
  guardian_consent: boolean;
  education_level: string;
  institution: string;
  city: string;
  long_term_goal: string;
  lifestyle: Record<string, string>;
  financial_context: "" | "budget_limited" | "moderate" | "flexible";
  academics: Record<string, number>;
}

// ---- assessment
export interface InterestItem { domain: string; text: string }
export interface AptitudeItem { id: string; aptitude: string; text: string; options: string[] }
export interface LikertItem { id: string; text: string; trait?: string }
export interface AssessmentQuestions {
  interests: InterestItem[]; aptitude: AptitudeItem[]; creative: LikertItem[]; personality: LikertItem[];
  scales: Record<string, string>;
}
export interface AssessmentInput {
  interests: Record<string, number>;
  aptitude_answers: Record<string, number>;
  creative: Record<string, number>;
  personality: Record<string, number>;
}
export interface RapidDirection {
  career: string; confidence: Confidence; pathway: string;
  degrees: { name: string; entrance_exams: string }[]; first_skills: string[];
}
export interface RapidPlan { primary: RapidDirection; secondary: RapidDirection[]; next_steps: string[]; note: string }
export interface AssessmentResult {
  aptitude: Record<string, number>; personality: Record<string, number>;
  portfolio: Portfolio; recommendation_ids: Record<string, number>; rapid?: RapidPlan;
}

// ---- career model
export interface CareerEntry { career_id: number; career: string; slug: string; confidence: Confidence; evidence_count: number }
export interface Portfolio {
  primary: CareerEntry | null; secondary: CareerEntry[]; emerging: CareerEntry[];
  recommendation_allowed: boolean; stage?: Stage; explore_message?: string; algorithm_version?: string;
}
export interface CareerSummary { id: number; slug: string; name: string; description: string }
export interface CareerHistoryRow { career: string; role: string; level: Confidence; reason: string; at: string }
export interface Recommendation {
  id: number; kind: string; label: string; confidence: Confidence; why: string; what_could_change: string;
  evidence: string[]; created_at: string;
}
export interface LogEntry {
  id: number; created_at: string; kind: string; target: string; confidence: string; why: string;
  algorithm_version: string; model_version: string; knowledge_base_version: string;
  feedback: { helpful: boolean; relevance: number | null; comment: string }[];
}
export interface CareerComparison {
  slug: string; name: string; description: string; fit: Confidence | "unknown"; pathway: string;
  degrees: string[]; skills_missing: string[]; skills_met: string[];
}
export interface SkillGapRow {
  skill_id: number; slug: string; skill: string; required_level: number; current_level: number; gap: number;
  importance: number; priority: number; status: "met" | "missing" | "in_progress";
}
export type EvidenceType = "project" | "competition" | "club" | "activity" | "reflection" | "journal" | "click";

// ---- learning model
export interface Resource {
  id: number; title: string; provider: string; url: string; kind: "video" | "reading" | "interactive" | "project";
  difficulty: number; duration_hours: number; cost: string; skills: string[];
  verified: string | null; verification_note: string | null; fit?: number;
}
export type LearningStyle = Record<string, number>;
export interface RecommendedResources { career: string; learning_style: LearningStyle; resources: Resource[] }

// ---- growth model
export interface MySkill { slug: string; name: string; level: number; category: string }
export interface CatalogueSkill { slug: string; name: string; category: string }
export interface ProjectIdea {
  id: number; title: string; description: string; difficulty: number; est_hours: number;
  skills: string[]; you_already_know: number;
}
export interface MyProject {
  id: number; title: string; description: string; status: "in_progress" | "completed"; skills: string[];
  in_portfolio: boolean; repo_url: string; started_at: string; completed_at: string | null;
}
export interface Achievement { id: number; kind: string; title: string; description: string; date: string }
export interface GrowthProgress {
  skills_tracked: number; projects_completed: number; projects_in_progress: number; achievements: Record<string, number>;
}

// ---- memory, journal, reflections
export type MemoryCategory = "stable" | "evolving" | "episodic" | "temporary";
export interface Memory {
  id: number; category: MemoryCategory; content: string; source: string; confidence: number; importance: number;
  tags: string[]; created_at: string; expires_at: string | null;
}
export interface Paged<T> { total: number; items: T[] }
export interface JournalEntry {
  id: number; text: string; detected: { fields: string[]; skills: string[] }; created_at: string;
  career_evidence_added_for?: string[];
}
export interface Reflection {
  id: number; enjoyed: string; disliked: string; surprised: string; interests_changed: "yes" | "no" | "unsure";
  related_careers: { slug: string; feeling: "enjoyed" | "disliked" }[]; created_at: string;
  career_evidence_added_for?: string[]; note?: string;
}
export interface ReflectionPrompt {
  due: boolean; days_since_last: number | null; next_due_in_days: number;
  prompts: { field: string; question: string }[]; note: string;
}
export interface VoiceStatus { speech_to_text: boolean; message: string }

// ---- mentor
export interface MentorSource { type: string; name?: string; url?: string; verified?: boolean; retrieved_on?: string }
export interface MentorMessage {
  id: number; role: "user" | "mentor"; content: string; intent: string; sources: MentorSource[];
  llm_used: boolean; created_at: string;
}
export interface MentorReply { conversation_id: number; reply: MentorMessage; mode: "llm" | "rule_based"; fallback_reason: string | null }
export interface MentorStatus { mode: "llm" | "rule_based"; provider: string | null; note: string }
export interface Conversation { id: number; title: string; created_at: string }

// ---- timeline, intelligence, opportunities
export type TimelineType = "assessment" | "career" | "project" | "achievement" | "reflection" | "journal" | "learning" | "skill";
export interface TimelineEvent { type: TimelineType; at: string; month: string; title: string; detail: string; ref: unknown }
export interface Source { name: string; url: string; licence: string; attribution: string; last_verified: string | null }
export interface IntelItem {
  id: number; title: string; summary: string; url: string; retrieved_on: string; age_days: number; stale: boolean;
  source: Source | null; why_shown: string;
}
export interface IntelResponse { total: number; items: IntelItem[]; message: string; note: string }
export interface Opportunity {
  id: number; title: string; kind: string; provider: string; eligibility: string; deadline: string | null;
  status: "open" | "closed" | "no_deadline_listed"; days_left: number | null; url: string; career_slugs: string[];
  verified_on: string | null; verified_days_ago: number | null; needs_reverification: boolean;
  verification_note: string; source: { name: string; url: string } | null;
}
export interface OpportunityResponse { total: number; items: Opportunity[]; message: string; note: string }

// ---- roadmaps
export interface RoadmapItem {
  id: number; position: number; kind: "skill" | "resource" | "project"; title: string; ref_id: number | null;
  done: boolean; auto_done: boolean; effective_done: boolean;
  skill?: string | null; current_level?: number; required_level?: number;
  url?: string; provider?: string; resource_kind?: string; difficulty?: number; verified?: boolean;
  description?: string; est_hours?: number;
}
export interface RoadmapSummary {
  id: number; title: string; career: { slug: string; name: string }; active: boolean; created_at: string;
  progress: { done: number; total: number; percent: number };
}
export interface Roadmap extends RoadmapSummary { items: RoadmapItem[] }

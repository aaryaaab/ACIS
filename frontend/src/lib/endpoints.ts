import { http, qs } from "./api";
import type * as T from "./types";

/** One typed function per backend endpoint the UI uses. */
export const acis = {
  auth: {
    register: (b: { email: string; password: string; full_name: string }) => http.post<{ access_token: string }>("/auth/register", b),
    login: (b: { email: string; password: string }) => http.post<{ access_token: string }>("/auth/login", b),
    me: () => http.get<T.User>("/auth/me"),
    logout: () => http.post<void>("/auth/logout"),
  },
  profile: {
    get: () => http.get<T.ProfileResponse>("/profile"),
    remove: () => http.del("/profile"),
    onboard: (b: T.OnboardingInput & { stage?: string }) => http.post<T.StudentProfile>("/onboarding", b),
  },
  assessment: {
    questions: () => http.get<T.AssessmentQuestions>("/assessment/questions"),
    submit: (b: T.AssessmentInput) => http.post<T.AssessmentResult>("/assessment", b),
    rapid: (b: T.AssessmentInput) => http.post<T.AssessmentResult>("/assessment/rapid", b),
  },
  careers: {
    list: (q = "") => http.get<T.CareerSummary[]>(`/careers${qs({ q, limit: 100 })}`),
    portfolio: () => http.get<T.Portfolio>("/careers/portfolio"),
    history: () => http.get<T.CareerHistoryRow[]>("/careers/history"),
    addEvidence: (b: { career_slug: string; source_type: T.EvidenceType; direction?: 1 | -1; strength?: number; note?: string }) =>
      http.post<T.Portfolio>("/careers/evidence", b),
    compare: (a: string, b: string) => http.get<{ careers: T.CareerComparison[]; note: string }>(`/careers/compare${qs({ a, b })}`),
    skillGap: (slug: string) => http.get<{ career: string; skills: T.SkillGapRow[] }>(`/careers/${slug}/skill-gap`),
    recommendation: (id: number) => http.get<T.Recommendation>(`/careers/recommendations/${id}`),
    feedback: (id: number, b: { helpful: boolean; relevance?: number | null; comment?: string }) =>
      http.post<{ id: number }>(`/careers/recommendations/${id}/feedback`, b),
  },
  learning: {
    resources: (p: { skill?: string; kind?: string; limit?: number; offset?: number } = {}) =>
      http.get<T.Resource[]>(`/learning/resources${qs({ limit: 30, ...p })}`),
    recommended: (career: string, limit = 8) => http.get<T.RecommendedResources>(`/learning/recommended${qs({ career, limit })}`),
    preferences: () => http.get<T.LearningStyle>("/learning/preferences"),
    feedback: (id: number, b: { status: "started" | "completed" | "abandoned"; rating?: number | null; comment?: string }) =>
      http.post<{ feedback_id: number; preferences: T.LearningStyle }>(`/learning/resources/${id}/feedback`, b),
  },
  growth: {
    skills: () => http.get<T.MySkill[]>("/growth/skills"),
    catalogue: () => http.get<T.CatalogueSkill[]>("/growth/skills/catalogue"),
    setSkill: (skill_slug: string, level: number) => http.put<{ slug: string; level: number }>("/growth/skills", { skill_slug, level }),
    ideas: (p: { career?: string; max_difficulty?: number } = {}) => http.get<T.ProjectIdea[]>(`/growth/projects/ideas${qs(p)}`),
    projects: () => http.get<T.MyProject[]>("/growth/projects"),
    startProject: (b: { title: string; description?: string; idea_id?: number | null; skill_slugs?: string[]; repo_url?: string }) =>
      http.post<{ id: number }>("/growth/projects", b),
    completeProject: (id: number) => http.post<{ id: number; status: string; career_evidence_for: string[] }>(`/growth/projects/${id}/complete`),
    achievements: () => http.get<T.Achievement[]>("/growth/achievements"),
    addAchievement: (b: { kind: string; title: string; description?: string; achieved_on?: string; career_slug?: string | null }) =>
      http.post<{ id: number }>("/growth/achievements", b),
    progress: () => http.get<T.GrowthProgress>("/growth/progress"),
  },
  memory: {
    list: (p: { category?: string; limit?: number; offset?: number } = {}) => http.get<T.Paged<T.Memory>>(`/memory${qs({ limit: 100, ...p })}`),
    summary: () => http.get<Record<T.MemoryCategory, number>>("/memory/summary"),
    search: (q: string) => http.get<T.Memory[]>(`/memory/search${qs({ q })}`),
    create: (b: { category: T.MemoryCategory; content: string; importance?: number; tags?: string[] }) => http.post<T.Memory>("/memory", b),
    update: (id: number, b: { content?: string; importance?: number }) => http.patch<T.Memory>(`/memory/${id}`, b),
    remove: (id: number) => http.del(`/memory/${id}`),
  },
  journal: {
    create: (text: string) => http.post<T.JournalEntry>("/journal", { text }),
    list: (p: { limit?: number; offset?: number } = {}) => http.get<T.Paged<T.JournalEntry>>(`/journal${qs({ limit: 20, ...p })}`),
    search: (q: string) => http.get<T.JournalEntry[]>(`/journal/search${qs({ q })}`),
    remove: (id: number) => http.del(`/journal/${id}`),
  },
  voice: {
    status: () => http.get<T.VoiceStatus>("/voice/status"),
    sendTranscript: (transcript: string) => {
      const f = new FormData();
      f.append("transcript", transcript);
      return http.upload<T.JournalEntry & { transcript: string; audio_stored: boolean }>("/voice", f);
    },
    sendAudio: (audio: Blob) => {
      const f = new FormData();
      f.append("audio", audio, "recording.webm");
      return http.upload<T.JournalEntry & { transcript: string; audio_stored: boolean }>("/voice", f);
    },
  },
  reflections: {
    prompt: () => http.get<T.ReflectionPrompt>("/reflections/prompt"),
    create: (b: { enjoyed: string; disliked: string; surprised: string; interests_changed: "yes" | "no" | "unsure";
                  related_careers: { slug: string; feeling: "enjoyed" | "disliked" }[] }) => http.post<T.Reflection>("/reflections", b),
    list: (p: { limit?: number; offset?: number } = {}) => http.get<T.Paged<T.Reflection>>(`/reflections${qs({ limit: 20, ...p })}`),
    remove: (id: number) => http.del(`/reflections/${id}`),
  },
  mentor: {
    status: () => http.get<T.MentorStatus>("/mentor/status"),
    chat: (message: string, conversation_id?: number | null) =>
      http.post<T.MentorReply>("/mentor/chat", { message, ...(conversation_id ? { conversation_id } : {}) }),
    conversations: () => http.get<T.Paged<T.Conversation>>("/mentor/conversations?limit=50"),
    conversation: (id: number) => http.get<{ id: number; title: string; messages: T.MentorMessage[] }>(`/mentor/conversations/${id}`),
    remove: (id: number) => http.del(`/mentor/conversations/${id}`),
  },
  timeline: (p: { types?: string; limit?: number; offset?: number } = {}) =>
    http.get<{ total: number; events: T.TimelineEvent[] }>(`/timeline${qs({ limit: 200, ...p })}`),
  intelligence: {
    list: (p: { career?: string; limit?: number } = {}) => http.get<T.IntelResponse>(`/intelligence${qs({ limit: 20, ...p })}`),
    sources: () => http.get<T.Source[]>("/intelligence/sources"),
  },
  opportunities: {
    list: (p: { kind?: string; career?: string; include_closed?: boolean; limit?: number } = {}) =>
      http.get<T.OpportunityResponse>(`/opportunities${qs({ limit: 30, ...p })}`),
  },
  roadmaps: {
    list: () => http.get<T.RoadmapSummary[]>("/roadmaps"),
    get: (id: number) => http.get<T.Roadmap>(`/roadmaps/${id}`),
    generate: (career_slug: string) => http.post<T.Roadmap & { recommendation_ids: unknown[] }>("/roadmaps/generate", { career_slug }),
    tick: (roadmapId: number, itemId: number, done: boolean) => http.patch<T.Roadmap>(`/roadmaps/${roadmapId}/items/${itemId}`, { done }),
    remove: (id: number) => http.del(`/roadmaps/${id}`),
  },
  research: {
    consent: () => http.get<{ research_consent: boolean }>("/research/consent"),
    setConsent: (consent: boolean) => http.put<{ research_consent: boolean }>("/research/consent", { consent }),
    log: (limit = 50) => http.get<T.LogEntry[]>(`/research/my-log${qs({ limit })}`),
  },
};

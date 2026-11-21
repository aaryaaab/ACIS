/**
 * Contract test: runs the frontend's real API client against a REAL running backend and database.
 * Skipped unless ACIS_LIVE_API is set. NEXT_PUBLIC_API_BASE must be an absolute URL, either the backend itself
 * (http://localhost:8000) or the frontend's /api proxy (http://localhost:3000/api):
 *   ACIS_LIVE_API=1 NEXT_PUBLIC_API_BASE=http://localhost:3000/api npx vitest run src/test/live
 * Browsers keep cookies for you. Node does not, so this file includes a tiny cookie jar.
 * It checks that every response has the fields the screens read, so the TypeScript types match reality.
 */
import { describe, expect, it } from "vitest";
import { API_BASE } from "@/lib/api";
import { acis } from "@/lib/endpoints";

const live = !!process.env.ACIS_LIVE_API;

/** A minimal browser-like cookie jar around fetch: stores Set-Cookie, sends Cookie, and mirrors readable cookies to document.cookie. */
const jar = new Map<string, string>();
const rawSetCookies: string[] = [];
if (live) {
  const realFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    if (jar.size) headers.set("Cookie", [...jar].map(([k, v]) => `${k}=${v}`).join("; "));
    const res = await realFetch(input, { ...init, headers });
    for (const line of res.headers.getSetCookie()) {
      rawSetCookies.push(line);
      const [pair, ...attrs] = line.split(";").map((x) => x.trim());
      const [name, ...v] = pair.split("=");
      const value = v.join("=");
      const gone = !value || attrs.some((a) => /^max-age=0$/i.test(a));
      if (gone) jar.delete(name); else jar.set(name, value);
      if (name === "acis_csrf") document.cookie = gone ? `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/` : `${name}=${value}; path=/`;
    }
    return res;
  }) as typeof fetch;
}
const keys = (o: object) => Object.keys(o).sort();
const has = (o: object, ...k: string[]) => k.forEach((x) => expect(o, `missing "${x}"`).toHaveProperty(x));

describe.skipIf(!live)("live backend contract", () => {
  const email = `contract-${Date.now()}@example.com`;
  const s: Record<string, any> = {};

  it("signs in with an httpOnly cookie, and the website never receives a token it could keep", async () => {
    await acis.auth.register({ email, password: "password123", full_name: "Contract Test" });
    const session = rawSetCookies.find((l) => /^(__Host-)?acis_session=/.test(l))!;
    const csrfCookie = rawSetCookies.find((l) => l.startsWith("acis_csrf="))!;
    expect(session).toMatch(/HttpOnly/i); expect(session).toMatch(/SameSite=lax/i); expect(session).toMatch(/Path=\//i);
    expect(csrfCookie).not.toMatch(/HttpOnly/i);                        // the page must be able to read this one
    expect((await acis.auth.me()).email).toBe(email);
    await acis.auth.login({ email, password: "password123" });
    await expect(acis.auth.login({ email, password: "wrongpass1" })).rejects.toMatchObject({ status: 401, message: "Incorrect email or password" });
    expect((await acis.auth.me()).email).toBe(email);                  // a wrong password does not end the session
    expect(localStorage.length).toBe(0);
  });

  it("refuses a forged change request that has the cookie but not the CSRF header", async () => {
    const forged = await fetch(`${API_BASE}/memory`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category: "stable", content: "forged" }), credentials: "include" });
    expect(forged.status).toBe(403);
    expect((await forged.json()).detail).toMatch(/Security check failed/);
    const wrong = await fetch(`${API_BASE}/memory`, { method: "POST", headers: { "Content-Type": "application/json", "X-CSRF-Token": "guess" }, body: JSON.stringify({ category: "stable", content: "forged" }) });
    expect(wrong.status).toBe(403);
  });

  it("onboards and returns the editable details (date of birth and marks)", async () => {
    expect((await acis.profile.get()).profile).toBeNull();
    const p = await acis.profile.onboard({ date_of_birth: "2004-05-01", guardian_consent: false, education_level: "btech_2", institution: "Test College", city: "Pune",
      long_term_goal: "Build things", lifestyle: { work_style: "team" }, financial_context: "moderate", academics: { Mathematics: 88, Physics: 75 } });
    has(p, "stage", "education_level", "onboarding_done", "is_minor", "rapid_mode_used");
    expect(p.stage).toBe("learn");
    const back = (await acis.profile.get()).profile!;
    expect(back.date_of_birth).toBe("2004-05-01");
    expect(back.academics).toEqual([{ subject: "Mathematics", score_percent: 88 }, { subject: "Physics", score_percent: 75 }]);
    expect(back.research_consent).toBe(false);
    await expect(acis.profile.onboard({ date_of_birth: "2012-01-01", guardian_consent: false, education_level: "class_9", institution: "", city: "", long_term_goal: "", lifestyle: {}, financial_context: "", academics: {} }))
      .rejects.toMatchObject({ status: 403 });
  });

  it("serves the assessment without the answer key, and scores it", async () => {
    const q = await acis.assessment.questions();
    expect(q.interests).toHaveLength(10); expect(q.aptitude).toHaveLength(12); expect(q.creative).toHaveLength(3); expect(q.personality).toHaveLength(10);
    expect(JSON.stringify(q)).not.toContain('"answer"');
    has(q.aptitude[0], "id", "aptitude", "text", "options");
    const interests = Object.fromEntries(q.interests.map((i) => [i.domain, i.domain === "technology" || i.domain === "mathematics" ? 5 : 2]));
    await expect(acis.careers.portfolio()).rejects.toMatchObject({ status: 409 });
    const r = await acis.assessment.submit({ interests, aptitude_answers: Object.fromEntries(q.aptitude.map((a) => [a.id, 0])), creative: { c1: 4, c2: 4, c3: 4 }, personality: Object.fromEntries(q.personality.map((p) => [p.id, 4])) });
    has(r, "aptitude", "personality", "portfolio", "recommendation_ids");
    expect(keys(r.aptitude)).toEqual(["creative", "logical", "numerical", "spatial", "verbal"]);
    s.portfolio = r.portfolio;
  });

  it("returns a portfolio with words for confidence, never a number", async () => {
    const p = await acis.careers.portfolio();
    has(p, "primary", "secondary", "emerging", "recommendation_allowed", "stage");
    expect(p.recommendation_allowed).toBe(true);
    has(p.primary!, "career_id", "career", "slug", "confidence", "evidence_count");
    expect(["high", "moderate", "emerging"]).toContain(p.primary!.confidence);
    expect(p.primary!.confidence).not.toBe("high");            // one assessment can never reach High
    s.slug = p.primary!.slug; s.second = [...p.secondary, ...p.emerging][0].slug;
  });

  it("explains a recommendation and accepts feedback", async () => {
    const log = await acis.research.log();
    expect(log.length).toBeGreaterThan(0);
    has(log[0], "id", "kind", "target", "confidence", "why", "algorithm_version", "model_version", "knowledge_base_version", "feedback");
    const entry = log.find((l) => l.kind === "career")!;
    const rec = await acis.careers.recommendation(entry.id);
    has(rec, "why", "what_could_change", "evidence", "confidence");
    expect(rec.what_could_change.length).toBeGreaterThan(10);
    await acis.careers.feedback(entry.id, { helpful: true, relevance: 4 });
  });

  it("compares careers and reports skill gaps", async () => {
    const c = await acis.careers.compare(s.slug, s.second);
    expect(c.careers).toHaveLength(2);
    has(c.careers[0], "slug", "name", "description", "fit", "pathway", "degrees", "skills_missing", "skills_met");
    const g = await acis.careers.skillGap(s.slug);
    has(g.skills[0], "skill_id", "slug", "skill", "required_level", "current_level", "gap", "importance", "priority", "status");
    expect((await acis.careers.list()).length).toBe(16);
    await acis.careers.addEvidence({ career_slug: s.slug, source_type: "competition", direction: 1, strength: 0.8, note: "contract test" });
    expect(Array.isArray(await acis.careers.history())).toBe(true);
  });

  it("keeps the learning model separate: abandoning a theory course changes preferences, not careers", async () => {
    const before = await acis.careers.portfolio();
    const prefs0 = await acis.learning.preferences();
    expect(keys(prefs0)).toEqual(["difficulty", "interactive", "long_sessions", "project", "reading", "theory", "video"]);
    const res = (await acis.learning.resources({ limit: 50 })).find((r) => r.title.startsWith("NPTEL: machine learning"))!;
    has(res, "id", "title", "provider", "url", "kind", "difficulty", "duration_hours", "cost", "skills", "verified", "verification_note");
    for (let i = 0; i < 4; i++) await acis.learning.feedback(res.id, { status: "abandoned", rating: 1, comment: "too theoretical" });
    const prefs1 = await acis.learning.preferences();
    expect(prefs1.theory).toBeLessThan(prefs0.theory);
    expect(prefs1.project).toBeGreaterThan(prefs0.project);
    expect(await acis.careers.portfolio()).toEqual(before);
    const rec = await acis.learning.recommended(s.slug, 5);
    has(rec, "career", "learning_style", "resources");
    expect(rec.resources.length).toBeGreaterThan(0);
  });

  it("tracks growth: skills, projects and achievements", async () => {
    await acis.growth.setSkill("python", 3);
    expect((await acis.growth.skills()).find((x) => x.slug === "python")?.level).toBe(3);
    expect((await acis.growth.catalogue()).length).toBeGreaterThan(30);
    const ideas = await acis.growth.ideas({});
    has(ideas[0], "id", "title", "description", "difficulty", "est_hours", "skills", "you_already_know");
    const p = await acis.growth.startProject({ title: ideas[0].title, idea_id: ideas[0].id });
    const done = await acis.growth.completeProject(p.id);
    has(done, "status", "career_evidence_for");
    await acis.growth.addAchievement({ kind: "certification", title: "Contract test cert" });
    expect((await acis.growth.achievements())[0].title).toBe("Contract test cert");
    const g = await acis.growth.progress();
    expect(g.projects_completed).toBe(1);
    expect((await acis.growth.projects())[0].status).toBe("completed");
  });

  it("stores memory in all four categories and can edit, search and delete", async () => {
    for (const category of ["stable", "evolving", "episodic", "temporary"] as const) await acis.memory.create({ category, content: `contract ${category} robotics memory` });
    const sum = await acis.memory.summary();
    expect(keys(sum)).toEqual(["episodic", "evolving", "stable", "temporary"]);
    const list = await acis.memory.list({ category: "temporary" });
    has(list.items[0], "id", "category", "content", "source", "confidence", "importance", "tags", "created_at", "expires_at");
    expect(list.items[0].expires_at).not.toBeNull();
    expect((await acis.memory.search("robotics")).length).toBeGreaterThan(0);
    await acis.memory.update(list.items[0].id, { content: "edited" });
    await acis.memory.remove(list.items[0].id);
  });

  it("saves journal, voice transcript and reflection, and deleting a journal entry works", async () => {
    const j = await acis.journal.create("I really enjoyed building a robot. The law lecture was boring.");
    has(j, "id", "text", "detected", "created_at");
    expect(j.detected.fields).toEqual(expect.arrayContaining(["engineering", "law_governance"]));
    const v = await acis.voice.sendTranscript("I loved the python workshop today");
    expect(v.audio_stored).toBe(false);
    expect((await acis.voice.status()).speech_to_text).toBe(false);
    expect((await acis.journal.list()).total).toBe(2);
    expect((await acis.journal.search("robot")).length).toBeGreaterThan(0);
    const pr = await acis.reflections.prompt();
    has(pr, "due", "prompts", "note"); expect(pr.prompts.length).toBeGreaterThanOrEqual(4);
    const r = await acis.reflections.create({ enjoyed: "the robotics club", disliked: "", surprised: "", interests_changed: "unsure", related_careers: [{ slug: "robotics_engineer", feeling: "enjoyed" }] });
    expect(r.career_evidence_added_for).toContain("robotics_engineer");
    await expect(acis.reflections.create({ enjoyed: "", disliked: "", surprised: "", interests_changed: "no", related_careers: [] })).rejects.toMatchObject({ status: 422 });
    await acis.journal.remove(j.id);
    expect((await acis.reflections.list()).total).toBe(1);
  });

  it("talks to the mentor with no LLM configured, with sources and a saved history", async () => {
    expect((await acis.mentor.status()).mode).toBe("rule_based");
    const a = await acis.mentor.chat("Can you compare software engineer and lawyer for me?");
    has(a, "conversation_id", "reply", "mode", "fallback_reason");
    has(a.reply, "id", "role", "content", "intent", "sources", "llm_used", "created_at");
    expect(a.reply.intent).toBe("compare"); expect(a.mode).toBe("rule_based");
    expect(a.reply.sources.length).toBeGreaterThan(0);
    const b = await acis.mentor.chat("I feel like I want to die", a.conversation_id);
    expect(b.reply.intent).toBe("support"); expect(b.reply.content).toContain("14416");
    const conv = await acis.mentor.conversation(a.conversation_id);
    expect(conv.messages.map((m) => m.role)).toEqual(["user", "mentor", "user", "mentor"]);
    expect((await acis.mentor.conversations()).total).toBe(1);
  });

  it("builds a roadmap, ticks a step, and shows the timeline", async () => {
    const road = await acis.roadmaps.generate("ai_ml_engineer");
    has(road, "id", "title", "career", "active", "progress", "items", "recommendation_ids");
    expect(road.items.map((i) => i.kind)).toEqual(expect.arrayContaining(["skill", "resource", "project"]));
    const step = road.items.find((i) => i.kind === "skill")!;
    const ticked = await acis.roadmaps.tick(road.id, step.id, true);
    expect(ticked.progress.done).toBe(1);
    expect((await acis.roadmaps.list())[0].id).toBe(road.id);
    const t = await acis.timeline();
    expect(t.total).toBeGreaterThan(5);
    has(t.events[0], "type", "at", "month", "title", "detail");
    expect(JSON.stringify(t)).not.toContain("law lecture");          // journal text never appears on the timeline
  });

  it("returns honest empty states for opportunities and intelligence, plus sources", async () => {
    const o = await acis.opportunities.list();
    expect(o.items).toEqual([]); expect(o.message).toMatch(/never invents/);
    const i = await acis.intelligence.list();
    expect(i.items).toEqual([]); expect(i.message).toMatch(/never makes any up/);
    const src = await acis.intelligence.sources();
    has(src[0], "name", "url", "licence", "attribution", "last_verified");
    expect(src.find((x) => x.name === "ACIS curated sample")?.last_verified).toBeNull();
  });

  it("handles research consent, data download, sign-out and account deletion", async () => {
    expect((await acis.research.consent()).research_consent).toBe(false);
    expect((await acis.research.setConsent(true)).research_consent).toBe(true);
    await acis.research.setConsent(false);
    const dump = await (await fetch(`${API_BASE}/research/my-data`)).json();
    has(dump, "account", "profile", "journal_entries", "memories", "mentor_conversations");
    expect(JSON.stringify(dump)).not.toMatch(/password|\$2b\$/);
    await acis.auth.logout();                                           // the server clears both cookies
    expect(jar.size).toBe(0);
    await expect(acis.auth.me()).rejects.toMatchObject({ status: 401 });
    await acis.auth.login({ email, password: "password123" });
    await acis.profile.remove();
    await expect(acis.auth.me()).rejects.toMatchObject({ status: 401 });
  });
});

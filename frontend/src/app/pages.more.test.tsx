import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import IntelligencePage from "@/app/(app)/intelligence/page";
import OpportunitiesPage from "@/app/(app)/opportunities/page";
import ProfilePage from "@/app/(app)/profile/page";
import ProgressPage from "@/app/(app)/progress/page";
import ReflectionsPage from "@/app/(app)/reflections/page";
import ResourcesPage from "@/app/(app)/resources/page";
import RoadmapPage from "@/app/(app)/roadmap/page";
import SettingsPage from "@/app/(app)/settings/page";
import SkillsPage from "@/app/(app)/skills/page";
import TimelinePage from "@/app/(app)/timeline/page";
import { authState, resetAuth } from "@/test/authMock";
import { duePrompt, emptyIntel, emptyOpps, portfolio, prefs, resource, skillGap } from "@/test/fixtures";
import { fail, mockApi } from "@/test/mockApi";
import { nav, resetNav } from "@/test/navMock";

vi.mock("@/lib/auth", async () => (await import("@/test/authMock")).authModule);
vi.mock("next/navigation", async () => (await import("@/test/navMock")).navModule);
beforeEach(() => { resetAuth(); resetNav(); });

const careers = [{ id: 1, slug: "software_engineer", name: "Software Engineer", description: "" }, { id: 2, slug: "ai_ml_engineer", name: "AI / Machine Learning Engineer", description: "" }];

describe("opportunities", () => {
  const opp = (o = {}) => ({ id: 1, title: "TEST FIXTURE hackathon", kind: "hackathon", provider: "Fixture Provider", eligibility: "Open to college students", deadline: "2026-12-01", status: "open", days_left: 12,
    url: "https://example.org/hack", career_slugs: ["software_engineer"], verified_on: "2026-11-15", verified_days_ago: 4, needs_reverification: false,
    verification_note: "Last verified 4 day(s) ago. Always confirm the deadline and eligibility on the provider's own page.", source: { name: "Fixture", url: "https://example.org" }, ...o });
  it("is honest when nothing verified is saved, and points to official sources", async () => {
    mockApi({ "GET /careers": careers, "GET /opportunities": emptyOpps });
    render(<OpportunitiesPage />);
    expect(await screen.findByText("No verified opportunities saved yet")).toBeInTheDocument();
    expect(screen.getByText(/never invents opportunities or deadlines/)).toBeInTheDocument();
    expect(screen.getByText(/official websites of colleges/)).toBeInTheDocument();
  });
  it("shows deadline, eligibility, verification date and an official link", async () => {
    mockApi({ "GET /careers": careers, "GET /opportunities": { total: 1, items: [opp()], message: "", note: "Deadlines and eligibility can change." } });
    render(<OpportunitiesPage />);
    expect(await screen.findByText("TEST FIXTURE hackathon")).toBeInTheDocument();
    expect(screen.getByText(/12 days left/)).toBeInTheDocument();
    expect(screen.getByText("Open to college students")).toBeInTheDocument();
    expect(screen.getByText(/Last verified 4 day\(s\) ago/)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Open the official page/ });
    expect(link).toHaveAttribute("href", "https://example.org/hack");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
  it("warns when verification is old and when no deadline is listed", async () => {
    mockApi({ "GET /careers": careers, "GET /opportunities": { total: 2, note: "n", message: "", items: [
      opp({ id: 1, title: "Stale one", needs_reverification: true, verified_days_ago: 45, verification_note: "Last verified 45 day(s) ago." }), opp({ id: 2, title: "No date", deadline: null, status: "no_deadline_listed", days_left: null })] } });
    render(<OpportunitiesPage />);
    expect(await screen.findByText(/It may be out of date/)).toBeInTheDocument();
    expect(screen.getByText("No deadline listed")).toBeInTheDocument();
  });
  it("asks the server for closed ones only when the box is ticked", async () => {
    const api = mockApi({ "GET /careers": careers, "GET /opportunities": emptyOpps });
    render(<OpportunitiesPage />);
    await screen.findByText("No verified opportunities saved yet");
    await userEvent.click(screen.getByLabelText("Include closed ones"));
    await waitFor(() => expect(api.calls.some((c) => c.path.includes("include_closed=true"))).toBe(true));
    await userEvent.selectOptions(screen.getByLabelText("Type"), "scholarship");
    await waitFor(() => expect(api.calls.some((c) => c.path.includes("kind=scholarship"))).toBe(true));
  });
  it("shows an error with retry when loading fails", async () => {
    mockApi({ "GET /careers": careers, "GET /opportunities": fail(500, undefined) });
    render(<OpportunitiesPage />);
    expect(await screen.findByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});

describe("career intelligence", () => {
  const item = { id: 1, title: "A real update", summary: "A short excerpt.", url: "https://example.org/a", retrieved_on: "2026-11-01", age_days: 18, stale: false,
    source: { name: "Fixture Feed", url: "https://example.org", licence: "Test licence", attribution: "Fixture", last_verified: "2026-11-01" }, why_shown: "Tagged for Software Engineer, one of your primary directions" };
  it("does not invent updates: an empty state explains why", async () => {
    mockApi({ "GET /careers": careers, "GET /intelligence": emptyIntel });
    render(<IntelligencePage />);
    expect(await screen.findByText("No updates saved yet")).toBeInTheDocument();
    expect(screen.getByText(/stays empty until real sources are connected/)).toBeInTheDocument();
  });
  it("shows the source, the retrieval date and why it is relevant", async () => {
    mockApi({ "GET /careers": careers, "GET /intelligence": { total: 1, items: [item, { ...item, id: 2, title: "Old one", stale: true }], message: "", note: "Check the original source before acting on it." } });
    render(<IntelligencePage />);
    expect(await screen.findByText("A real update")).toBeInTheDocument();
    expect(screen.getAllByText(/Fixture Feed/)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/retrieved 1 Nov 2026/)[0]).toBeInTheDocument();
    expect(screen.getAllByText(/one of your primary directions/)[0]).toBeInTheDocument();
    expect(screen.getByText("Older than 60 days")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /Read at the source/ })[0]).toHaveAttribute("href", "https://example.org/a");
  });
  it("lists sources with licence and says 'Not verified yet' where that is true", async () => {
    mockApi({ "GET /careers": careers, "GET /intelligence": emptyIntel, "GET /intelligence/sources": [
      { name: "ACIS curated sample", url: "", licence: "Project-authored", attribution: "Written by the ACIS team", last_verified: null }, { name: "Verified Source", url: "https://x.org", licence: "CC", attribution: "X", last_verified: "2026-11-10" }] });
    render(<IntelligencePage />);
    await userEvent.click(await screen.findByRole("tab", { name: "Sources" }));
    expect(await screen.findByText("Not verified yet")).toBeInTheDocument();
    expect(screen.getByText("Verified 10 Nov 2026")).toBeInTheDocument();
    expect(screen.getByText("Licence: Project-authored")).toBeInTheDocument();
  });
});

describe("reflections, journal and voice", () => {
  const base = { "GET /reflections/prompt": duePrompt, "GET /careers": careers, "GET /journal": { total: 0, items: [] }, "GET /reflections": { total: 0, items: [] }, "GET /voice/status": { speech_to_text: false, message: "" } };
  it("shows the prompt and will not save an empty reflection", async () => {
    const api = mockApi(base);
    render(<ReflectionsPage />);
    expect(await screen.findByText(/You haven't written a reflection yet/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save reflection" }));
    expect(await screen.findByText("Write something in at least one box, or pick a career.")).toBeInTheDocument();
    expect(api.called("POST /reflections")).toHaveLength(0);
  });
  it("saves a structured reflection and says which careers were gently nudged", async () => {
    const api = mockApi({ ...base, "POST /reflections": { id: 1, career_evidence_added_for: ["ai_ml_engineer"], note: "A single reflection only nudges your career picture slightly." } });
    render(<ReflectionsPage />);
    await userEvent.type(await screen.findByLabelText(/What did you enjoy most over the last few weeks/), "Building a classifier");
    await userEvent.click(screen.getByRole("radio", { name: "Unsure" }));
    await userEvent.click(screen.getByRole("button", { name: /Add a career/ }));
    await userEvent.selectOptions(screen.getByLabelText("Career 1"), "ai_ml_engineer");
    await userEvent.click(screen.getByRole("button", { name: "Save reflection" }));
    expect(await screen.findByText(/It gently nudged: AI \/ Machine Learning Engineer/)).toBeInTheDocument();
    expect(api.called("POST /reflections")[0].body).toEqual({ enjoyed: "Building a classifier", disliked: "", surprised: "", interests_changed: "unsure", related_careers: [{ slug: "ai_ml_engineer", feeling: "enjoyed" }] });
    expect(screen.getByLabelText(/What did you enjoy most/)).toHaveValue("");
  });
  it("tells the student the journal is private and does not read mood or health", async () => {
    mockApi(base);
    render(<ReflectionsPage />);
    await userEvent.click(await screen.findByRole("tab", { name: "Journal" }));
    expect(await screen.findByText(/Only you can read your journal/)).toBeInTheDocument();
    expect(screen.getByText(/does/)).toHaveTextContent(/not.*try to read your mood or health/);
  });
  it("saves a journal entry and shows what was detected", async () => {
    const api = mockApi({ ...base, "POST /journal": { id: 1, text: "I loved the robot", detected: { fields: ["engineering"], skills: [] }, created_at: "2026-11-19T10:00:00", career_evidence_added_for: ["robotics_engineer"] } });
    render(<ReflectionsPage />);
    await userEvent.click(await screen.findByRole("tab", { name: "Journal" }));
    await userEvent.type(await screen.findByLabelText("Write freely"), "I loved the robot");
    await userEvent.click(screen.getByRole("button", { name: "Save entry" }));
    expect(await screen.findByText(/You touched on: engineering/)).toBeInTheDocument();
    expect(screen.getByText(/added mild evidence/)).toBeInTheDocument();
    expect(api.called("POST /journal")[0].body).toEqual({ text: "I loved the robot" });
  });
  it("refuses a blank journal entry", async () => {
    const api = mockApi(base);
    render(<ReflectionsPage />);
    await userEvent.click(await screen.findByRole("tab", { name: "Journal" }));
    await userEvent.click(await screen.findByRole("button", { name: "Save entry" }));
    expect(await screen.findByText("Write something first.")).toBeInTheDocument();
    expect(api.called("POST /journal")).toHaveLength(0);
  });
  it("lists and deletes journal entries", async () => {
    const entry = { id: 4, text: "My old entry", detected: { fields: ["technology"], skills: [] }, created_at: "2026-11-01T00:00:00" };
    const api = mockApi({ ...base, "GET /journal": { total: 1, items: [entry] }, "DELETE /journal/4": null });
    render(<ReflectionsPage />);
    await userEvent.click(await screen.findByRole("tab", { name: "Journal" }));
    expect(await screen.findByText("My old entry")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Delete journal entry" }));
    await waitFor(() => expect(api.called("DELETE /journal/4")).toHaveLength(1));
  });
  it("voice journal works with a typed transcript and says audio is never stored", async () => {
    const api = mockApi({ ...base, "POST /voice": { voice_id: 1, transcript: "I enjoyed python", detected: { fields: ["technology"], skills: [] }, id: 1, text: "I enjoyed python", created_at: "2026-11-19T10:00:00", audio_stored: false } });
    render(<ReflectionsPage />);
    await userEvent.click(await screen.findByRole("tab", { name: "Voice" }));
    expect(await screen.findByText(/audio itself is never stored/)).toBeInTheDocument();
    expect(screen.getByText(/Voice input isn't available in this browser/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save as a journal entry" }));
    expect(await screen.findByText("Say or type something first.")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Your entry/), "I enjoyed python");
    await userEvent.click(screen.getByRole("button", { name: "Save as a journal entry" }));
    expect(await screen.findByText(/ACIS noticed you mentioned: technology/)).toBeInTheDocument();
    expect(api.called("POST /voice")[0].body).toEqual({ transcript: "I enjoyed python" });
  });
});

describe("settings and privacy", () => {
  const base = { "GET /research/consent": { research_consent: false }, "GET /mentor/status": { mode: "rule_based", provider: null, note: "No LLM is configured. The mentor answers from your saved data using built-in rules." }, "GET /research/my-log": [] };
  it("research consent is off by default and can be switched on and off", async () => {
    const api = mockApi({ ...base, "PUT /research/consent": ({ body }: { body: { consent: boolean } }) => ({ research_consent: body.consent }) });
    render(<SettingsPage />);
    const box = await screen.findByRole("checkbox", { name: /Include my anonymised data in research/ });
    expect(box).not.toBeChecked();
    expect(screen.getByText(/never included/)).toBeInTheDocument();
    await userEvent.click(box);
    await waitFor(() => expect(box).toBeChecked());
    expect(api.called("PUT /research/consent")[0].body).toEqual({ consent: true });
    await userEvent.click(box);
    await waitFor(() => expect(box).not.toBeChecked());
    expect(await screen.findByText(/no longer included in research exports/)).toBeInTheDocument();
  });
  it("downloads all of the student's data", async () => {
    mockApi({ ...base, "GET /research/my-data": { account: { email: "asha@example.com" } } });
    const create = vi.fn(() => "blob:fake"); const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});       // jsdom cannot navigate
    render(<SettingsPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Download my data/ }));
    expect(await screen.findByText("Your data has been downloaded.")).toBeInTheDocument();
    expect(create).toHaveBeenCalled();
  });
  it("deleting the account needs the word DELETE, then removes it and signs out", async () => {
    const api = mockApi({ ...base, "DELETE /profile": null });
    render(<SettingsPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Delete my account" }));
    const confirm = screen.getByRole("button", { name: "Delete everything" });
    expect(confirm).toBeDisabled();
    await userEvent.type(screen.getByLabelText("Confirmation"), "delete");
    expect(confirm).toBeDisabled();                       // wrong case does not count
    await userEvent.clear(screen.getByLabelText("Confirmation"));
    await userEvent.type(screen.getByLabelText("Confirmation"), "DELETE");
    await userEvent.click(confirm);
    await waitFor(() => expect(api.called("DELETE /profile")).toHaveLength(1));
    expect(authState.current.logout).toHaveBeenCalled();
    expect(nav.replace).toHaveBeenCalledWith("/");
  });
  it("shows the recommendation log: why, confidence, rule version and feedback", async () => {
    mockApi({ ...base, "GET /research/my-log": [{ id: 1, created_at: "2026-11-18T10:00:00", kind: "career", target: "Software Engineer", confidence: "moderate", why: "Because you rated technology highly.", algorithm_version: "cm-1.0", model_version: "rule-based (no LLM)", knowledge_base_version: "kb", feedback: [{ helpful: true, relevance: 5, comment: "" }] }] });
    render(<SettingsPage />);
    expect(await screen.findByText("Because you rated technology highly.")).toBeInTheDocument();
    expect(screen.getByText(/Rules cm-1.0 · rule-based \(no LLM\)/)).toBeInTheDocument();
    expect(screen.getByText("Helpful")).toBeInTheDocument();
  });
  it("says plainly that the mentor needs no paid service", async () => {
    mockApi(base);
    render(<SettingsPage />);
    expect(await screen.findByText(/never needs a paid service/)).toBeInTheDocument();
    expect(screen.getByText("Built-in rules")).toBeInTheDocument();
  });
});

describe("learning resources", () => {
  const routes = (over: Record<string, unknown> = {}) => ({ "GET /careers/portfolio": portfolio(), "GET /careers": careers, "GET /growth/skills/catalogue": [{ slug: "python", name: "Python", category: "technical" }],
    "GET /learning/preferences": prefs, "GET /learning/recommended": { career: "Software Engineer", learning_style: prefs, resources: [resource()] }, "GET /learning/resources": [resource({ id: 8, title: "Kaggle Learn: SQL", fit: undefined })], ...over });
  it("shows free resources with honest verification notes and a fit explained in words", async () => {
    mockApi(routes());
    render(<ResourcesPage />);
    expect(await screen.findByText("CS50P: Introduction to Programming with Python")).toBeInTheDocument();
    expect(screen.getByText(/Link not verified yet/)).toBeInTheDocument();
    expect(screen.getByText("Suits how you learn")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open resource/ })).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByText(/about 40 hours · Free/)).toBeInTheDocument();
  });
  it("requires a rating before saving feedback, then sends it to the learning model", async () => {
    const api = mockApi(routes({ "POST /learning/resources/7/feedback": { feedback_id: 1, preferences: prefs } }));
    render(<ResourcesPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Rate or track" }));
    const dialog = screen.getByRole("dialog", { name: "How was it?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(await within(dialog).findByText("Please give it a rating from 1 to 5.")).toBeInTheDocument();
    expect(api.called("POST /learning/resources/7/feedback")).toHaveLength(0);
    await userEvent.click(within(dialog).getByRole("radio", { name: /I stopped partway/ }));
    await userEvent.click(within(dialog).getByRole("radio", { name: "1 of 5" }));
    await userEvent.type(within(dialog).getByLabelText(/Anything to add/), "too theoretical");
    await userEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(api.called("POST /learning/resources/7/feedback")[0].body).toEqual({ status: "abandoned", rating: 1, comment: "too theoretical" });
  });
  it("tells the student that rating changes learning choices, never career directions", async () => {
    mockApi(routes());
    render(<ResourcesPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Rate or track" }));
    expect(screen.getByText(/does not change which careers fit you/)).toBeInTheDocument();
  });
  it("browses all resources with filters", async () => {
    const api = mockApi(routes());
    render(<ResourcesPage />);
    await userEvent.click(await screen.findByRole("tab", { name: "Browse all" }));
    expect(await screen.findByText("Kaggle Learn: SQL")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Format"), "interactive");
    await waitFor(() => expect(api.calls.some((c) => c.path.includes("kind=interactive"))).toBe(true));
  });
  it("explains when there is nothing to recommend", async () => {
    mockApi(routes({ "GET /learning/recommended": { career: "Software Engineer", learning_style: prefs, resources: [] } }));
    render(<ResourcesPage />);
    expect(await screen.findByText("Nothing to recommend")).toBeInTheDocument();
  });
});

describe("roadmap", () => {
  const item = (o = {}) => ({ id: 1, position: 0, kind: "skill", title: "Build Python up to level 3 (you are at 0)", ref_id: 1, done: false, auto_done: false, effective_done: false, skill: "Python", current_level: 0, required_level: 3, ...o });
  const road = (items = [item(), item({ id: 2, position: 1, kind: "resource", title: "Study: CS50P (Harvard CS50)", ref_id: 7, url: "https://cs50.harvard.edu/python/", provider: "Harvard CS50", resource_kind: "video", difficulty: 1, verified: false, current_level: undefined }),
    item({ id: 3, position: 2, kind: "project", title: "Project: Number guessing game", ref_id: 4, description: "Practise loops.", difficulty: 1, est_hours: 6 })]) =>
    ({ id: 1, title: "Roadmap to Software Engineer", career: { slug: "software_engineer", name: "Software Engineer" }, active: true, created_at: "2026-11-18T10:00:00", progress: { done: 0, total: items.length, percent: 0 }, items });
  const summary = { id: 1, title: "Roadmap to Software Engineer", career: { slug: "software_engineer", name: "Software Engineer" }, active: true, created_at: "2026-11-18T10:00:00", progress: { done: 0, total: 3, percent: 0 } };
  const routes = (over: Record<string, unknown> = {}) => ({ "GET /roadmaps": [summary], "GET /roadmaps/1": road(), "GET /careers/portfolio": portfolio(), "GET /careers": careers, ...over });

  it("shows ordered steps: skill, resource and project, with an unverified-link warning", async () => {
    mockApi(routes());
    render(<RoadmapPage />);
    expect(await screen.findByRole("heading", { name: "Roadmap to Software Engineer" })).toBeInTheDocument();
    const steps = Array.from(screen.getByRole("list", { name: "Roadmap steps" }).children);    // direct steps only (a skill step holds its own bar)
    expect(steps).toHaveLength(3);
    expect(steps[0]).toHaveTextContent("Build Python up to level 3");
    expect(steps[1]).toHaveTextContent(/Link not verified yet/);
    expect(steps[2]).toHaveTextContent("Practise loops.");
    expect(screen.getByRole("progressbar", { name: "Roadmap progress" })).toHaveAttribute("aria-valuenow", "0");
  });
  it("ticks a step off through the API", async () => {
    const api = mockApi(routes({ "PATCH /roadmaps/1/items/1": road([item({ done: true, effective_done: true }), item({ id: 2, kind: "resource", title: "Study: X", position: 1 })]) }));
    render(<RoadmapPage />);
    await userEvent.click(await screen.findByRole("checkbox", { name: /Build Python up to level 3/ }));
    await waitFor(() => expect(api.called("PATCH /roadmaps/1/items/1")).toHaveLength(1));
    expect(api.called("PATCH /roadmaps/1/items/1")[0].body).toEqual({ done: true });
  });
  it("marks steps that complete themselves because real progress caught up", async () => {
    mockApi(routes({ "GET /roadmaps/1": road([item({ auto_done: true, effective_done: true })]) }));
    render(<RoadmapPage />);
    expect(await screen.findByText("Done automatically")).toBeInTheDocument();
  });
  it("builds a roadmap for the chosen career", async () => {
    const api = mockApi(routes({ "GET /roadmaps": [], "POST /roadmaps/generate": { ...road(), recommendation_ids: [] } }));
    render(<RoadmapPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Build my roadmap" }));
    expect(await screen.findByRole("heading", { name: "Roadmap to Software Engineer" })).toBeInTheDocument();
    expect(api.called("POST /roadmaps/generate")[0].body).toEqual({ career_slug: "software_engineer" });
  });
  it("shows the server's reason when a roadmap isn't allowed yet (Explore stage)", async () => {
    mockApi(routes({ "GET /roadmaps": [], "POST /roadmaps/generate": fail(409, "Roadmaps start once you are past the Explore stage. For now, try small projects and write reflections to see what you enjoy.") }));
    render(<RoadmapPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Build my roadmap" }));
    expect(await screen.findByText(/past the Explore stage/)).toBeInTheDocument();
  });
  it("shows an empty state with guidance when there is no roadmap", async () => {
    mockApi(routes({ "GET /roadmaps": [] }));
    render(<RoadmapPage />);
    expect(await screen.findByText("No roadmap yet")).toBeInTheDocument();
  });
  it("starts a project from the roadmap", async () => {
    const api = mockApi(routes({ "POST /growth/projects": { id: 9 } }));
    render(<RoadmapPage />);
    await userEvent.click(await screen.findByRole("button", { name: "Start this project" }));
    expect(await screen.findByText(/Project started/)).toBeInTheDocument();
    expect(api.called("POST /growth/projects")[0].body).toEqual({ title: "Number guessing game", idea_id: 4 });
  });
});

describe("skills dashboard", () => {
  const routes = (over: Record<string, unknown> = {}) => ({ "GET /careers/portfolio": portfolio(), "GET /careers": careers, "GET /growth/skills": [{ slug: "git", name: "Git & version control", level: 3, category: "technical" }],
    "GET /growth/skills/catalogue": [{ slug: "python", name: "Python", category: "technical" }, { slug: "git", name: "Git & version control", category: "technical" }], "GET /careers/software_engineer/skill-gap": skillGap, ...over });
  it("shows the gap against the primary direction and marks what to learn first", async () => {
    mockApi(routes());
    render(<SkillsPage />);
    expect(await screen.findByRole("progressbar", { name: "Python" })).toBeInTheDocument();
    expect(screen.getByText("Learn first")).toBeInTheDocument();
    expect(screen.getByText("Not started")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Skills dashboard" })).toBeInTheDocument();
  });
  it("saves a skill level and requires a skill to be chosen", async () => {
    const api = mockApi(routes({ "PUT /growth/skills": { slug: "python", level: 4 } }));
    render(<SkillsPage />);
    await screen.findByRole("progressbar", { name: "Python" });
    await userEvent.click(screen.getByRole("button", { name: "Save level" }));
    expect(await screen.findByText("Choose a skill first.")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Skill"), "python");
    await userEvent.selectOptions(screen.getByLabelText("Your level"), "4");
    await userEvent.click(screen.getByRole("button", { name: "Save level" }));
    expect(await screen.findByText(/Your skill gaps are updated/)).toBeInTheDocument();
    expect(api.called("PUT /growth/skills")[0].body).toEqual({ skill_slug: "python", level: 4 });
  });
  it("uses the career from the link when one is given", async () => {
    resetNav("career=ai_ml_engineer");
    const api = mockApi(routes({ "GET /careers/ai_ml_engineer/skill-gap": { career: "AI Engineer", skills: [] } }));
    render(<SkillsPage />);
    await waitFor(() => expect(api.called("GET /careers/ai_ml_engineer/skill-gap")).toHaveLength(1));
    expect(await screen.findByText(/No skills are listed for this career yet/)).toBeInTheDocument();
  });
});

describe("progress", () => {
  const idea = { id: 4, title: "Number guessing game", description: "Practise loops.", difficulty: 1, est_hours: 6, skills: ["python"], you_already_know: 0 };
  const routes = (over: Record<string, unknown> = {}) => ({ "GET /growth/progress": { skills_tracked: 2, projects_completed: 1, projects_in_progress: 1, achievements: { competition: 1 } },
    "GET /growth/projects": [{ id: 1, title: "Spam classifier", description: "", status: "in_progress", skills: ["python"], in_portfolio: false, repo_url: "", started_at: "2026-11-10T10:00:00", completed_at: null },
      { id: 2, title: "Portfolio site", description: "", status: "completed", skills: ["web_development"], in_portfolio: true, repo_url: "", started_at: "2026-10-01T10:00:00", completed_at: "2026-10-20T10:00:00" }],
    "GET /growth/projects/ideas": [idea], "GET /growth/achievements": [{ id: 1, kind: "competition", title: "College hackathon", description: "", date: "2026-11-02" }], "GET /timeline": { total: 0, events: [] }, "GET /careers": careers, ...over });
  it("shows the Growth model: counts, in-progress projects, the portfolio and achievements", async () => {
    mockApi(routes());
    render(<ProgressPage />);
    expect(await screen.findByText("Spam classifier")).toBeInTheDocument();
    expect(screen.getByText("Portfolio site")).toBeInTheDocument();
    expect(screen.getByText("College hackathon")).toBeInTheDocument();
    expect(screen.getAllByText("Growth model").length).toBeGreaterThan(0);
  });
  it("completing a project says which careers it gently supports, by name", async () => {
    const api = mockApi(routes({ "POST /growth/projects/1/complete": { id: 1, status: "completed", career_evidence_for: ["ai_ml_engineer"] } }));
    render(<ProgressPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Mark complete/ }));
    expect(await screen.findByText(/mild evidence for: AI \/ Machine Learning Engineer/)).toBeInTheDocument();
    expect(api.called("POST /growth/projects/1/complete")).toHaveLength(1);
  });
  it("starts a catalogue project with its idea id", async () => {
    const api = mockApi(routes({ "POST /growth/projects": { id: 3 } }));
    render(<ProgressPage />);
    const ideaCard = (await screen.findByText("Number guessing game")).closest("li")!;
    await userEvent.click(within(ideaCard).getByRole("button", { name: "Start" }));
    expect(await screen.findByText(/Project started/)).toBeInTheDocument();
    expect(api.called("POST /growth/projects")[0].body).toEqual({ title: "Number guessing game", idea_id: 4 });
  });
  it("validates a custom project and achievement before calling the server", async () => {
    const api = mockApi(routes());
    render(<ProgressPage />);
    await screen.findByText("Spam classifier");
    await userEvent.click(screen.getByRole("button", { name: "Start project" }));
    expect(await screen.findByText("Give your project a name.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Add achievement" }));
    expect(await screen.findByText("Describe what you achieved.")).toBeInTheDocument();
    expect(api.called("POST /growth/projects")).toHaveLength(0);
    expect(api.called("POST /growth/achievements")).toHaveLength(0);
  });
  it("adds an achievement", async () => {
    const api = mockApi(routes({ "POST /growth/achievements": { id: 2 } }));
    render(<ProgressPage />);
    await screen.findByText("Spam classifier");
    await userEvent.selectOptions(screen.getByLabelText("Type"), "certification");
    await userEvent.type(screen.getByLabelText("What did you achieve?"), "Python certificate");
    await userEvent.click(screen.getByRole("button", { name: "Add achievement" }));
    expect(await screen.findByText("Achievement added.")).toBeInTheDocument();
    expect(api.called("POST /growth/achievements")[0].body).toEqual({ kind: "certification", title: "Python certificate", career_slug: null });
  });
});

describe("timeline", () => {
  const ev = (type: string, title: string, at: string, detail = "") => ({ type, title, at, month: at.slice(0, 7), detail, ref: null });
  const data = { total: 4, events: [ev("project", "Completed project: Spam classifier", "2026-11-12T10:00:00"), ev("journal", "Wrote a journal entry", "2026-11-05T10:00:00", "Touched on: technology"),
    ev("career", "Software Engineer became a primary direction", "2026-10-20T10:00:00", "Confidence: moderate."), ev("assessment", "Completed an assessment", "2026-10-20T09:00:00")] };
  it("groups events by month, newest first, with the model each belongs to", async () => {
    mockApi({ "GET /timeline": data });
    render(<TimelinePage />);
    const headings = await screen.findAllByRole("heading", { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual(["November 2026", "October 2026"]);
    expect(screen.getByText("Completed project: Spam classifier")).toBeInTheDocument();
    expect(screen.getByText("Confidence: moderate.")).toBeInTheDocument();
  });
  it("lets the student hide a type of event", async () => {
    mockApi({ "GET /timeline": data });
    render(<TimelinePage />);
    await screen.findByText("Wrote a journal entry");
    await userEvent.click(screen.getByRole("button", { name: /Journal/ }));
    expect(screen.queryByText("Wrote a journal entry")).toBeNull();
    expect(screen.getByText("Completed project: Spam classifier")).toBeInTheDocument();
  });
  it("invites the student to begin when there is nothing yet", async () => {
    mockApi({ "GET /timeline": { total: 0, events: [] } });
    render(<TimelinePage />);
    expect(await screen.findByText("Your story starts here")).toBeInTheDocument();
  });
  it("states that private text never appears on the timeline", async () => {
    mockApi({ "GET /timeline": data });
    render(<TimelinePage />);
    expect(await screen.findByText(/text never appears here/)).toBeInTheDocument();
  });
  it("shows an error with retry", async () => {
    mockApi({ "GET /timeline": fail(500, undefined) });
    render(<TimelinePage />);
    expect(await screen.findByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});

describe("profile and memory", () => {
  const mem = (o = {}) => ({ id: 1, category: "stable", content: "Wants to build medical devices", source: "student", confidence: 0.9, importance: 0.8, tags: [], created_at: "2026-11-01T10:00:00", expires_at: null, ...o });
  const routes = (over: Record<string, unknown> = {}) => ({ "GET /learning/preferences": prefs, "GET /profile": { user: { email: "asha@example.com", full_name: "Asha Rao" }, profile: authState.current.profile },
    "GET /memory/summary": { stable: 1, evolving: 0, episodic: 0, temporary: 1 }, "GET /memory": { total: 2, items: [mem(), mem({ id: 2, category: "temporary", content: "Recently asked the mentor about: compare.", source: "mentor", expires_at: "2026-11-30T00:00:00" })] }, ...over });
  it("shows the student's details and marks", async () => {
    mockApi(routes());
    render(<ProfilePage />);
    expect(await screen.findByText("Test College")).toBeInTheDocument();
    expect(screen.getByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByText("88%")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Edit details" })).toHaveAttribute("href", "/onboarding?edit=1");
    expect(screen.getByText(/only how ACIS teaches you, never which careers fit you/)).toBeInTheDocument();
  });
  it("lists memories with their source and category, and the four categories as tabs", async () => {
    mockApi(routes());
    render(<ProfilePage />);
    await userEvent.click(await screen.findByRole("tab", { name: "What ACIS remembers" }));
    expect(await screen.findByText("Wants to build medical devices")).toBeInTheDocument();
    expect(screen.getByText("Added by you")).toBeInTheDocument();
    expect(screen.getByText("From a mentor chat")).toBeInTheDocument();
    for (const t of ["Stable", "Evolving", "Episodic", "Temporary"]) expect(screen.getByRole("tab", { name: new RegExp(t) })).toBeInTheDocument();
  });
  it("lets the student edit, delete and add memories", async () => {
    const api = mockApi(routes({ "PATCH /memory/1": mem({ content: "Edited" }), "DELETE /memory/2": null, "POST /memory": mem({ id: 3 }) }));
    render(<ProfilePage />);
    await userEvent.click(await screen.findByRole("tab", { name: "What ACIS remembers" }));
    await screen.findByText("Wants to build medical devices");
    await userEvent.click(screen.getAllByRole("button", { name: "Edit memory" })[0]);
    const box = screen.getAllByLabelText("Memory")[0];
    await userEvent.clear(box); await userEvent.type(box, "Edited");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.called("PATCH /memory/1")[0]?.body).toEqual({ content: "Edited" }));
    await userEvent.click(screen.getAllByRole("button", { name: "Delete memory" })[1]);
    await waitFor(() => expect(api.called("DELETE /memory/2")).toHaveLength(1));
    await userEvent.click(screen.getByRole("button", { name: "Add memory" }));
    expect(await screen.findByText("Write something for ACIS to remember.")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText("What should it remember?"), "Prefers hands-on learning");
    await userEvent.click(screen.getByRole("button", { name: "Add memory" }));
    await waitFor(() => expect(api.called("POST /memory")[0]?.body).toMatchObject({ category: "stable", content: "Prefers hands-on learning" }));
  });
  it("explains that temporary memories fade by themselves", async () => {
    mockApi(routes());
    render(<ProfilePage />);
    await userEvent.click(await screen.findByRole("tab", { name: "What ACIS remembers" }));
    await userEvent.click(await screen.findByRole("tab", { name: /Temporary/ }));
    expect(await screen.findByText(/fades by itself/)).toBeInTheDocument();
  });
});

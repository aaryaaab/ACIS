import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import CareersPage from "@/app/(app)/careers/page";
import ComparePage from "@/app/(app)/compare/page";
import Dashboard from "@/app/(app)/dashboard/page";
import MentorPage from "@/app/(app)/mentor/page";
import { profile, resetAuth } from "@/test/authMock";
import { duePrompt, emptyIntel, emptyOpps, explorePortfolio, portfolio, prefs, skillGap } from "@/test/fixtures";
import { fail, mockApi } from "@/test/mockApi";
import { resetNav } from "@/test/navMock";

vi.mock("@/lib/auth", async () => (await import("@/test/authMock")).authModule);
vi.mock("next/navigation", async () => (await import("@/test/navMock")).navModule);
beforeEach(() => { resetAuth(); resetNav(); });

const dashRoutes = (over: Record<string, unknown> = {}) => ({
  "GET /careers/portfolio": portfolio(), "GET /learning/preferences": { ...prefs, project: 0.8 }, "GET /growth/progress": { skills_tracked: 3, projects_completed: 1, projects_in_progress: 0, achievements: {} },
  "GET /roadmaps": [], "GET /reflections/prompt": duePrompt, "GET /intelligence": emptyIntel, "GET /opportunities": emptyOpps,
  "GET /careers/software_engineer/skill-gap": skillGap, ...over,
});

describe("dashboard", () => {
  it("shows the stage, directions, the three models, and honest empty states", async () => {
    mockApi(dashRoutes());
    render(<Dashboard />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Asha/);
    expect(screen.getByRole("list", { name: "Your stage" })).toBeInTheDocument();
    expect((await screen.findAllByText("Software Engineer")).length).toBeGreaterThanOrEqual(2);   // directions card and Career-model panel
    expect(screen.getByRole("heading", { name: /Your three models/ })).toBeInTheDocument();
    for (const name of ["Career model", "Learning model", "Growth model"]) expect(screen.getByText(name)).toBeInTheDocument();
    expect(await screen.findByText(/ACIS only shows items it has actually retrieved/)).toBeInTheDocument();    // intelligence empty state
    expect(await screen.findByText(/never invents opportunities or deadlines/)).toBeInTheDocument();           // opportunities empty state
    expect(screen.getByRole("link", { name: /Open the mentor/ })).toHaveAttribute("href", "/mentor");
  });
  it("prompts for a reflection when one is due", async () => {
    mockApi(dashRoutes());
    render(<Dashboard />);
    expect(await screen.findByText("What did you enjoy most over the last few weeks?")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Reflect now" })).toHaveAttribute("href", "/reflections");
  });
  it("shows skill progress against the primary direction", async () => {
    mockApi(dashRoutes());
    render(<Dashboard />);
    expect(await screen.findByRole("progressbar", { name: "Python" })).toBeInTheDocument();
    expect(screen.getByText("Not started")).toBeInTheDocument();
    expect(screen.getByText("Met")).toBeInTheDocument();
  });
  it("asks for the assessment when there is no career profile yet", async () => {
    mockApi(dashRoutes({ "GET /careers/portfolio": fail(409, "Complete the assessment first") }));
    render(<Dashboard />);
    expect(await screen.findByRole("link", { name: /start the assessment/i })).toBeInTheDocument();
  });
  it("one failing panel does not break the rest of the page", async () => {
    mockApi(dashRoutes({ "GET /intelligence": fail(500, undefined) }));
    render(<Dashboard />);
    expect((await screen.findAllByText("Software Engineer")).length).toBeGreaterThan(0);
    expect(await screen.findByText("Something went wrong on our side. Please try again.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Opportunities" })).toBeInTheDocument();
  });
  it("gives an Explore-stage student things to try instead of a verdict", async () => {
    resetAuth({ profile: profile({ stage: "explore" }) });
    mockApi(dashRoutes({ "GET /careers/portfolio": explorePortfolio(), "GET /careers/software_engineer/skill-gap": skillGap,
      "GET /growth/projects/ideas": [{ id: 1, title: "Number guessing game", description: "Practise loops.", difficulty: 1, est_hours: 6, skills: ["python"], you_already_know: 0 }] }));
    render(<Dashboard />);
    expect(await screen.findByText(/not a recommendation/)).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Try something small" })).toBeInTheDocument();
    expect(screen.getByText("Number guessing game")).toBeInTheDocument();
    expect(screen.queryByText("Primary direction")).toBeNull();
    expect(screen.getByText(/Roadmaps begin once you are past the Explore stage/)).toBeInTheDocument();
  });
  it("shows the active roadmap's progress", async () => {
    mockApi(dashRoutes({ "GET /roadmaps": [{ id: 1, title: "Roadmap to Software Engineer", career: { slug: "software_engineer", name: "Software Engineer" }, active: true, created_at: "2026-11-01T00:00:00", progress: { done: 2, total: 8, percent: 25 } }] }));
    render(<Dashboard />);
    expect(await screen.findByText("Roadmap to Software Engineer")).toBeInTheDocument();
    expect(screen.getByText("2 of 8 steps done")).toBeInTheDocument();
  });
});

describe("career directions", () => {
  const rec = (id: number, label: string) => ({ id, created_at: "2026-11-18T10:00:00", kind: "career", target: label, confidence: "moderate", why: "w", algorithm_version: "cm-1.0", model_version: "rule-based", knowledge_base_version: "kb", feedback: [] });
  const routes = (over: Record<string, unknown> = {}) => ({
    "GET /careers/portfolio": portfolio(), "GET /research/my-log": [rec(12, "Data Scientist"), rec(11, "Software Engineer")], "GET /careers/history": [],
    "GET /careers": [{ id: 1, slug: "software_engineer", name: "Software Engineer", description: "" }, { id: 2, slug: "data_scientist", name: "Data Scientist", description: "" }],
    "GET /careers/recommendations/11": { id: 11, kind: "career", label: "Software Engineer", confidence: "moderate", why: "Software Engineer is shown as moderate confidence because you rated technology highly.", what_could_change: "More projects would strengthen it.", evidence: ["self-reported interest in technology"], created_at: "2026-11-18" },
    "GET /careers/recommendations/12": { id: 12, kind: "career", label: "Data Scientist", confidence: "moderate", why: "Data reason.", what_could_change: "Data change.", evidence: ["aptitude assessment: numerical"], created_at: "2026-11-18" }, ...over,
  });
  it("explains the primary direction: why, what it's based on, what could change it", async () => {
    mockApi(routes());
    render(<CareersPage />);
    expect(await screen.findByText(/you rated technology highly/)).toBeInTheDocument();
    expect(screen.getByText("self-reported interest in technology")).toBeInTheDocument();
    expect(screen.getByText("More projects would strengthen it.")).toBeInTheDocument();
    expect(screen.getByText("What could change this")).toBeInTheDocument();
  });
  it("switches the explanation when another direction is chosen", async () => {
    mockApi(routes());
    render(<CareersPage />);
    await screen.findByText(/you rated technology highly/);
    await userEvent.click(screen.getByRole("button", { name: /Data Scientist/ }));
    expect(await screen.findByText("Data reason.")).toBeInTheDocument();
    expect(screen.getByText("aptitude assessment: numerical")).toBeInTheDocument();
  });
  it("is honest that an emerging interest has no full explanation yet", async () => {
    mockApi(routes());
    render(<CareersPage />);
    await screen.findByText(/you rated technology highly/);
    await userEvent.click(screen.getByRole("button", { name: /UI \/ UX Designer/ }));
    expect(await screen.findByText(/hasn't written a full explanation yet/)).toBeInTheDocument();
  });
  it("sends feedback on a recommendation and explains it is only gentle evidence", async () => {
    const api = mockApi(routes({ "POST /careers/recommendations/11/feedback": { id: 1 } }));
    render(<CareersPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Yes, it fits/ }));
    expect(await screen.findByText(/One answer never flips your picture/)).toBeInTheDocument();
    expect(api.called("POST /careers/recommendations/11/feedback")[0].body).toEqual({ helpful: true });
  });
  it("lets the student add real activity as evidence, and validates first", async () => {
    const api = mockApi(routes({ "POST /careers/evidence": portfolio() }));
    render(<CareersPage />);
    await screen.findByRole("heading", { name: "Add something you did" });
    await userEvent.click(screen.getByRole("button", { name: "Add to my profile" }));
    expect(await screen.findByText("Choose which career this relates to.")).toBeInTheDocument();
    expect(api.called("POST /careers/evidence")).toHaveLength(0);
    await userEvent.selectOptions(screen.getByLabelText("Related career"), "data_scientist");
    await userEvent.selectOptions(screen.getByLabelText("What was it?"), "competition");
    await userEvent.click(screen.getByRole("button", { name: "Add to my profile" }));
    expect(await screen.findByText(/nudges your picture gently/)).toBeInTheDocument();
    expect(api.called("POST /careers/evidence")[0].body).toMatchObject({ career_slug: "data_scientist", source_type: "competition", direction: 1 });
  });
  it("shows the Explore message and no primary for an Explore student", async () => {
    mockApi(routes({ "GET /careers/portfolio": explorePortfolio() }));
    render(<CareersPage />);
    expect(await screen.findByText(/not a recommendation/)).toBeInTheDocument();
    expect(screen.queryByText("Primary direction")).toBeNull();
  });
  it("asks for the assessment first when there is none", async () => {
    mockApi(routes({ "GET /careers/portfolio": fail(409, "Complete the assessment first") }));
    render(<CareersPage />);
    expect(await screen.findByRole("link", { name: /start the assessment/i })).toBeInTheDocument();
  });
  it("shows an error with retry if directions can't load", async () => {
    mockApi(routes({ "GET /careers/portfolio": fail(500, undefined) }));
    render(<CareersPage />);
    expect(await screen.findByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});

describe("compare careers", () => {
  const cmp = { careers: [
    { slug: "software_engineer", name: "Software Engineer", description: "Builds software.", fit: "moderate", pathway: "B.Tech CS.", degrees: ["B.Tech CS"], skills_missing: ["Python"], skills_met: ["Git"] },
    { slug: "data_scientist", name: "Data Scientist", description: "Finds patterns.", fit: "emerging", pathway: "B.Sc Stats.", degrees: [], skills_missing: ["Statistics"], skills_met: [] }], note: "Fit levels are not predictions." };
  const routes = { "GET /careers": [{ id: 1, slug: "software_engineer", name: "Software Engineer", description: "" }, { id: 2, slug: "data_scientist", name: "Data Scientist", description: "" }],
    "GET /careers/portfolio": portfolio(), "GET /careers/compare": cmp, "GET /careers/software_engineer/skill-gap": skillGap, "GET /careers/data_scientist/skill-gap": { career: "Data Scientist", skills: [] } };
  it("defaults to the student's own top two directions and shows them side by side", async () => {
    const api = mockApi(routes);
    render(<ComparePage />);
    expect(await screen.findByRole("heading", { name: "Software Engineer", level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Data Scientist", level: 2 })).toBeInTheDocument();
    expect(api.called("GET /careers/compare")[0].path).toBe("/careers/compare?a=software_engineer&b=data_scientist");
    expect(screen.getByText("Fit levels are not predictions.")).toBeInTheDocument();
    expect(screen.getByText("Moderate")).toBeInTheDocument();
    expect(screen.getByText("Emerging")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Talk this through with the mentor/ })).toHaveAttribute("href", expect.stringContaining("/mentor?q=Compare%20Software%20Engineer%20and%20Data%20Scientist"));
  });
  it("refuses to compare a career with itself", async () => {
    resetNav("a=software_engineer&b=software_engineer");
    mockApi(routes);
    render(<ComparePage />);
    expect(await screen.findByText("Pick two different careers to compare.")).toBeInTheDocument();
  });
  it("starts empty with an instruction when nothing is chosen", async () => {
    mockApi({ ...routes, "GET /careers/portfolio": fail(409, "x") });
    render(<ComparePage />);
    expect(await screen.findByText("Choose two careers")).toBeInTheDocument();
  });
});

describe("AI mentor", () => {
  const reply = (over = {}) => ({ conversation_id: 5, mode: "rule_based", fallback_reason: null, reply: { id: 2, role: "mentor", intent: "learn", llm_used: false, created_at: "2026-11-19T10:00:00",
    content: "For Software Engineer, start with Python. See https://cs50.harvard.edu/python/ for a course.", sources: [{ type: "career_knowledge_base", name: "ACIS curated sample", verified: false }, { type: "your_profile" }], ...over } });
  const routes = (over: Record<string, unknown> = {}) => ({ "GET /mentor/status": { mode: "rule_based", provider: null, note: "No LLM is configured." },
    "GET /mentor/conversations": { total: 1, items: [{ id: 3, title: "Earlier chat", created_at: "2026-11-01T00:00:00" }] }, ...over });

  it("says which mode is answering and offers starting points", async () => {
    mockApi(routes());
    render(<MentorPage />);
    expect(await screen.findByText(/built-in rules/)).toBeInTheDocument();
    expect(screen.getByText(/never decides for you and never guarantees outcomes/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "What should I learn next?" })).toBeInTheDocument();
  });
  it("sends a message and shows the answer with its sources and a safe link", async () => {
    const api = mockApi(routes({ "POST /mentor/chat": reply() }));
    render(<MentorPage />);
    await userEvent.type(screen.getByLabelText("Your message"), "What should I learn?");
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByText(/start with Python/)).toBeInTheDocument();
    expect(api.called("POST /mentor/chat")[0].body).toEqual({ message: "What should I learn?" });
    expect(screen.getByText("Career knowledge base: ACIS curated sample (not verified)")).toBeInTheDocument();
    expect(screen.getByText("Your profile")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "https://cs50.harvard.edu/python/" });
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.getByLabelText("Your message")).toHaveValue("");
  });
  it("continues the same conversation on the next message", async () => {
    const api = mockApi(routes({ "POST /mentor/chat": reply() }));
    render(<MentorPage />);
    await userEvent.click(screen.getByRole("button", { name: "What projects could I try?" }));
    await screen.findByText(/start with Python/);
    await userEvent.type(screen.getByLabelText("Your message"), "Tell me more");
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));
    await waitFor(() => expect(api.called("POST /mentor/chat")).toHaveLength(2));
    expect(api.called("POST /mentor/chat")[1].body).toEqual({ message: "Tell me more", conversation_id: 5 });
  });
  it("gives the text back and explains the problem if the mentor fails", async () => {
    mockApi(routes({ "POST /mentor/chat": fail(500, undefined) }));
    render(<MentorPage />);
    await userEvent.type(screen.getByLabelText("Your message"), "Help me");
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByText(/Something went wrong on our side/)).toBeInTheDocument();
    expect(screen.getByLabelText("Your message")).toHaveValue("Help me");
    expect(screen.queryByText("Help me", { selector: "p" })).toBeNull();
  });
  it("opens an earlier conversation from the history", async () => {
    mockApi(routes({ "GET /mentor/conversations/3": { id: 3, title: "Earlier chat", messages: [
      { id: 1, role: "user", content: "Hello mentor", intent: "", sources: [], llm_used: false, created_at: "2026-11-01T00:00:00" },
      { id: 2, role: "mentor", content: "Welcome back.", intent: "general", sources: [], llm_used: false, created_at: "2026-11-01T00:00:00" }] } }));
    render(<MentorPage />);
    await userEvent.click(await screen.findByRole("button", { name: /^Earlier chat/ }));
    expect(await screen.findByText("Welcome back.")).toBeInTheDocument();
    expect(screen.getByText("Hello mentor")).toBeInTheDocument();
  });
  it("deletes a conversation", async () => {
    const api = mockApi(routes({ "DELETE /mentor/conversations/3": null }));
    render(<MentorPage />);
    await userEvent.click(await screen.findByRole("button", { name: /Delete conversation Earlier chat/ }));
    await waitFor(() => expect(api.called("DELETE /mentor/conversations/3")).toHaveLength(1));
  });
  it("prefills a question from a link (for example from the comparison page)", async () => {
    resetNav("q=Compare%20A%20and%20B");
    mockApi(routes());
    render(<MentorPage />);
    expect(screen.getByLabelText("Your message")).toHaveValue("Compare A and B");
  });
  it("does not send an empty message", async () => {
    const api = mockApi(routes());
    render(<MentorPage />);
    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled();
    expect(api.called("POST /mentor/chat")).toHaveLength(0);
  });
  it("states plainly when a language model is connected", async () => {
    mockApi(routes({ "GET /mentor/status": { mode: "llm", provider: "ollama", note: "" } }));
    render(<MentorPage />);
    expect(await screen.findByText(/written by a connected language model, using only your saved data/)).toBeInTheDocument();
  });
  it("renders a safety reply distinctly and never as a career answer", async () => {
    mockApi(routes({ "POST /mentor/chat": reply({ intent: "support", content: "Please talk to someone now. Tele-MANAS: 14416.", sources: [{ type: "safety", name: "Tele-MANAS (Govt. of India)" }] }) }));
    render(<MentorPage />);
    await userEvent.type(screen.getByLabelText("Your message"), "I feel hopeless");
    await userEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByText(/Tele-MANAS: 14416/)).toBeInTheDocument();
    expect(screen.getByText("Tele-MANAS (Govt. of India)")).toBeInTheDocument();
  });
});

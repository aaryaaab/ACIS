import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi, beforeEach } from "vitest";
import LoginPage from "@/app/(auth)/login/page";
import SignupPage from "@/app/(auth)/signup/page";
import OnboardingPage from "@/app/(flow)/onboarding/page";
import AssessmentPage from "@/app/(flow)/assessment/page";
import { authState, profile, resetAuth } from "@/test/authMock";
import { portfolio } from "@/test/fixtures";
import { fail, mockApi } from "@/test/mockApi";
import { nav, resetNav } from "@/test/navMock";

vi.mock("@/lib/auth", async () => (await import("@/test/authMock")).authModule);
vi.mock("next/navigation", async () => (await import("@/test/navMock")).navModule);

beforeEach(() => { resetAuth({ status: "anon", user: null, profile: null }); resetNav(); sessionStorage.clear(); });

describe("login", () => {
  it("shows validation errors and does not call the server for an empty form", async () => {
    render(<LoginPage />);
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByText("Enter your email address.")).toBeInTheDocument();
    expect(screen.getByText("Enter your password.")).toBeInTheDocument();
    expect(authState.current.login).not.toHaveBeenCalled();
  });
  it("logs in with a trimmed email and goes to the page the student wanted", async () => {
    resetNav("next=%2Fcareers");
    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText("Email"), "  asha@example.com ");
    await userEvent.type(screen.getByLabelText("Password"), "password123");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    await waitFor(() => expect(authState.current.login).toHaveBeenCalledWith("asha@example.com", "password123"));
    expect(nav.replace).toHaveBeenCalledWith("/careers");
  });
  it("ignores an unsafe redirect target", async () => {
    resetNav("next=https%3A%2F%2Fevil.example");
    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText("Email"), "a@b.co");
    await userEvent.type(screen.getByLabelText("Password"), "password123");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/dashboard"));
  });
  it("shows the server's error message", async () => {
    const { ApiError } = await import("@/lib/api");
    authState.current.login = vi.fn(async () => { throw new ApiError(401, "Incorrect email or password"); });
    render(<LoginPage />);
    await userEvent.type(screen.getByLabelText("Email"), "a@b.co");
    await userEvent.type(screen.getByLabelText("Password"), "wrongpass1");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Incorrect email or password");
  });
  it("leaves the login page if already signed in", () => {
    resetAuth();
    render(<LoginPage />);
    expect(nav.replace).toHaveBeenCalledWith("/dashboard");
  });
});

describe("sign up", () => {
  async function fill(over: Partial<Record<"name" | "email" | "password" | "confirm", string>> = {}, consent = true) {
    const v = { name: "Asha Rao", email: "asha@example.com", password: "password123", confirm: "password123", ...over };
    await userEvent.type(screen.getByLabelText("Your name"), v.name);
    await userEvent.type(screen.getByLabelText("Email"), v.email);
    await userEvent.type(screen.getByLabelText("Password"), v.password);
    await userEvent.type(screen.getByLabelText("Confirm password"), v.confirm);
    if (consent) await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
  }
  it("validates every field", async () => {
    render(<SignupPage />);
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("Tell us what to call you.")).toBeInTheDocument();
    expect(screen.getByText("Enter your email address.")).toBeInTheDocument();
    expect(screen.getByText("Enter a password.")).toBeInTheDocument();
    expect(screen.getByText("Please confirm to continue.")).toBeInTheDocument();
    expect(authState.current.register).not.toHaveBeenCalled();
  });
  it("catches mismatched and short passwords", async () => {
    render(<SignupPage />);
    await fill({ password: "short", confirm: "different" });
    expect(await screen.findByText("Use at least 8 characters.")).toBeInTheDocument();
    expect(screen.getByText("The two passwords don't match.")).toBeInTheDocument();
    expect(authState.current.register).not.toHaveBeenCalled();
  });
  it("creates the account and continues to onboarding", async () => {
    render(<SignupPage />);
    await fill();
    await waitFor(() => expect(authState.current.register).toHaveBeenCalledWith("Asha Rao", "asha@example.com", "password123"));
    expect(nav.replace).toHaveBeenCalledWith("/onboarding");
  });
  it("carries Rapid Mode through to onboarding", async () => {
    resetNav("mode=rapid");
    render(<SignupPage />);
    await fill();
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/onboarding?mode=rapid"));
  });
  it("shows an error when the email is already registered", async () => {
    const { ApiError } = await import("@/lib/api");
    authState.current.register = vi.fn(async () => { throw new ApiError(409, "An account with this email already exists"); });
    render(<SignupPage />);
    await fill();
    expect(await screen.findByText("An account with this email already exists")).toBeInTheDocument();
  });
});

describe("onboarding", () => {
  const dob = () => fireEvent.change(screen.getByLabelText(/Date of birth/), { target: { value: "2004-05-01" } });

  beforeEach(() => resetAuth());

  it("will not move past step 1 without a date of birth and class", async () => {
    render(<OnboardingPage />);
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText("Enter your date of birth.")).toBeInTheDocument();
    expect(screen.getByText("Choose your current class or year.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "About you" })).toBeInTheDocument();
  });
  it("shows the starting stage once a class is chosen", async () => {
    render(<OnboardingPage />);
    await userEvent.selectOptions(screen.getByLabelText(/Current class/), "class_9");
    expect(screen.getByText("Explore")).toBeInTheDocument();
  });
  it("rejects out-of-range marks", async () => {
    render(<OnboardingPage />);
    dob(); await userEvent.selectOptions(screen.getByLabelText(/Current class/), "btech_2");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.click(await screen.findByRole("button", { name: "Mathematics" }));
    await userEvent.type(screen.getByLabelText("Mathematics (%)"), "140");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Mathematics: enter a percentage between 0 and 100/);
  });
  it("saves an adult's details and offers the full assessment or Rapid Mode", async () => {
    const api = mockApi({ "POST /onboarding": profile() });
    render(<OnboardingPage />);
    dob(); await userEvent.selectOptions(screen.getByLabelText(/Current class/), "btech_2");
    await userEvent.type(screen.getByLabelText("City"), "Pune");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.click(await screen.findByRole("button", { name: "Mathematics" }));
    await userEvent.type(screen.getByLabelText("Mathematics (%)"), "88");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.click(await screen.findByRole("button", { name: "Continue" }));
    expect(screen.queryByText(/under 18/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    await screen.findByRole("heading", { name: "How would you like to begin?" });
    expect(api.calls[0].body).toMatchObject({ date_of_birth: "2004-05-01", education_level: "btech_2", city: "Pune", guardian_consent: false, academics: { Mathematics: 88 } });
    expect(authState.current.refresh).toHaveBeenCalled();
    expect(screen.getByRole("link", { name: /Full assessment/ })).toHaveAttribute("href", "/assessment");
    expect(screen.getByRole("link", { name: /Rapid Decision Mode/ })).toHaveAttribute("href", "/assessment?mode=rapid");
  });
  it("requires a parent or guardian for a student under 18", async () => {
    const api = mockApi({ "POST /onboarding": profile({ is_minor: true, stage: "explore" }) });
    render(<OnboardingPage />);
    fireEvent.change(screen.getByLabelText(/Date of birth/), { target: { value: "2012-01-01" } });
    await userEvent.selectOptions(screen.getByLabelText(/Current class/), "class_9");
    for (let i = 0; i < 3; i++) await userEvent.click(await screen.findByRole("button", { name: "Continue" }));
    expect(await screen.findByText(/must agree/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    expect(await screen.findByText(/needs to agree before a student under 18/)).toBeInTheDocument();
    expect(api.calls).toHaveLength(0);
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    await screen.findByRole("heading", { name: "How would you like to begin?" });
    expect(api.calls[0].body.guardian_consent).toBe(true);
  });
  it("shows the server's error if saving fails", async () => {
    mockApi({ "POST /onboarding": fail(403, "A parent or guardian must consent before a student under 18 can continue.") });
    render(<OnboardingPage />);
    dob(); await userEvent.selectOptions(screen.getByLabelText(/Current class/), "btech_2");
    for (let i = 0; i < 3; i++) await userEvent.click(await screen.findByRole("button", { name: "Continue" }));
    await userEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("must consent");
  });
  it("pre-fills everything when editing, including marks, so nothing is lost", async () => {
    resetNav("edit=1");
    resetAuth({ profile: profile({ academics: [{ subject: "Physics", score_percent: 75 }], city: "Pune" }) });
    const api = mockApi({ "POST /onboarding": profile() });
    render(<OnboardingPage />);
    await waitFor(() => expect(screen.getByLabelText("City")).toHaveValue("Pune"));
    expect(screen.getByLabelText(/Current class/)).toHaveValue("btech_2");
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByLabelText("Physics (%)")).toHaveValue(75);
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.click(await screen.findByRole("button", { name: "Continue" }));
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/profile"));
    expect(api.calls[0].body.academics).toEqual({ Physics: 75 });
  });
});

const QUESTIONS = {
  interests: [{ domain: "technology", text: "Building apps" }, { domain: "science", text: "Understanding nature" }, { domain: "law_governance", text: "Law and policy" }],
  aptitude: [1, 2, 3, 4].map((n) => ({ id: `q${n}`, aptitude: "logical", text: `Question ${n}?`, options: ["A1", "B1", "C1", "D1"] })),
  creative: [{ id: "c1", text: "I invent new ideas" }],
  personality: [{ id: "p1", trait: "openness", text: "I like new things" }, { id: "p2", trait: "openness", text: "I like routine" }],
  scales: {},
};
const RESULT = { aptitude: { logical: 0.75, numerical: 0.5, verbal: 0.5, spatial: 0.5, creative: 0.5 }, personality: {}, portfolio: portfolio(), recommendation_ids: { software_engineer: 1 } };

async function throughAssessment(rateAll = true) {
  await userEvent.click(await screen.findByRole("button", { name: "Begin" }));
  if (rateAll) for (const q of ["Building apps", "Understanding nature", "Law and policy"]) await userEvent.click(within(screen.getByRole("group", { name: q })).getByRole("radio", { name: "4 of 5" }));
}

describe("assessment", () => {
  beforeEach(() => resetAuth());

  it("shows a friendly error with a retry if the questions can't load", async () => {
    mockApi({ "GET /assessment/questions": fail(500, "boom") });
    render(<AssessmentPage />);
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
  it("requires every interest to be rated before moving on", async () => {
    mockApi({ "GET /assessment/questions": QUESTIONS });
    render(<AssessmentPage />);
    await throughAssessment(false);
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText(/Please rate all 3 areas/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "What interests you" })).toBeInTheDocument();
  });
  it("splits the reasoning questions across two steps and warns about unanswered ones", async () => {
    mockApi({ "GET /assessment/questions": QUESTIONS });
    render(<AssessmentPage />);
    await throughAssessment();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText(/1\. Question 1\?/)).toBeInTheDocument();
    expect(screen.queryByText(/3\. Question 3\?/)).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(await screen.findByText(/3\. Question 3\?/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.click(await screen.findByRole("button", { name: "Continue" }));
    expect(await screen.findByText(/4 reasoning questions unanswered/)).toBeInTheDocument();
  });
  it("submits the answers in the shape the API expects and shows honest, capped confidence", async () => {
    const api = mockApi({ "GET /assessment/questions": QUESTIONS, "POST /assessment": RESULT });
    render(<AssessmentPage />);
    await throughAssessment();
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText(/1\. Question 1\?/);
    await userEvent.click(screen.getAllByRole("radio")[1]);                 // answers question 1 with option B
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.click(await screen.findByRole("button", { name: "Continue" }));
    await userEvent.click(await screen.findByRole("button", { name: "See my results" }));
    await screen.findByRole("heading", { name: "Here is where you stand today" });
    const body = api.called("POST /assessment")[0].body;
    expect(body.interests).toEqual({ technology: 4, science: 4, law_governance: 4 });
    expect(body.aptitude_answers).toEqual({ q1: 1 });
    expect(screen.getByText(/at most Moderate/)).toBeInTheDocument();
    expect(screen.getByText("Software Engineer")).toBeInTheDocument();
    expect(screen.getByText(/not a validated test/)).toBeInTheDocument();
    expect(authState.current.refresh).toHaveBeenCalled();
  });
  it("Rapid Mode uses the rapid endpoint and shows pathways, entrance exams and next steps", async () => {
    resetNav("mode=rapid");
    const rapid = { ...RESULT, rapid: { primary: { career: "Software Engineer", confidence: "moderate", pathway: "B.Tech in CS (JEE Main).", degrees: [{ name: "B.Tech Computer Science", entrance_exams: "JEE Main, state CETs" }], first_skills: ["Python"] },
      secondary: [], next_steps: ["Read the pathway.", "Start one small project."], note: "This is a starting direction based on your assessment, not a prediction." } };
    const api = mockApi({ "GET /assessment/questions": QUESTIONS, "POST /assessment/rapid": rapid });
    render(<AssessmentPage />);
    await throughAssessment();
    for (let i = 0; i < 3; i++) await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.click(await screen.findByRole("button", { name: "Continue" }));
    await userEvent.click(await screen.findByRole("button", { name: "Get my directions" }));
    expect(await screen.findByRole("heading", { name: "Your immediate plan" })).toBeInTheDocument();
    expect(api.called("POST /assessment/rapid")).toHaveLength(1);
    expect(screen.getByText(/JEE Main, state CETs/)).toBeInTheDocument();
    expect(screen.getByText("Start one small project.")).toBeInTheDocument();
    expect(screen.getByText(/not a prediction/)).toBeInTheDocument();
    expect(screen.getByText(/check entrance exam dates on the official websites/i)).toBeInTheDocument();
  });
  it("tells Explore-stage students these are directions to try, not a verdict", async () => {
    const { explorePortfolio } = await import("@/test/fixtures");
    mockApi({ "GET /assessment/questions": QUESTIONS, "POST /assessment": { ...RESULT, portfolio: explorePortfolio() } });
    render(<AssessmentPage />);
    await throughAssessment();
    for (let i = 0; i < 3; i++) await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.click(await screen.findByRole("button", { name: "Continue" }));
    await userEvent.click(await screen.findByRole("button", { name: "See my results" }));
    expect(await screen.findByRole("heading", { name: "Directions worth exploring" })).toBeInTheDocument();
    expect(screen.getByText(/isn't picking a career for you/)).toBeInTheDocument();
    expect(screen.queryByText("Primary direction")).toBeNull();
  });
  it("keeps the student's answers if submitting fails", async () => {
    mockApi({ "GET /assessment/questions": QUESTIONS, "POST /assessment": fail(500, undefined) });
    render(<AssessmentPage />);
    await throughAssessment();
    for (let i = 0; i < 3; i++) await userEvent.click(screen.getByRole("button", { name: "Continue" }));
    await userEvent.click(await screen.findByRole("button", { name: "Continue" }));
    await userEvent.click(await screen.findByRole("button", { name: "See my results" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/Something went wrong/);
    expect(screen.getByRole("button", { name: "See my results" })).toBeEnabled();
    expect(JSON.parse(sessionStorage.getItem("acis_assessment_draft")!).interests).toEqual({ technology: 4, science: 4, law_governance: 4 });
  });
});

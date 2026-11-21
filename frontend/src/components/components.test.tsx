import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ConfidencePips, MODELS, NeedsAssessment, StageTracker } from "./domain";
import { PortfolioCards } from "./PortfolioCards";
import { RequireAuth } from "./RequireAuth";
import { LearningStyleBars, SkillBar } from "./panels";
import { Button, EmptyState, ErrorState, Modal, Notice, ProgressBar, Scale, Tabs, TextField } from "./ui";
import { authState, profile, resetAuth } from "@/test/authMock";
import { explorePortfolio, portfolio, prefs } from "@/test/fixtures";
import { nav, resetNav } from "@/test/navMock";

vi.mock("@/lib/auth", async () => (await import("@/test/authMock")).authModule);
vi.mock("next/navigation", async () => (await import("@/test/navMock")).navModule);

describe("Button and forms", () => {
  it("is disabled and announces busy while loading", () => {
    render(<Button loading>Save</Button>);
    const b = screen.getByRole("button", { name: /save/i });
    expect(b).toBeDisabled();
    expect(b).toHaveAttribute("aria-busy", "true");
  });
  it("links a field's error and hint to the input for screen readers", () => {
    render(<TextField label="Email" error="Enter your email address." hint="ignored while there is an error" />);
    const input = screen.getByLabelText("Email");
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input.getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByRole("alert")).toHaveTextContent("Enter your email address.");
    expect(screen.queryByText(/ignored while/)).not.toBeInTheDocument();
  });
  it("marks required fields", () => {
    render(<TextField label="Name" required />);
    expect(screen.getByLabelText(/Name/)).toBeRequired();
  });
});

describe("Scale", () => {
  it("is a radio group that reports the chosen value", async () => {
    const onChange = vi.fn();
    render(<Scale name="s" legend="How much do you like maths?" labels={["Not at all", "A lot"]} value={2} onChange={onChange} />);
    const group = screen.getByRole("group", { name: /like maths/i });
    expect(within(group).getAllByRole("radio")).toHaveLength(5);
    expect(screen.getByRole("radio", { name: "2 of 5" })).toBeChecked();
    await userEvent.click(screen.getByRole("radio", { name: "5 of 5" }));
    expect(onChange).toHaveBeenCalledWith(5);
  });
});

describe("Tabs and Modal", () => {
  it("marks the selected tab and switches on click", async () => {
    const onChange = vi.fn();
    render(<Tabs label="Sections" value="a" onChange={onChange} tabs={[{ id: "a", label: "First", count: 3 }, { id: "b", label: "Second" }]} />);
    expect(screen.getByRole("tab", { name: /First/ })).toHaveAttribute("aria-selected", "true");
    await userEvent.click(screen.getByRole("tab", { name: "Second" }));
    expect(onChange).toHaveBeenCalledWith("b");
  });
  it("is a labelled dialog that closes on Escape and the close button", async () => {
    const onClose = vi.fn();
    render(<Modal open onClose={onClose} title="Rate it"><p>body</p></Modal>);
    expect(screen.getByRole("dialog", { name: "Rate it" })).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
  it("renders nothing when closed", () => { render(<Modal open={false} onClose={() => {}} title="x">y</Modal>); expect(screen.queryByRole("dialog")).toBeNull(); });
});

describe("states", () => {
  it("ErrorState shows the message and offers a retry", async () => {
    const retry = vi.fn();
    render(<ErrorState error="Can't reach the ACIS server." onRetry={retry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Can't reach the ACIS server.");
    await userEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(retry).toHaveBeenCalled();
  });
  it("EmptyState and Notice render their content", () => {
    render(<><EmptyState title="Nothing yet" description="Start here" /><Notice tone="error">Bad</Notice></>);
    expect(screen.getByRole("heading", { name: "Nothing yet" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Bad");
  });
  it("ProgressBar exposes its value and clamps out-of-range input", () => {
    render(<><ProgressBar value={30} max={60} label="half" /><ProgressBar value={999} max={10} label="over" /></>);
    expect(screen.getByRole("progressbar", { name: "half" })).toHaveAttribute("aria-valuenow", "30");
    expect(screen.getByRole("progressbar", { name: "over" }).firstElementChild).toHaveStyle({ width: "100%" });
  });
});

describe("domain components", () => {
  it("shows confidence as words, never numbers", () => {
    const { container, rerender } = render(<ConfidencePips level="high" />);
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\d/);
    rerender(<ConfidencePips level="moderate" />);
    expect(screen.getByText("Moderate")).toBeInTheDocument();
    rerender(<ConfidencePips level="emerging" />);
    expect(screen.getByText("Emerging")).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/%|\d/);
  });
  it("StageTracker marks the current stage", () => {
    render(<StageTracker stage="build" />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(6);
    expect(items.find((i) => i.getAttribute("aria-current") === "step")).toHaveTextContent("Build");
  });
  it("names the three models and gives each its own colour", () => {
    expect(Object.keys(MODELS)).toEqual(["career", "learning", "growth"]);
    expect(new Set(Object.values(MODELS).map((m) => m.dot)).size).toBe(3);
  });
  it("NeedsAssessment links to the assessment", () => {
    render(<NeedsAssessment />);
    expect(screen.getByRole("link", { name: /start the assessment/i })).toHaveAttribute("href", "/assessment");
  });
  it("shows learning style in words and gives each bar an accessible label", () => {
    const { container } = render(<LearningStyleBars style={{ ...prefs, project: 0.9, theory: 0.1 }} only={["project", "theory", "video"]} />);
    expect(screen.getByRole("img", { name: /Hands-on projects: Learn best by building/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Theory-heavy material: Prefer practical/ })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /Video lessons: No clear preference yet/ })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\d/);
  });
  it("SkillBar says Met, Not started or the level", () => {
    render(<ul><SkillBar skill={{ skill: "Python", required_level: 3, current_level: 0, status: "missing" }} /><SkillBar skill={{ skill: "Git", required_level: 3, current_level: 3, status: "met" }} /><SkillBar skill={{ skill: "SQL", required_level: 3, current_level: 1, status: "in_progress" }} /></ul>);
    expect(screen.getByText("Not started")).toBeInTheDocument();
    expect(screen.getByText("Met")).toBeInTheDocument();
    expect(screen.getByText("Level 1 of 3")).toBeInTheDocument();
  });
});

describe("PortfolioCards", () => {
  it("shows primary, secondary and emerging with confidence words", () => {
    render(<PortfolioCards portfolio={portfolio()} />);
    expect(screen.getByText("Primary direction")).toBeInTheDocument();
    expect(screen.getByText("Software Engineer")).toBeInTheDocument();
    expect(screen.getByText("Secondary direction")).toBeInTheDocument();
    expect(screen.getByText("Emerging interests")).toBeInTheDocument();
    expect(screen.getAllByText("Moderate").length).toBe(2);
    expect(screen.getAllByText("Based on your assessment")).toHaveLength(2);   // primary and emerging have no evidence yet
    expect(screen.getByText("2 pieces of evidence over time")).toBeInTheDocument();
  });
  it("never presents a verdict to an Explore-stage student", () => {
    render(<PortfolioCards portfolio={explorePortfolio()} />);
    expect(screen.getByText("Worth exploring")).toBeInTheDocument();
    expect(screen.queryByText("Primary direction")).toBeNull();
    expect(screen.queryByText("Secondary direction")).toBeNull();
  });
  it("is honest when nothing stands out", () => {
    render(<PortfolioCards portfolio={portfolio({ primary: null, secondary: [], emerging: [] })} />);
    expect(screen.getByText(/No single direction stands out yet/)).toBeInTheDocument();
  });
  it("calls onSelect when a direction is chosen", async () => {
    const onSelect = vi.fn();
    render(<PortfolioCards portfolio={portfolio()} onSelect={onSelect} />);
    await userEvent.click(screen.getByRole("button", { name: /Data Scientist/ }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ slug: "data_scientist" }));
  });
});

describe("RequireAuth", () => {
  it("sends signed-out visitors to the login page and remembers where they were going", async () => {
    resetAuth({ status: "anon", user: null, profile: null });
    resetNav("", "/careers");
    render(<RequireAuth><p>secret</p></RequireAuth>);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/login?next=%2Fcareers"));
    expect(screen.queryByText("secret")).toBeNull();
  });
  it("sends students who have not onboarded to onboarding", async () => {
    resetAuth({ profile: profile({ onboarding_done: false }) });
    render(<RequireAuth><p>secret</p></RequireAuth>);
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith("/onboarding"));
    expect(screen.queryByText("secret")).toBeNull();
  });
  it("does not require onboarding on the onboarding pages themselves", () => {
    resetAuth({ profile: null });
    render(<RequireAuth needsOnboarding={false}><p>form</p></RequireAuth>);
    expect(screen.getByText("form")).toBeInTheDocument();
  });
  it("shows a loading state while the session is checked, and never flashes content", () => {
    resetAuth({ status: "loading", user: null, profile: null });
    render(<RequireAuth><p>secret</p></RequireAuth>);
    expect(screen.getByRole("status")).toHaveTextContent(/Loading your workspace/);
    expect(screen.queryByText("secret")).toBeNull();
  });
  it("renders the page for a signed-in, onboarded student", () => {
    resetAuth();
    render(<RequireAuth><p>secret</p></RequireAuth>);
    expect(screen.getByText("secret")).toBeInTheDocument();
    expect(authState.current.status).toBe("authed");
  });
});

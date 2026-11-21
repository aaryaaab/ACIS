import { describe, expect, it, vi } from "vitest";
import { ApiError, http, qs, readableDetail, readCookie } from "./api";
import { acis } from "./endpoints";
import { ageFromDob, educationLabel, EDUCATION_LEVELS, formatDate, humanize, linkify, monthLabel, timeAgo } from "./format";
import { describeSource, SUGGESTED_PROMPTS } from "./mentor";
import { certaintyWord, fadesIn, memorySource } from "./memory";
import { isActive, safeNext } from "./nav";
import { emptyForm, stageFor, toPayload, validateStep } from "./onboarding";
import { emailError, passwordError } from "./validate";
import { fail, json, mockApi } from "@/test/mockApi";

const setCookie = (v: string) => { document.cookie = v; };
const clearCookie = (name: string) => { document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`; };

describe("api client", () => {
  it("sends the session cookie with every request and never an Authorization header", async () => {
    const api = mockApi({ "GET /auth/me": { id: 1, email: "a@b.co", full_name: "A" } });
    await acis.auth.me();
    expect(api.calls[0].credentials).toBe("include");
    expect(api.calls[0].headers.Authorization).toBeUndefined();
  });
  it("talks to /api on its own website, so the cookie is first-party", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(json({ id: 1, email: "a@b.co", full_name: "A" }));
    await acis.auth.me();
    expect(String(spy.mock.calls[0][0])).toBe("/api/auth/me");
  });
  it("copies the readable CSRF cookie into a header on requests that change data, and only then", async () => {
    setCookie("acis_csrf=csrf-abc123; path=/");
    const api = mockApi({ "GET /profile": {}, "POST /memory": {}, "PUT /research/consent": {}, "PATCH /memory/1": {}, "DELETE /memory/1": null });
    await http.get("/profile");
    await http.post("/memory", { a: 1 }); await http.put("/research/consent", { consent: true });
    await http.patch("/memory/1", { content: "x" }); await http.del("/memory/1");
    expect(api.calls.map((c) => [c.method, c.headers["X-CSRF-Token"]])).toEqual([
      ["GET", undefined], ["POST", "csrf-abc123"], ["PUT", "csrf-abc123"], ["PATCH", "csrf-abc123"], ["DELETE", "csrf-abc123"]]);
    clearCookie("acis_csrf");
  });
  it("sends no CSRF header when there is no CSRF cookie (the server will then refuse, which is correct)", async () => {
    clearCookie("acis_csrf");
    const api = mockApi({ "POST /memory": {} });
    await http.post("/memory", {});
    expect(api.calls[0].headers["X-CSRF-Token"]).toBeUndefined();
  });
  it("reads cookies safely, including values that need decoding", () => {
    setCookie("acis_csrf=a%2Bb%3Dc; path=/");
    expect(readCookie("acis_csrf")).toBe("a+b=c");
    expect(readCookie("does_not_exist")).toBeNull();
    clearCookie("acis_csrf");
  });
  it("never stores anything in localStorage or sessionStorage", async () => {
    const api = mockApi({ "POST /auth/login": { access_token: "should-be-ignored-by-the-website" }, "GET /auth/me": {} });
    await acis.auth.login({ email: "a@b.co", password: "pw" });
    await acis.auth.me();
    expect(api.calls).toHaveLength(2);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
  it("sends the login form body as JSON", async () => {
    const api = mockApi({ "POST /auth/login": { access_token: "x" } });
    await acis.auth.login({ email: "a@b.co", password: "pw" });
    expect(api.calls[0].body).toEqual({ email: "a@b.co", password: "pw" });
    expect(api.calls[0].headers["Content-Type"]).toBe("application/json");
  });
  it("turns a network failure into a friendly message with status 0", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(http.get("/x")).rejects.toMatchObject({ name: "ApiError", status: 0, message: expect.stringContaining("Can't reach the ACIS server") });
  });
  it("reads FastAPI string and list errors into one sentence", () => {
    expect(readableDetail("Incorrect email or password", "x")).toBe("Incorrect email or password");
    expect(readableDetail([{ loc: ["body", "academics"], msg: "Value error, Maths: score must be between 0 and 100" }], "x")).toBe("academics: Maths: score must be between 0 and 100");
    expect(readableDetail([{ loc: ["body", "password"], msg: "String should have at least 8 characters" }, { loc: ["body", "email"], msg: "bad" }], "x")).toBe("password: String should have at least 8 characters. email: bad");
    expect(readableDetail(undefined, "fallback")).toBe("fallback");
  });
  it("uses a gentle message for server errors", async () => {
    mockApi({ "GET /boom": fail(500, undefined) });
    await expect(http.get("/boom")).rejects.toMatchObject({ status: 500, message: "Something went wrong on our side. Please try again." });
  });
  it("shows the server's wording when too many wrong passwords were tried", async () => {
    mockApi({ "POST /auth/login": fail(429, "Too many failed attempts. Please try again in 15 minute(s).") });
    await expect(acis.auth.login({ email: "a@b.co", password: "x" })).rejects.toMatchObject({ status: 429, message: expect.stringContaining("Too many failed attempts") });
  });
  it("shows the server's wording when the security check fails", async () => {
    mockApi({ "POST /memory": fail(403, "Security check failed. Please reload the page and try again.") });
    await expect(http.post("/memory", {})).rejects.toMatchObject({ status: 403, message: expect.stringContaining("Security check failed") });
  });
  it("on 401 from a normal endpoint, tells the app the session has ended", async () => {
    const heard = vi.fn();
    window.addEventListener("acis:unauthorized", heard);
    mockApi({ "GET /profile": fail(401, "Not logged in") });
    await expect(acis.profile.get()).rejects.toBeInstanceOf(ApiError);
    expect(heard).toHaveBeenCalledTimes(1);
    window.removeEventListener("acis:unauthorized", heard);
  });
  it("a 401 from sign-in, /auth/me or logout is not a 'session ended' signal", async () => {
    const heard = vi.fn();
    window.addEventListener("acis:unauthorized", heard);
    mockApi({ "POST /auth/login": fail(401, "Incorrect email or password"), "GET /auth/me": fail(401, "Not logged in"), "POST /auth/register": fail(409, "exists") });
    await expect(acis.auth.login({ email: "a@b.co", password: "x" })).rejects.toMatchObject({ message: "Incorrect email or password" });
    await expect(acis.auth.me()).rejects.toBeInstanceOf(ApiError);
    await expect(acis.auth.register({ email: "a@b.co", password: "password123", full_name: "A" })).rejects.toBeInstanceOf(ApiError);
    expect(heard).not.toHaveBeenCalled();
    window.removeEventListener("acis:unauthorized", heard);
  });
  it("handles 204 No Content", async () => {
    mockApi({ "DELETE /memory/5": json(null, 204) });
    await expect(acis.memory.remove(5)).resolves.toBeUndefined();
  });
  it("builds query strings and skips empty values", () => {
    expect(qs({ a: "x", b: "", c: undefined, d: 0, e: false, f: true })).toBe("?a=x&d=0&f=true");
    expect(qs({})).toBe("");
  });
  it("uploads a transcript as multipart form data (not JSON)", async () => {
    setCookie("acis_csrf=tok; path=/");
    const api = mockApi({ "POST /voice": { voice_id: 1, transcript: "hi", audio_stored: false } });
    await acis.voice.sendTranscript("hi");
    expect(api.calls[0].body).toEqual({ transcript: "hi" });
    expect(api.calls[0].headers["Content-Type"]).toBeUndefined();          // the browser adds the multipart boundary
    expect(api.calls[0].headers["X-CSRF-Token"]).toBe("tok");              // but uploads are still CSRF-protected
    clearCookie("acis_csrf");
  });
  it("calls the documented paths for key endpoints", async () => {
    const api = mockApi({ "GET /careers/compare": { careers: [], note: "" }, "GET /careers/x/skill-gap": {}, "PATCH /roadmaps/3/items/9": {}, "PUT /research/consent": {}, "POST /auth/logout": json(null, 204) });
    await acis.careers.compare("a", "b"); await acis.careers.skillGap("x"); await acis.roadmaps.tick(3, 9, true); await acis.research.setConsent(true); await acis.auth.logout();
    expect(api.calls.map((c) => `${c.method} ${c.path}`)).toEqual(["GET /careers/compare?a=a&b=b", "GET /careers/x/skill-gap", "PATCH /roadmaps/3/items/9", "PUT /research/consent", "POST /auth/logout"]);
    expect(api.calls[2].body).toEqual({ done: true });
  });
});

describe("formatting", () => {
  it("humanizes slugs", () => { expect(humanize("arts_design")).toBe("Arts design"); expect(humanize("python")).toBe("Python"); });
  it("computes age correctly around birthdays", () => {
    const today = new Date("2026-06-15T10:00:00");
    expect(ageFromDob("2008-06-15", today)).toBe(18);
    expect(ageFromDob("2008-06-16", today)).toBe(17);
    expect(ageFromDob("2012-01-01", today)).toBe(14);
  });
  it("only links http(s) URLs and leaves trailing punctuation out", () => {
    const parts = linkify("See https://cs50.harvard.edu/python/. Also javascript:alert(1) and http://x.org/a, ok");
    const links = parts.filter((p) => p.href).map((p) => p.href);
    expect(links).toEqual(["https://cs50.harvard.edu/python/", "http://x.org/a"]);
    expect(parts.map((p) => p.text).join("")).toBe("See https://cs50.harvard.edu/python/. Also javascript:alert(1) and http://x.org/a, ok");
  });
  it("formats naive server timestamps as UTC and plain dates without shifting the day", () => {
    expect(formatDate("2026-11-01", { day: "numeric", month: "short" })).toBe("1 Nov");
    expect(formatDate("")).toBe("");
    expect(formatDate("garbage")).toBe("");
    expect(monthLabel("2026-03")).toBe("March 2026");
  });
  it("describes time ago", () => {
    const now = new Date("2026-11-19T12:00:00Z").getTime();
    expect(timeAgo("2026-11-19T01:00:00", now)).toBe("today");
    expect(timeAgo("2026-11-18T01:00:00", now)).toBe("yesterday");
    expect(timeAgo("2026-11-10T01:00:00", now)).toBe("9 days ago");
    expect(timeAgo("2026-08-01T01:00:00", now)).toBe("3 months ago");
  });
  it("maps education levels to the same stages the backend uses", () => {
    const stage = (v: string) => EDUCATION_LEVELS.find((e) => e.value === v)?.stage;
    expect([stage("class_9"), stage("class_12"), stage("btech_2"), stage("btech_3"), stage("btech_4"), stage("working")]).toEqual(["explore", "decide", "learn", "build", "launch", "grow"]);
    expect(educationLabel("class_9")).toBe("Class 9");
  });
});

describe("validation", () => {
  it("validates email and password", () => {
    expect(emailError("")).toBe("Enter your email address.");
    expect(emailError("not-an-email")).toMatch(/doesn't look like/);
    expect(emailError("a@b.co")).toBeNull();
    expect(passwordError("")).toBe("Enter a password.");
    expect(passwordError("short")).toBe("Use at least 8 characters.");
    expect(passwordError("long-enough")).toBeNull();
  });
});

describe("onboarding rules", () => {
  const today = new Date("2026-11-19T12:00:00");
  it("requires date of birth and class, and rejects impossible dates", () => {
    expect(validateStep(0, emptyForm(), today)).toEqual({ dob: "Enter your date of birth.", education: "Choose your current class or year." });
    expect(validateStep(0, { ...emptyForm(), dob: "2030-01-01", education: "class_9" }, today).dob).toMatch(/future/);
    expect(validateStep(0, { ...emptyForm(), dob: "2020-01-01", education: "class_9" }, today).dob).toMatch(/aged 10/);
    expect(validateStep(0, { ...emptyForm(), dob: "2004-05-01", education: "btech_2" }, today)).toEqual({});
  });
  it("rejects marks that are blank or out of range", () => {
    expect(validateStep(1, { ...emptyForm(), marks: { Mathematics: "140" } }).marks).toMatch(/Mathematics/);
    expect(validateStep(1, { ...emptyForm(), marks: { Physics: "" } }).marks).toMatch(/Physics/);
    expect(validateStep(1, { ...emptyForm(), marks: { Physics: "75.5" } })).toEqual({});
    expect(validateStep(1, emptyForm())).toEqual({});
  });
  it("requires guardian consent only for students under 18", () => {
    expect(validateStep(3, { ...emptyForm(), dob: "2012-01-01" }, today).guardian).toMatch(/parent or guardian/);
    expect(validateStep(3, { ...emptyForm(), dob: "2012-01-01", guardian: true }, today)).toEqual({});
    expect(validateStep(3, { ...emptyForm(), dob: "2004-05-01" }, today)).toEqual({});
  });
  it("builds the exact payload the API expects", () => {
    const body = toPayload({ ...emptyForm(), dob: "2004-05-01", education: "btech_2", institution: " Test College ", city: "Pune", marks: { Mathematics: "88" },
      goal: " Build things ", workStyle: "team", environment: "", priority: "impact", money: "moderate", guardian: false });
    expect(body).toEqual({ date_of_birth: "2004-05-01", guardian_consent: false, education_level: "btech_2", institution: "Test College", city: "Pune",
      long_term_goal: "Build things", lifestyle: { work_style: "team", priority: "impact" }, financial_context: "moderate", academics: { Mathematics: 88 } });
    expect(stageFor("class_9")).toBe("explore");
    expect(stageFor("nonsense")).toBeNull();
  });
});

describe("navigation safety", () => {
  it("only follows redirects inside the app", () => {
    expect(safeNext("/careers")).toBe("/careers");
    expect(safeNext("https://evil.example")).toBe("/dashboard");
    expect(safeNext("//evil.example")).toBe("/dashboard");
    expect(safeNext("/\\evil.example")).toBe("/dashboard");
    expect(safeNext(null)).toBe("/dashboard");
    expect(safeNext("javascript:alert(1)")).toBe("/dashboard");
  });
  it("marks nested routes active", () => { expect(isActive("/careers/x", "/careers")).toBe(true); expect(isActive("/careersX", "/careers")).toBe(false); });
});

describe("mentor and memory helpers", () => {
  it("labels sources honestly", () => {
    expect(describeSource({ type: "career_knowledge_base", name: "ACIS curated sample", verified: false }).label).toBe("Career knowledge base: ACIS curated sample (not verified)");
    expect(describeSource({ type: "market_update", name: "Feed", url: "https://x.org", retrieved_on: "2026-11-01" })).toEqual({ label: "Feed, retrieved 2026-11-01", href: "https://x.org" });
    expect(describeSource({ type: "safety", name: "Tele-MANAS (Govt. of India)" }).label).toBe("Tele-MANAS (Govt. of India)");
    expect(SUGGESTED_PROMPTS.length).toBeGreaterThan(3);
  });
  it("describes memories in words, not numbers", () => {
    expect([certaintyWord(0.9), certaintyWord(0.6), certaintyWord(0.2)]).toEqual(["Confident", "Fairly sure", "Tentative"]);
    expect(memorySource("journal:12")).toBe("From a journal entry");
    expect(memorySource("student")).toBe("Added by you");
    const now = new Date("2026-11-19T00:00:00Z").getTime();
    expect(fadesIn({ expires_at: "2026-11-26T00:00:00" } as never, now)).toBe("fades in 7 days");
    expect(fadesIn({ expires_at: null } as never, now)).toBeNull();
  });
});

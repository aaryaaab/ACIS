import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AuthProvider, useAuth } from "./auth";
import { profile } from "@/test/authMock";
import { fail, json, mockApi } from "@/test/mockApi";

/** These tests use the REAL AuthProvider (the page tests replace it). */
function Probe() {
  const a = useAuth();
  return (
    <div>
      <p data-testid="status">{a.status}</p>
      <p data-testid="who">{a.user?.email ?? "nobody"}</p>
      <button onClick={() => a.login("asha@example.com", "password123").catch(() => {})}>login</button>
      <button onClick={() => a.register("Asha", "asha@example.com", "password123").catch(() => {})}>register</button>
      <button onClick={a.logout}>logout</button>
    </div>
  );
}
const me = { id: 1, email: "asha@example.com", full_name: "Asha" };
const prof = { user: { email: "asha@example.com", full_name: "Asha" }, profile: profile() };

describe("AuthProvider (cookie sessions)", () => {
  it("asks the server who we are and becomes signed-out on 401, with no token involved", async () => {
    const api = mockApi({ "GET /auth/me": fail(401, "Not logged in"), "GET /profile": fail(401, "Not logged in") });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anon"));
    expect(api.called("GET /auth/me")).toHaveLength(1);
  });
  it("is signed in when the cookie is valid, and shows who the server says we are", async () => {
    mockApi({ "GET /auth/me": me, "GET /profile": prof });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authed"));
    expect(screen.getByTestId("who")).toHaveTextContent("asha@example.com");
  });
  it("login posts the credentials, ignores any token in the reply, stores nothing, then asks who we are", async () => {
    let signedIn = false;
    const api = mockApi({ "GET /auth/me": () => (signedIn ? me : fail(401, "Not logged in")), "GET /profile": () => (signedIn ? prof : fail(401, "Not logged in")),
      "POST /auth/login": () => { signedIn = true; return { access_token: "secret-token-the-site-must-not-keep" }; } });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anon"));
    await userEvent.click(screen.getByText("login"));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authed"));
    expect(api.called("POST /auth/login")[0].body).toEqual({ email: "asha@example.com", password: "password123" });
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
    expect(document.body.innerHTML).not.toContain("secret-token-the-site-must-not-keep");
  });
  it("a failed login leaves the visitor signed out", async () => {
    mockApi({ "GET /auth/me": fail(401, "x"), "GET /profile": fail(401, "x"), "POST /auth/login": fail(401, "Incorrect email or password") });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anon"));
    await userEvent.click(screen.getByText("login"));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anon"));
  });
  it("register signs the new student in", async () => {
    let signedIn = false;
    mockApi({ "GET /auth/me": () => (signedIn ? me : fail(401, "x")), "GET /profile": () => (signedIn ? { ...prof, profile: null } : fail(401, "x")),
      "POST /auth/register": () => { signedIn = true; return { access_token: "t" }; } });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anon"));
    await userEvent.click(screen.getByText("register"));
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authed"));
  });
  it("logout signs out at once and tells the server to clear the cookie", async () => {
    const api = mockApi({ "GET /auth/me": me, "GET /profile": prof, "POST /auth/logout": json(null, 204) });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authed"));
    await userEvent.click(screen.getByText("logout"));
    expect(screen.getByTestId("status")).toHaveTextContent("anon");
    await waitFor(() => expect(api.called("POST /auth/logout")).toHaveLength(1));
  });
  it("logout wipes the half-finished assessment saved in this browser tab", async () => {
    sessionStorage.setItem("acis_assessment_draft", JSON.stringify({ interests: { technology: 5 } }));
    mockApi({ "GET /auth/me": me, "GET /profile": prof, "POST /auth/logout": json(null, 204) });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authed"));
    await userEvent.click(screen.getByText("logout"));
    expect(sessionStorage.getItem("acis_assessment_draft")).toBeNull();
  });
  it("logout still signs out locally if the server can't be reached", async () => {
    mockApi({ "GET /auth/me": me, "GET /profile": prof, "POST /auth/logout": fail(500, "down") });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authed"));
    await userEvent.click(screen.getByText("logout"));
    expect(screen.getByTestId("status")).toHaveTextContent("anon");
  });
  it("signs out when the session ends while using the app", async () => {
    mockApi({ "GET /auth/me": me, "GET /profile": prof });
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("authed"));
    act(() => { window.dispatchEvent(new Event("acis:unauthorized")); });
    expect(screen.getByTestId("status")).toHaveTextContent("anon");
  });
  it("treats an unreachable server as signed-out instead of crashing", async () => {
    mockApi({});                                   // every call returns an error
    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId("status")).toHaveTextContent("anon"));
  });
});

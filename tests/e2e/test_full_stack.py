"""
End-to-end tests against the RUNNING application, the way a browser uses it: through the frontend's /api proxy,
with a real cookie jar. Nothing is mocked.

  ACIS_E2E_URL=http://localhost:3000  ACIS_E2E_RESEARCHER_EMAIL=e2e-researcher@example.com  pytest tests/e2e -v

The backend must have been started with RESEARCHER_EMAILS set to that same email. Each test creates its own account.
"""
import os
import re
import uuid

import httpx
import pytest

BASE = os.environ.get("ACIS_E2E_URL", "").rstrip("/")
RESEARCHER = os.environ.get("ACIS_E2E_RESEARCHER_EMAIL", "e2e-researcher@example.com")
pytestmark = pytest.mark.skipif(not BASE, reason="set ACIS_E2E_URL to the running frontend, e.g. http://localhost:3000")

PASSWORD = "e2e-password-123"
PAGES = ["/", "/login", "/signup", "/onboarding", "/assessment", "/dashboard", "/careers", "/compare", "/mentor", "/timeline", "/roadmap",
         "/skills", "/resources", "/intelligence", "/opportunities", "/reflections", "/progress", "/profile", "/settings"]
ADULT = {"date_of_birth": "2004-05-01", "education_level": "btech_2", "institution": "E2E College", "city": "Pune",
         "long_term_goal": "Build intelligent systems", "lifestyle": {"work_style": "team"}, "financial_context": "moderate",
         "academics": {"Mathematics": 88, "Physics": 75}}


def browser() -> httpx.Client:
    """A client with a cookie jar, talking to the website's own /api (so cookies are first-party, as in a browser)."""
    return httpx.Client(base_url=f"{BASE}/api", timeout=30, follow_redirects=False, headers={"Origin": BASE})


def csrf(c: httpx.Client) -> dict:
    return {"X-CSRF-Token": c.cookies.get("acis_csrf")}


def sign_up(email=None) -> tuple[httpx.Client, str]:
    c = browser()
    email = email or f"e2e-{uuid.uuid4().hex[:10]}@example.com"
    r = c.post("/auth/register", json={"email": email, "password": PASSWORD, "full_name": "E2E Student"})
    assert r.status_code == 201, r.text
    return c, email


def answers(c, strong_tech=True):
    q = c.get("/assessment/questions").json()
    interests = {i["domain"]: (5 if i["domain"] in ("technology", "mathematics") and strong_tech else 2) for i in q["interests"]}
    return {"interests": interests, "aptitude_answers": {a["id"]: 0 for a in q["aptitude"]}, "creative": {x["id"]: 4 for x in q["creative"]},
            "personality": {x["id"]: 4 for x in q["personality"]}}


@pytest.fixture()
def student():
    c, email = sign_up()
    assert c.post("/onboarding", json=ADULT, headers=csrf(c)).status_code == 200
    r = c.post("/assessment", json=answers(c), headers=csrf(c))
    assert r.status_code == 200, r.text
    c.assessment = r.json()
    yield c
    c.close()


# =========================================================== the website itself
def test_every_screen_is_served_with_security_headers():
    with httpx.Client(base_url=BASE, timeout=30) as web:
        for path in PAGES:
            r = web.get(path)
            assert r.status_code == 200, path
            h = r.headers
            assert h["x-content-type-options"] == "nosniff" and h["x-frame-options"] == "DENY", path
            assert "frame-ancestors 'none'" in h["content-security-policy"] and "object-src 'none'" in h["content-security-policy"], path
            assert "connect-src 'self'" in h["content-security-policy"] and "microphone=(self)" in h["permissions-policy"], path
            assert "x-powered-by" not in h, path


def test_unknown_pages_are_404_and_pages_contain_no_secrets():
    with httpx.Client(base_url=BASE, timeout=30) as web:
        assert web.get("/this-page-does-not-exist").status_code == 404
        html = web.get("/").text
        assert "Build one." in html and "Illustrative example" in html
        assert not re.search(r"sk-[A-Za-z0-9]{10,}|api[_-]?key\s*[:=]\s*[\"'][A-Za-z0-9]", html, re.I)


def test_the_backend_is_reached_only_through_the_websites_api_path():
    with httpx.Client(base_url=BASE, timeout=30) as web:
        r = web.get("/api/health")
        assert r.status_code == 200 and r.json() == {"status": "ok"}
        assert r.headers["cache-control"] == "no-store" and r.headers["x-content-type-options"] == "nosniff"
        assert web.get("/api/careers/portfolio").status_code == 401           # protected, and 401 passes through the proxy intact


# =========================================================== the session cookie, through the real proxy
def test_signup_sets_an_httponly_cookie_that_survives_the_proxy_and_logs_you_in():
    c, email = sign_up()
    lines = c.get("/health").headers.get_list("set-cookie")                  # (health sets none)
    assert lines == []
    r = browser().post("/auth/register", json={"email": f"e2e-{uuid.uuid4().hex[:8]}@example.com", "password": PASSWORD})
    session = next(x for x in r.headers.get_list("set-cookie") if x.startswith(("acis_session=", "__Host-acis_session=")))
    assert "httponly" in session.lower() and "samesite=lax" in session.lower() and "path=/" in session.lower()
    csrf_cookie = next(x for x in r.headers.get_list("set-cookie") if x.startswith("acis_csrf="))
    assert "httponly" not in csrf_cookie.lower()
    assert c.get("/auth/me").json()["email"] == email                          # cookie alone, no Authorization header


def test_forged_requests_without_the_csrf_header_are_refused_through_the_proxy(student):
    forged = student.post("/memory", json={"category": "stable", "content": "forged"})
    assert forged.status_code == 403 and "Security check failed" in forged.json()["detail"]
    assert student.post("/memory", json={"category": "stable", "content": "x"}, headers={"X-CSRF-Token": "guess"}).status_code == 403
    assert student.delete("/profile").status_code == 403                       # account deletion cannot be forged either
    assert student.post("/memory", json={"category": "stable", "content": "real"}, headers=csrf(student)).status_code == 201
    assert "forged" not in student.get("/memory").text


def test_sign_in_from_an_unknown_website_is_refused():
    c = httpx.Client(base_url=f"{BASE}/api", timeout=30, headers={"Origin": "https://evil.example"})
    assert c.post("/auth/login", json={"email": "a@example.com", "password": PASSWORD}).status_code == 403
    assert c.post("/auth/register", json={"email": f"x{uuid.uuid4().hex[:6]}@example.com", "password": PASSWORD}).status_code == 403


def test_wrong_passwords_are_rate_limited_and_the_wait_time_reaches_the_browser():
    c, email = sign_up()
    other = browser()
    for _ in range(5):
        assert other.post("/auth/login", json={"email": email, "password": "wrong-password"}).status_code == 401
    blocked = other.post("/auth/login", json={"email": email, "password": PASSWORD})
    assert blocked.status_code == 429 and int(blocked.headers["retry-after"]) > 0
    stranger, _ = sign_up()                                                   # other accounts are unaffected
    assert stranger.get("/auth/me").status_code == 200


def test_over_long_passwords_are_a_clear_422_not_a_crash():
    r = browser().post("/auth/register", json={"email": f"e2e-{uuid.uuid4().hex[:8]}@example.com", "password": "a" * 90})
    assert r.status_code == 422 and "72 bytes" in r.text


def test_signing_out_ends_the_session_for_good_even_if_the_cookie_was_copied(student):
    copied = student.cookies.get("acis_session") or student.cookies.get("__Host-acis_session")
    name = "acis_session" if student.cookies.get("acis_session") else "__Host-acis_session"
    assert student.post("/auth/logout", headers=csrf(student)).status_code == 204
    assert student.get("/auth/me").status_code == 401                          # the browser's cookies are gone
    replay = browser()
    replay.cookies.set(name, copied, domain=httpx.URL(BASE).host)
    assert replay.get("/auth/me").status_code == 401                          # and the copied one no longer works


# =========================================================== the main user journeys
def test_journey_onboarding_assessment_recommendation_feedback(student):
    portfolio = student.get("/careers/portfolio").json()
    assert portfolio["recommendation_allowed"] is True
    assert portfolio["primary"]["confidence"] in ("moderate", "emerging")      # one assessment never reaches High
    assert "score" not in str(portfolio).lower().replace("recommendation", "")
    ids = student.assessment["recommendation_ids"]
    rec = student.get(f"/careers/recommendations/{ids[portfolio['primary']['slug']]}").json()
    assert rec["why"] and rec["evidence"] and rec["what_could_change"]
    assert student.post(f"/careers/recommendations/{rec['id']}/feedback", json={"helpful": False}, headers=csrf(student)).status_code == 201
    assert student.get("/careers/portfolio").json()["primary"]["slug"] == portfolio["primary"]["slug"]   # one answer does not flip it
    q = student.get("/assessment/questions").text
    assert '"answer"' not in q                                                 # the answer key never leaves the server


def test_journey_rapid_decision_mode():
    c, _ = sign_up()
    c.post("/onboarding", json={**ADULT, "date_of_birth": "2008-03-01", "education_level": "class_12", "guardian_consent": True}, headers=csrf(c))
    r = c.post("/assessment/rapid", json=answers(c), headers=csrf(c)).json()
    assert r["rapid"]["primary"]["degrees"] and r["rapid"]["next_steps"] and "not a prediction" in r["rapid"]["note"]


def test_journey_a_minor_needs_guardian_consent_and_is_not_given_a_verdict():
    c, _ = sign_up()
    minor = {**ADULT, "date_of_birth": "2012-01-01", "education_level": "class_9"}
    assert c.post("/onboarding", json=minor, headers=csrf(c)).status_code == 403
    assert c.post("/onboarding", json={**minor, "guardian_consent": True}, headers=csrf(c)).status_code == 200
    c.post("/assessment", json=answers(c), headers=csrf(c))
    p = c.get("/careers/portfolio").json()
    assert p["recommendation_allowed"] is False and p["primary"] is None and p["secondary"] == [] and p["emerging"]
    assert c.post("/roadmaps/generate", json={"career_slug": "software_engineer"}, headers=csrf(c)).status_code == 409


def test_journey_learning_is_independent_of_career_interest(student):
    before = student.get("/careers/portfolio").json()
    prefs0 = student.get("/learning/preferences").json()
    course = next(r for r in student.get("/learning/resources?limit=50").json() if r["title"].startswith("NPTEL: machine learning"))
    for _ in range(5):
        assert student.post(f"/learning/resources/{course['id']}/feedback", json={"status": "abandoned", "rating": 1}, headers=csrf(student)).status_code == 201
    prefs1 = student.get("/learning/preferences").json()
    assert prefs1["theory"] < prefs0["theory"] and prefs1["project"] > prefs0["project"]
    assert student.get("/careers/portfolio").json() == before


def test_journey_growth_skills_projects_and_roadmap(student):
    h = csrf(student)
    gap0 = {g["slug"]: g for g in student.get("/careers/ai_ml_engineer/skill-gap").json()["skills"]}
    assert gap0["python"]["status"] == "missing"
    assert student.put("/growth/skills", json={"skill_slug": "python", "level": 4}, headers=h).status_code == 200
    assert {g["slug"]: g for g in student.get("/careers/ai_ml_engineer/skill-gap").json()["skills"]}["python"]["status"] == "met"
    idea = student.get("/growth/projects/ideas").json()[0]
    pid = student.post("/growth/projects", json={"title": idea["title"], "idea_id": idea["id"]}, headers=h).json()["id"]
    assert student.post(f"/growth/projects/{pid}/complete", headers=h).json()["status"] == "completed"
    assert student.get("/growth/progress").json()["projects_completed"] == 1
    road = student.post("/roadmaps/generate", json={"career_slug": "ai_ml_engineer"}, headers=h).json()
    assert {"skill", "resource", "project"} <= {i["kind"] for i in road["items"]}
    ticked = student.patch(f"/roadmaps/{road['id']}/items/{road['items'][0]['id']}", json={"done": True}, headers=h).json()
    assert ticked["progress"]["done"] >= 1


def test_journey_memory_journal_reflection_voice_and_deletion(student):
    h = csrf(student)
    for cat in ("stable", "evolving", "episodic", "temporary"):
        assert student.post("/memory", json={"category": cat, "content": f"e2e {cat} memory"}, headers=h).status_code == 201
    j = student.post("/journal", json={"text": "I really enjoyed building a robot. The law lecture was boring."}, headers=h).json()
    assert {"engineering", "law_governance"} <= set(j["detected"]["fields"])
    v = student.post("/voice", data={"transcript": "I loved the python workshop"}, headers=h)
    assert v.status_code == 201 and v.json()["audio_stored"] is False
    r = student.post("/reflections", json={"enjoyed": "robotics club", "interests_changed": "unsure", "related_careers": [{"slug": "robotics_engineer", "feeling": "enjoyed"}]}, headers=h)
    assert r.status_code == 201 and "robotics_engineer" in r.json()["career_evidence_added_for"]
    timeline = student.get("/timeline").text
    assert "law lecture" not in timeline and "Wrote a journal entry" in timeline          # private text never reaches the timeline
    assert student.delete(f"/journal/{j['id']}", headers=h).status_code == 204
    assert student.get(f"/journal/{j['id']}").status_code == 404


def test_journey_mentor_works_without_any_ai_key_and_handles_distress_safely(student):
    h = csrf(student)
    assert student.get("/mentor/status").json()["mode"] == "rule_based"
    a = student.post("/mentor/chat", json={"message": "Compare software engineer and lawyer for me"}, headers=h).json()
    assert a["reply"]["intent"] == "compare" and a["reply"]["sources"] and "not a verdict" in a["reply"]["content"]
    b = student.post("/mentor/chat", json={"message": "I want to die", "conversation_id": a["conversation_id"]}, headers=h).json()
    assert b["reply"]["intent"] == "support" and "14416" in b["reply"]["content"]
    assert len(student.get(f"/mentor/conversations/{a['conversation_id']}").json()["messages"]) == 4


def test_journey_nothing_is_invented_for_opportunities_or_news(student):
    o = student.get("/opportunities").json()
    i = student.get("/intelligence").json()
    assert o["items"] == [] and "never invents" in o["message"]
    assert i["items"] == [] and "never makes any up" in i["message"]


# =========================================================== privacy and ownership
def test_students_cannot_see_each_others_data(student):
    h = csrf(student)
    mid = student.post("/memory", json={"category": "stable", "content": "private to the first student"}, headers=h).json()["id"]
    j = student.post("/journal", json={"text": "my private diary about python"}, headers=h).json()
    other, _ = sign_up()
    other.post("/onboarding", json=ADULT, headers=csrf(other))
    assert other.get(f"/memory/{mid}").status_code == 404
    assert other.get(f"/journal/{j['id']}").status_code == 404
    assert "private" not in other.get("/memory").text and "diary" not in other.get("/journal").text
    assert other.get("/research/my-data").text.count("private to the first student") == 0


def test_research_export_is_only_for_listed_researchers_and_is_anonymous(student):
    h = csrf(student)
    assert student.get("/research/export").status_code == 403
    student.post("/journal", json={"text": "SECRET JOURNAL python"}, headers=h)
    student.put("/research/consent", json={"consent": True}, headers=h)
    boss, email = sign_up(RESEARCHER)
    r = boss.get("/research/export")
    if r.status_code == 403:
        pytest.skip("backend was not started with RESEARCHER_EMAILS=" + RESEARCHER)
    boss.post("/onboarding", json=ADULT, headers=csrf(boss))
    boss.post("/assessment", json=answers(boss), headers=csrf(boss))
    boss.put("/research/consent", json={"consent": True}, headers=csrf(boss))
    body = boss.get("/research/export").json()
    text = str(body)
    assert body["rows"] and "SECRET" not in text and "@example.com" not in text and "E2E Student" not in text
    assert all(len(x["student"]) == 12 for x in body["rows"])
    student.put("/research/consent", json={"consent": False}, headers=h)          # withdrawing consent removes the data
    mine = boss.get("/research/export").json()["rows"]
    assert len({x["student"] for x in mine}) == 1


def test_downloading_your_data_and_deleting_your_account():
    c, email = sign_up()
    c.post("/onboarding", json=ADULT, headers=csrf(c))
    dump = c.get("/research/my-data").json()
    assert dump["account"]["email"] == email and "password" not in str(dump).lower()
    assert c.delete("/profile", headers=csrf(c)).status_code == 204
    assert c.get("/auth/me").status_code == 401
    fresh = browser()
    assert fresh.post("/auth/login", json={"email": email, "password": PASSWORD}).status_code == 401

"""Security behaviour: httpOnly session cookie, CSRF protection, brute-force limits, headers, production checks."""
import uuid
from datetime import datetime, timedelta

import jwt
import pytest

from app import security
from app.config import Settings, check_production_settings, settings
from app.routers import auth as auth_router
from app.services.rate_limit import FailureLimiter

GOOD = "password123"


def new_email():
    return f"{uuid.uuid4().hex[:10]}@example.com"


def register(c, email=None, **kw):
    email = email or new_email()
    r = c.post("/auth/register", json={"email": email, "password": GOOD, "full_name": "Sec Test"}, **kw)
    assert r.status_code == 201, r.text
    return email, r


def set_cookie_lines(r):
    return r.headers.get_list("set-cookie")


def cookie_line(r, name):
    return next(x for x in set_cookie_lines(r) if x.lower().startswith(name.lower() + "="))


def csrf(c):
    return {"X-CSRF-Token": c.cookies.get("acis_csrf")}


# ================================================================ the session cookie
def test_login_sets_an_httponly_samesite_session_cookie_and_a_readable_csrf_cookie(browser):
    _, r = register(browser)
    session = cookie_line(r, "acis_session").lower()
    assert "httponly" in session and "samesite=lax" in session and "path=/" in session and "max-age=" in session
    csrf_line = cookie_line(r, "acis_csrf").lower()
    assert "httponly" not in csrf_line and "samesite=lax" in csrf_line         # the page must be able to read this one


def test_the_token_is_never_needed_in_javascript_the_cookie_alone_logs_you_in(browser):
    register(browser)
    assert browser.get("/auth/me").status_code == 200                          # no Authorization header at all


def test_failed_login_sets_no_cookie(browser):
    email, _ = register(browser)
    browser.cookies.clear()
    r = browser.post("/auth/login", json={"email": email, "password": "wrong-password"})
    assert r.status_code == 401 and set_cookie_lines(r) == []


def test_login_sets_the_cookie_too(browser):
    email, _ = register(browser)
    browser.cookies.clear()
    r = browser.post("/auth/login", json={"email": email, "password": GOOD})
    assert r.status_code == 200 and "httponly" in cookie_line(r, "acis_session").lower()
    assert browser.get("/auth/me").json()["email"] == email


def test_in_production_the_cookie_is_secure_and_uses_the_host_prefix(browser, monkeypatch):
    monkeypatch.setattr(settings, "cookie_secure", True)
    _, r = register(browser)
    line = cookie_line(r, "__Host-acis_session").lower()
    assert "secure" in line and "httponly" in line and "path=/" in line and "domain=" not in line


def test_bearer_tokens_still_work_for_api_clients_and_swagger(client):
    _, r = register(client)
    token = r.json()["access_token"]
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {token}"}).status_code == 200
    assert client.post("/memory", headers={"Authorization": f"Bearer {token}"},
                       json={"category": "stable", "content": "x"}).status_code in (201, 404)   # 404 = no onboarding yet, still authenticated


def test_a_tampered_or_expired_cookie_is_rejected(browser):
    register(browser)
    name = security.session_cookie_name()
    real = browser.cookies.get(name)
    browser.cookies.set(name, real[:-3] + "xyz")
    assert browser.get("/auth/me").status_code == 401
    expired = jwt.encode({"sub": "1", "exp": datetime.utcnow() - timedelta(minutes=1)}, settings.secret_key, algorithm="HS256")
    browser.cookies.set(name, expired)
    assert browser.get("/auth/me").status_code == 401
    wrong_key = jwt.encode({"sub": "1", "exp": datetime.utcnow() + timedelta(hours=1)}, "some-other-key-entirely-12345678", algorithm="HS256")
    browser.cookies.set(name, wrong_key)
    assert browser.get("/auth/me").status_code == 401


def test_logout_clears_both_cookies_and_ends_the_session(browser):
    register(browser)
    assert browser.get("/auth/me").status_code == 200
    r = browser.post("/auth/logout")
    assert r.status_code == 204
    cleared = " ".join(set_cookie_lines(r)).lower()
    assert "acis_session=" in cleared and "acis_csrf=" in cleared and ("max-age=0" in cleared or "expires=" in cleared)
    assert browser.get("/auth/me").status_code == 401


def test_logout_works_even_when_not_signed_in(browser):
    assert browser.post("/auth/logout").status_code == 204


# ================================================================ CSRF
def onboarded_browser(browser):
    register(browser)
    r = browser.post("/onboarding", headers=csrf(browser), json={"date_of_birth": "2004-05-01", "education_level": "btech_2"})
    assert r.status_code == 200, r.text
    return browser


def test_changing_data_with_only_the_cookie_is_refused(browser):
    onboarded_browser(browser)
    r = browser.post("/memory", json={"category": "stable", "content": "forged request"})
    assert r.status_code == 403 and "Security check failed" in r.json()["detail"]
    assert browser.get("/memory").json()["total"] >= 1                          # and nothing was written
    assert "forged request" not in browser.get("/memory").text


def test_a_matching_csrf_header_is_accepted_and_a_wrong_one_is_not(browser):
    onboarded_browser(browser)
    ok = browser.post("/memory", headers=csrf(browser), json={"category": "stable", "content": "real request"})
    assert ok.status_code == 201
    bad = browser.post("/memory", headers={"X-CSRF-Token": "not-the-token"}, json={"category": "stable", "content": "x"})
    assert bad.status_code == 403
    blank = browser.post("/memory", headers={"X-CSRF-Token": ""}, json={"category": "stable", "content": "x"})
    assert blank.status_code == 403


def test_csrf_is_required_for_every_kind_of_change(browser):
    onboarded_browser(browser)
    mid = browser.post("/memory", headers=csrf(browser), json={"category": "stable", "content": "x"}).json()["id"]
    assert browser.patch(f"/memory/{mid}", json={"content": "y"}).status_code == 403
    assert browser.put("/research/consent", json={"consent": True}).status_code == 403
    assert browser.delete(f"/memory/{mid}").status_code == 403
    assert browser.delete("/profile").status_code == 403                        # account deletion cannot be forged
    assert browser.get("/auth/me").status_code == 200                           # still signed in, still safe to read


def test_reading_needs_no_csrf_header(browser):
    onboarded_browser(browser)
    for path in ["/auth/me", "/profile", "/memory", "/timeline", "/careers"]:
        assert browser.get(path).status_code in (200, 409), path


def test_csrf_is_not_asked_of_bearer_clients(client):
    _, r = register(client)
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    client.post("/onboarding", headers=h, json={"date_of_birth": "2004-05-01", "education_level": "btech_2"})
    assert client.post("/memory", headers=h, json={"category": "stable", "content": "x"}).status_code == 201


def test_a_stolen_csrf_value_without_the_session_gets_nothing(browser):
    register(browser)
    token = browser.cookies.get("acis_csrf")
    browser.cookies.delete(security.session_cookie_name())
    r = browser.post("/memory", headers={"X-CSRF-Token": token}, json={"category": "stable", "content": "x"})
    assert r.status_code == 401


# ================================================================ origin check on sign-in / sign-up
def test_login_and_signup_from_an_unknown_website_are_refused(client):
    evil = {"Origin": "https://evil.example"}
    assert client.post("/auth/register", headers=evil, json={"email": new_email(), "password": GOOD}).status_code == 403
    assert client.post("/auth/login", headers=evil, json={"email": new_email(), "password": GOOD}).status_code == 403


def test_login_from_the_real_site_or_without_an_origin_is_allowed(client):
    home = {"Origin": settings.cors_origins.split(",")[0].strip()}
    assert client.post("/auth/register", headers=home, json={"email": new_email(), "password": GOOD}).status_code == 201
    assert client.post("/auth/register", json={"email": new_email(), "password": GOOD}).status_code == 201


def test_cors_allows_the_csrf_header_only_for_the_real_site(client):
    ok = client.options("/memory", headers={"Origin": "http://localhost:3000", "Access-Control-Request-Method": "POST",
                                            "Access-Control-Request-Headers": "content-type,x-csrf-token"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:3000"
    assert ok.headers.get("access-control-allow-credentials") == "true"
    assert "x-csrf-token" in ok.headers.get("access-control-allow-headers", "").lower()
    bad = client.options("/memory", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "POST"})
    assert "access-control-allow-origin" not in bad.headers


# ================================================================ brute-force protection
def test_five_wrong_passwords_lock_that_account_for_a_while_even_for_the_right_one(client):
    email, _ = register(client)
    for _ in range(settings.login_max_failures):
        assert client.post("/auth/login", json={"email": email, "password": "wrong-password"}).status_code == 401
    r = client.post("/auth/login", json={"email": email, "password": GOOD})
    assert r.status_code == 429 and int(r.headers["retry-after"]) > 0 and "Too many failed attempts" in r.json()["detail"]


def test_one_accounts_lockout_does_not_affect_another(client):
    a, _ = register(client)
    b, _ = register(client)
    for _ in range(settings.login_max_failures):
        client.post("/auth/login", json={"email": a, "password": "wrong-password"})
    assert client.post("/auth/login", json={"email": a, "password": GOOD}).status_code == 429
    assert client.post("/auth/login", json={"email": b, "password": GOOD}).status_code == 200


def test_a_successful_login_resets_the_failure_count(client):
    email, _ = register(client)
    for _ in range(settings.login_max_failures - 1):
        client.post("/auth/login", json={"email": email, "password": "wrong-password"})
    assert client.post("/auth/login", json={"email": email, "password": GOOD}).status_code == 200
    for _ in range(settings.login_max_failures - 1):
        assert client.post("/auth/login", json={"email": email, "password": "wrong-password"}).status_code == 401
    assert client.post("/auth/login", json={"email": email, "password": GOOD}).status_code == 200


def test_unknown_email_and_wrong_password_look_identical(client):
    email, _ = register(client)
    wrong = client.post("/auth/login", json={"email": email, "password": "wrong-password"})
    unknown = client.post("/auth/login", json={"email": new_email(), "password": "wrong-password"})
    assert wrong.status_code == unknown.status_code == 401
    assert wrong.json() == unknown.json()


def test_an_unknown_email_still_costs_a_password_check_so_timing_does_not_reveal_accounts(client, monkeypatch):
    calls = []
    real = auth_router.verify_password
    monkeypatch.setattr(auth_router, "verify_password", lambda pw, h: calls.append(h) or real(pw, h))
    client.post("/auth/login", json={"email": new_email(), "password": "whatever-123"})
    assert calls == [security.DUMMY_HASH]


def test_limiter_forgets_old_failures_after_the_window():
    now = [1000.0]
    lim = FailureLimiter(3, 60, clock=lambda: now[0])
    for _ in range(3):
        lim.record_failure("k")
    assert lim.retry_after("k") > 0
    now[0] += 61
    assert lim.retry_after("k") == 0
    lim.record_failure("k")
    assert lim.retry_after("k") == 0                       # only one recent failure now


def test_limiter_memory_stays_bounded():
    lim = FailureLimiter(3, 3600, max_keys=1000)
    for i in range(5000):                                  # every entry is still inside the window, so none can expire
        lim.record_failure(f"user{i}")
    assert len(lim.failures) <= 1000


# ================================================================ passwords
def test_over_long_passwords_get_a_clear_error_not_a_server_crash(client):
    for pw in ["a" * 73, "a" * 90, "🙂" * 30]:
        r = client.post("/auth/register", json={"email": new_email(), "password": pw})
        assert r.status_code == 422 and "at most 72 bytes" in r.text, pw[:5]


def test_passwords_up_to_the_limit_work_and_logging_in_with_a_huge_one_is_just_a_401(client):
    email = new_email()
    assert client.post("/auth/register", json={"email": email, "password": "p" * 72}).status_code == 201
    assert client.post("/auth/login", json={"email": email, "password": "p" * 72}).status_code == 200
    assert client.post("/auth/login", json={"email": email, "password": "p" * 5000}).status_code == 401


# ================================================================ headers
def test_api_responses_carry_security_headers_and_are_never_cached(client):
    r = client.get("/health")
    assert r.headers["x-content-type-options"] == "nosniff" and r.headers["x-frame-options"] == "DENY"
    assert r.headers["referrer-policy"] == "no-referrer" and r.headers["cache-control"] == "no-store"


def test_swagger_docs_are_not_marked_no_store(client):
    assert "no-store" not in client.get("/docs").headers.get("cache-control", "")


# ================================================================ production safety
def prod(**over):
    base = dict(environment="production", secret_key="x" * 48, cookie_secure=True, cors_origins="https://acis.example.org",
                auth_mode="local", _env_file=None)
    base.update(over)
    return Settings(**base)


def test_a_correct_production_configuration_is_accepted():
    check_production_settings(prod())


def test_development_may_use_defaults():
    check_production_settings(Settings(environment="development", _env_file=None))


@pytest.mark.parametrize("bad", [
    {"secret_key": "change-me-in-env"}, {"secret_key": "enter_a_long_random_string_here"}, {"secret_key": "short"}, {"secret_key": ""},
    {"cookie_secure": False}, {"cors_origins": "*"}, {"cors_origins": "https://a.org,*"}, {"cookie_samesite": "none"},
    {"auth_mode": "supabase", "supabase_jwt_secret": ""},
])
def test_production_refuses_to_start_with_unsafe_settings(bad):
    with pytest.raises(RuntimeError, match="Refusing to start in production"):
        check_production_settings(prod(**bad))


def test_the_error_lists_every_problem_at_once():
    with pytest.raises(RuntimeError) as e:
        check_production_settings(prod(secret_key="change-me-in-env", cookie_secure=False, cors_origins="*"))
    assert str(e.value).count("\n  - ") == 3


# ================================================================ signing out revokes the session on the server
def test_signing_out_makes_the_old_cookie_useless_even_if_someone_kept_a_copy(browser):
    register(browser)
    stolen = browser.cookies.get(security.session_cookie_name())
    assert browser.get("/auth/me").status_code == 200
    assert browser.post("/auth/logout", headers=csrf(browser)).status_code == 204
    browser.cookies.set(security.session_cookie_name(), stolen)             # an attacker replays the copied cookie
    assert browser.get("/auth/me").status_code == 401


def test_you_can_sign_in_again_after_signing_out(browser):
    email, _ = register(browser)
    browser.post("/auth/logout", headers=csrf(browser))
    assert browser.post("/auth/login", json={"email": email, "password": GOOD}).status_code == 200
    assert browser.get("/auth/me").json()["email"] == email


def test_signing_out_on_one_device_signs_out_every_device(browser, db):
    from fastapi.testclient import TestClient
    from app.main import app
    email, _ = register(browser)
    phone = TestClient(app)
    assert phone.post("/auth/login", json={"email": email, "password": GOOD}).status_code == 200
    assert phone.get("/auth/me").status_code == 200
    browser.post("/auth/logout", headers=csrf(browser))
    assert phone.get("/auth/me").status_code == 401


def test_a_forged_sign_out_clears_the_cookie_but_cannot_sign_you_out_everywhere(browser, db):
    from fastapi.testclient import TestClient
    from app.main import app
    email, _ = register(browser)
    phone = TestClient(app)
    phone.post("/auth/login", json={"email": email, "password": GOOD})
    r = browser.post("/auth/logout")                                         # no CSRF header, as in a forged request
    assert r.status_code == 204 and "acis_session=" in " ".join(set_cookie_lines(r))
    assert phone.get("/auth/me").status_code == 200                          # the other device was not signed out


def test_bearer_clients_can_sign_out_everywhere_too(client):
    _, r = register(client)
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    assert client.get("/auth/me", headers=h).status_code == 200
    assert client.post("/auth/logout", headers=h).status_code == 204
    assert client.get("/auth/me", headers=h).status_code == 401


def test_signing_out_with_a_broken_or_expired_session_still_works_and_clears_cookies(browser):
    browser.cookies.set(security.session_cookie_name(), "garbage")
    r = browser.post("/auth/logout")
    assert r.status_code == 204 and "acis_session=" in " ".join(set_cookie_lines(r))


def test_tokens_without_the_new_claim_count_as_the_first_session_and_are_revoked_like_any_other(client, db):
    from app import models as m
    email, r = register(client)
    uid = db.query(m.User).filter_by(email=email).one().id
    old_style = jwt.encode({"sub": str(uid), "exp": datetime.utcnow() + timedelta(hours=1)}, settings.secret_key, algorithm="HS256")
    h = {"Authorization": f"Bearer {old_style}"}
    assert client.get("/auth/me", headers=h).status_code == 200
    client.post("/auth/logout", headers={"Authorization": f"Bearer {r.json()['access_token']}"})
    assert client.get("/auth/me", headers=h).status_code == 401

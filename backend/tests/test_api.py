import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app import models as m
from app.assessment_bank import APTITUDE_QUESTIONS
from app.database import get_db
from app.main import app


@pytest.fixture()
def client(db):
    from tests.conftest import StatelessClient
    app.dependency_overrides[get_db] = lambda: db
    yield StatelessClient(app)
    app.dependency_overrides.clear()


def signup(client, name="Asha"):
    email = f"{uuid.uuid4().hex[:8]}@example.com"
    r = client.post("/auth/register", json={"email": email, "password": "password123", "full_name": name})
    assert r.status_code == 201, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}, email


ADULT = {"date_of_birth": "2004-05-01", "education_level": "btech_2", "institution": "Test College",
         "city": "Pune", "long_term_goal": "Build intelligent systems", "academics": {"Mathematics": 88, "Physics": 75}}
TECH_ASSESSMENT = {
    "interests": {"technology": 5, "mathematics": 5, "science": 3, "engineering": 3, "arts_design": 1,
                  "business": 2, "healthcare": 1, "social_impact": 2, "writing_media": 1, "law_governance": 1},
    "aptitude_answers": {q["id"]: q["answer"] for q in APTITUDE_QUESTIONS},
    "creative": {"c1": 3, "c2": 3, "c3": 3},
    "personality": {f"p{i}": 4 for i in range(1, 11)},
}


def onboard_and_assess(client, headers, onboarding=ADULT, assessment=TECH_ASSESSMENT):
    assert client.post("/onboarding", json=onboarding, headers=headers).status_code == 200
    r = client.post("/assessment", json=assessment, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


# ------------------------------------------------------------------ auth
def test_register_login_me(client):
    headers, email = signup(client)
    assert client.get("/auth/me", headers=headers).json()["email"] == email
    ok = client.post("/auth/login", json={"email": email, "password": "password123"})
    assert ok.status_code == 200 and ok.json()["access_token"]


def test_duplicate_email_and_wrong_password(client):
    _, email = signup(client)
    assert client.post("/auth/register", json={"email": email, "password": "password123"}).status_code == 409
    assert client.post("/auth/login", json={"email": email, "password": "wrongpass1"}).status_code == 401
    assert client.post("/auth/login", json={"email": "nobody@example.com", "password": "password123"}).status_code == 401


def test_short_password_rejected(client):
    assert client.post("/auth/register", json={"email": "a@example.com", "password": "short"}).status_code == 422


def test_protected_routes_need_a_valid_token(client):
    for path in ["/profile", "/careers/portfolio", "/learning/preferences", "/growth/skills", "/assessment/questions"]:
        assert client.get(path).status_code == 401
        assert client.get(path, headers={"Authorization": "Bearer not.a.token"}).status_code == 401


def test_password_is_not_stored_in_plain_text(client, db):
    _, email = signup(client)
    u = db.scalars(select(m.User).where(m.User.email == email)).one()
    assert "password123" not in u.password_hash and u.password_hash.startswith("$2")


def test_assessment_questions_do_not_leak_the_answer_key(client):
    headers, _ = signup(client)
    body = client.get("/assessment/questions", headers=headers).text
    assert '"answer"' not in body and '"reverse"' not in body


# ------------------------------------------------------------------ onboarding / consent / validation
def test_minor_needs_guardian_consent(client):
    headers, _ = signup(client)
    minor = {**ADULT, "date_of_birth": "2012-01-01", "education_level": "class_9"}
    assert client.post("/onboarding", json=minor, headers=headers).status_code == 403
    assert client.post("/onboarding", json={**minor, "guardian_consent": True}, headers=headers).status_code == 200
    p = client.get("/profile", headers=headers).json()["profile"]
    assert p["is_minor"] is True and p["stage"] == "explore"


def test_invalid_input_is_rejected(client):
    headers, _ = signup(client)
    assert client.post("/onboarding", json={**ADULT, "academics": {"Maths": 140}}, headers=headers).status_code == 422
    client.post("/onboarding", json=ADULT, headers=headers)
    bad = {**TECH_ASSESSMENT, "interests": {"astrology": 5}}
    assert client.post("/assessment", json=bad, headers=headers).status_code == 422
    bad = {**TECH_ASSESSMENT, "interests": {"technology": 9}}
    assert client.post("/assessment", json=bad, headers=headers).status_code == 422


def test_assessment_before_onboarding_is_refused(client):
    headers, _ = signup(client)
    assert client.post("/assessment", json=TECH_ASSESSMENT, headers=headers).status_code == 404


# ------------------------------------------------------------------ integration: the full loop
def test_onboarding_to_assessment_to_recommendation(client):
    headers, _ = signup(client)
    result = onboard_and_assess(client, headers)
    p = client.get("/careers/portfolio", headers=headers).json()
    assert p["recommendation_allowed"] is True
    assert p["primary"]["slug"] in {"ai_ml_engineer", "software_engineer", "data_scientist"}
    assert p["primary"]["confidence"] in {"moderate", "emerging"}      # one assessment is not "high"
    assert "score" not in str(p).lower().replace("recommendation", "")  # no raw numbers exposed
    rec_id = result["recommendation_ids"][p["primary"]["slug"]]
    rec = client.get(f"/careers/recommendations/{rec_id}", headers=headers).json()
    assert rec["why"] and rec["what_could_change"] and rec["evidence"]


def test_recommendation_feedback_feeds_future_updates(client, db):
    headers, _ = signup(client)
    result = onboard_and_assess(client, headers)
    p = client.get("/careers/portfolio", headers=headers).json()
    slug = p["primary"]["slug"]
    rec_id = result["recommendation_ids"][slug]
    before = db.query(m.CareerEvidence).count()
    r = client.post(f"/careers/recommendations/{rec_id}/feedback", headers=headers,
                    json={"helpful": True, "relevance": 5, "comment": "yes this is me"})
    assert r.status_code == 201
    assert db.query(m.CareerEvidence).count() == before + 1          # feedback became (mild) evidence
    assert db.query(m.RecommendationFeedback).count() >= 1
    assert client.get("/careers/portfolio", headers=headers).json()["primary"]["slug"] == slug


def test_negative_feedback_is_gentle_not_dramatic(client):
    headers, _ = signup(client)
    result = onboard_and_assess(client, headers)
    slug = client.get("/careers/portfolio", headers=headers).json()["primary"]["slug"]
    client.post(f"/careers/recommendations/{result['recommendation_ids'][slug]}/feedback", headers=headers,
                json={"helpful": False})
    assert client.get("/careers/portfolio", headers=headers).json()["primary"]["slug"] == slug


def test_explore_stage_student_gets_no_recommendation(client):
    headers, _ = signup(client)
    onboard_and_assess(client, headers, onboarding={**ADULT, "date_of_birth": "2012-01-01",
                                                    "education_level": "class_9", "guardian_consent": True})
    p = client.get("/careers/portfolio", headers=headers).json()
    assert p["recommendation_allowed"] is False and p["primary"] is None and p["secondary"] == []
    assert p["emerging"] and p["explore_message"]


def test_rapid_mode_gives_directions_pathways_and_next_steps(client):
    headers, _ = signup(client)
    client.post("/onboarding", json={**ADULT, "education_level": "class_12", "date_of_birth": "2008-03-01",
                                     "guardian_consent": True}, headers=headers)
    r = client.post("/assessment/rapid", json=TECH_ASSESSMENT, headers=headers).json()
    assert r["rapid"]["primary"]["degrees"] and r["rapid"]["next_steps"]
    assert "not a prediction" in r["rapid"]["note"]
    assert client.get("/profile", headers=headers).json()["profile"]["rapid_mode_used"] is True


def test_learning_feedback_via_api_leaves_career_portfolio_unchanged(client, db):
    headers, _ = signup(client)
    onboard_and_assess(client, headers)
    before = client.get("/careers/portfolio", headers=headers).json()
    ev_before = db.query(m.CareerEvidence).count()
    course = db.scalars(select(m.Resource).where(m.Resource.title.like("NPTEL: machine learning%"))).one()
    for _ in range(8):
        r = client.post(f"/learning/resources/{course.id}/feedback", headers=headers,
                        json={"status": "abandoned", "rating": 1, "comment": "too theoretical"})
        assert r.status_code == 201
    assert client.get("/careers/portfolio", headers=headers).json() == before
    assert db.query(m.CareerEvidence).count() == ev_before
    prefs = client.get("/learning/preferences", headers=headers).json()
    assert prefs["theory"] < 0.5 < prefs["project"]


def test_recommended_resources_adapt_to_learning_style(client, db):
    headers, _ = signup(client)
    onboard_and_assess(client, headers)
    course = db.scalars(select(m.Resource).where(m.Resource.title.like("NPTEL: machine learning%"))).one()
    kaggle = db.scalars(select(m.Resource).where(m.Resource.title.like("Kaggle Learn: Intro to Machine%"))).one()

    def ranks():
        res = client.get("/learning/recommended?career=ai_ml_engineer&limit=20", headers=headers).json()["resources"]
        ids = [r["id"] for r in res]
        return ids.index(course.id), ids.index(kaggle.id)

    theory_before, kaggle_before = ranks()
    for _ in range(6):
        client.post(f"/learning/resources/{course.id}/feedback", headers=headers,
                    json={"status": "abandoned", "rating": 1, "comment": "too theoretical"})
    theory_after, kaggle_after = ranks()
    assert theory_after > theory_before          # the theoretical course drops down the list
    assert kaggle_after < kaggle_before          # the hands-on course moves up
    assert kaggle_after < theory_after


def test_completing_a_project_updates_growth_and_adds_career_evidence(client, db):
    headers, _ = signup(client)
    onboard_and_assess(client, headers)
    idea = db.scalars(select(m.ProjectIdea).where(m.ProjectIdea.title.like("Spam message%"))).one()
    pid = client.post("/growth/projects", headers=headers,
                      json={"title": idea.title, "idea_id": idea.id}).json()["id"]
    done = client.post(f"/growth/projects/{pid}/complete", headers=headers).json()
    assert "ai_ml_engineer" in done["career_evidence_for"]
    skills = {s["slug"]: s["level"] for s in client.get("/growth/skills", headers=headers).json()}
    assert skills["python"] >= 1 and skills["machine_learning"] >= 1
    assert client.get("/growth/progress", headers=headers).json()["projects_completed"] == 1


def test_skill_gap_shows_missing_skills_and_updates_with_progress(client):
    headers, _ = signup(client)
    onboard_and_assess(client, headers)
    gap = client.get("/careers/ai_ml_engineer/skill-gap", headers=headers).json()["skills"]
    python_before = next(g for g in gap if g["slug"] == "python")
    assert python_before["status"] == "missing"
    client.put("/growth/skills", headers=headers, json={"skill_slug": "python", "level": 4})
    gap = client.get("/careers/ai_ml_engineer/skill-gap", headers=headers).json()["skills"]
    assert next(g for g in gap if g["slug"] == "python")["status"] == "met"


def test_career_comparison(client):
    headers, _ = signup(client)
    onboard_and_assess(client, headers)
    r = client.get("/careers/compare?a=ai_ml_engineer&b=ux_designer", headers=headers).json()
    assert [c["slug"] for c in r["careers"]] == ["ai_ml_engineer", "ux_designer"]
    assert client.get("/careers/compare?a=nope&b=ux_designer", headers=headers).status_code == 404


def test_research_log_records_everything_needed(client, db):
    headers, _ = signup(client)
    onboard_and_assess(client, headers)
    rec = db.scalars(select(m.Recommendation).order_by(m.Recommendation.id.desc())).first()
    assert rec.algorithm_version and rec.model_version and rec.knowledge_base_version
    assert rec.input_evidence and rec.explanation and rec.confidence and rec.created_at


# ------------------------------------------------------------------ authorisation / privacy
def test_users_cannot_see_each_others_data(client):
    a_headers, _ = signup(client, "A")
    b_headers, _ = signup(client, "B")
    result = onboard_and_assess(client, a_headers)
    rec_id = next(iter(result["recommendation_ids"].values()))
    # B cannot read or give feedback on A's recommendation
    assert client.get(f"/careers/recommendations/{rec_id}", headers=b_headers).status_code == 404
    assert client.post(f"/careers/recommendations/{rec_id}/feedback", headers=b_headers,
                       json={"helpful": False}).status_code == 404
    # B cannot complete A's project
    pid = client.post("/growth/projects", headers=a_headers, json={"title": "Mine"}).json()["id"]
    assert client.post(f"/growth/projects/{pid}/complete", headers=b_headers).status_code == 404
    assert client.get("/growth/projects", headers=b_headers).json() == []
    assert client.get("/careers/history", headers=b_headers).json() == []


def test_delete_account_removes_all_personal_data(client, db):
    headers, email = signup(client)
    onboard_and_assess(client, headers)
    uid = db.scalars(select(m.User.id).where(m.User.email == email)).one()
    assert client.delete("/profile", headers=headers).status_code == 204
    for model in (m.StudentProfile, m.Interest, m.CareerScore, m.Memory, m.Recommendation, m.AgentRun):
        assert db.query(model).filter_by(user_id=uid).count() == 0, model.__name__
    assert client.get("/auth/me", headers=headers).status_code == 401


def test_profile_returns_details_needed_to_edit_onboarding(client):
    """The frontend pre-fills the edit form from this, so re-submitting never wipes the student's marks."""
    headers, _ = signup(client)
    assert client.get("/profile", headers=headers).json()["profile"] is None
    client.post("/onboarding", json=ADULT, headers=headers)
    p = client.get("/profile", headers=headers).json()["profile"]
    assert p["date_of_birth"] == "2004-05-01" and p["research_consent"] is False
    assert {a["subject"]: a["score_percent"] for a in p["academics"]} == {"Mathematics": 88, "Physics": 75}
    assert p["stage"] == "learn" and p["onboarding_done"] is True

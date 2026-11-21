import csv
import io

from app import models as m
from app.config import settings
from tests.helpers import explore_student, my_id, ready_student, signup


def become_researcher(client, monkeypatch, name="Researcher"):
    h = ready_student(client, name)
    email = client.get("/auth/me", headers=h).json()["email"]
    monkeypatch.setattr(settings, "researcher_emails", f"someone@else.org, {email.upper()}")
    return h


def opt_in(client, h):
    assert client.put("/research/consent", headers=h, json={"consent": True}).status_code == 200


# ============================================================ consent
def test_research_consent_is_off_by_default_and_can_be_changed(client):
    h = ready_student(client)
    assert client.get("/research/consent", headers=h).json() == {"research_consent": False}
    opt_in(client, h)
    assert client.get("/research/consent", headers=h).json() == {"research_consent": True}
    client.put("/research/consent", headers=h, json={"consent": False})
    assert client.get("/research/consent", headers=h).json() == {"research_consent": False}
    assert client.put("/research/consent", headers=h, json={"consent": "maybe"}).status_code == 422
    assert client.get("/research/consent").status_code == 401


# ============================================================ a student's own data
def test_my_data_contains_everything_and_no_password(client):
    h = ready_student(client)
    client.post("/journal", headers=h, json={"text": "My own diary about python."})
    client.post("/memory", headers=h, json={"category": "stable", "content": "likes maths"})
    client.post("/mentor/chat", headers=h, json={"message": "hello"})
    r = client.get("/research/my-data", headers=h)
    assert r.status_code == 200 and "attachment" in r.headers["content-disposition"]
    data = r.json()
    for key in ["account", "profile", "interests", "aptitude_results", "personality_results", "career_evidence", "career_history",
                "memories", "journal_entries", "reflections", "recommendations", "mentor_conversations", "roadmaps", "projects"]:
        assert key in data
    assert data["journal_entries"][0]["text"] == "My own diary about python."
    assert data["mentor_conversations"][0]["messages"]
    assert "password" not in r.text.lower() and "embedding" not in r.text
    assert data["account"]["email"].endswith("@example.com")


def test_my_data_contains_only_my_data(client):
    a, b = ready_student(client, "A"), ready_student(client, "B")
    client.post("/journal", headers=a, json={"text": "A's private diary"})
    client.post("/memory", headers=a, json={"category": "stable", "content": "A's private memory"})
    text = client.get("/research/my-data", headers=b).text
    assert "A's private" not in text and client.get("/research/my-data").status_code == 401


def test_my_log_shows_what_was_recommended_and_feedback(client):
    h = ready_student(client)
    log = client.get("/research/my-log", headers=h).json()
    assert log and all(x["algorithm_version"] and x["model_version"] and x["why"] for x in log)
    client.post(f"/careers/recommendations/{log[0]['id']}/feedback", headers=h,
                json={"helpful": True, "relevance": 4, "comment": "good"})
    again = client.get("/research/my-log", headers=h).json()
    assert again[0]["feedback"] == [{"helpful": True, "relevance": 4, "comment": "good"}] or any(x["feedback"] for x in again)
    assert len(client.get("/research/my-log?limit=1", headers=h).json()) == 1


# ============================================================ researcher export
def test_export_is_only_for_listed_researchers(client):
    h = ready_student(client)
    assert client.get("/research/export", headers=h).status_code == 403
    assert client.get("/research/export").status_code == 401


def test_export_contains_only_students_who_opted_in(client, monkeypatch):
    from app.services.research_service import pseudonym
    researcher = become_researcher(client, monkeypatch)
    yes, no = ready_student(client, "Yes"), ready_student(client, "No")
    opt_in(client, yes)
    p_researcher, p_yes, p_no = (pseudonym(my_id(client, x)) for x in (researcher, yes, no))

    def students():
        return {r["student"] for r in client.get("/research/export", headers=researcher).json()["rows"]}

    assert students() == {p_yes}                      # not the researcher, not the student who never opted in
    opt_in(client, researcher)
    assert students() == {p_yes, p_researcher} and p_no not in students()
    client.put("/research/consent", headers=yes, json={"consent": False})
    assert students() == {p_researcher}               # withdrawing consent removes the data from the export


def test_export_rows_have_everything_the_paper_needs(client, monkeypatch):
    h = become_researcher(client, monkeypatch)
    opt_in(client, h)
    log = client.get("/research/my-log", headers=h).json()
    client.post(f"/careers/recommendations/{log[0]['id']}/feedback", headers=h, json={"helpful": True, "relevance": 5, "comment": "SECRET COMMENT"})
    body = client.get("/research/export", headers=h).json()
    row = next(r for r in body["rows"] if r["recommendation_id"] == log[0]["id"])
    for field in ["recommendation_id", "created_at", "input_evidence", "algorithm_version", "model_version", "knowledge_base_version",
                  "target", "confidence", "explanation", "feedback", "target_role_now", "student"]:
        assert field in row
    assert row["feedback"][0]["helpful"] is True and row["feedback"][0]["relevance"] == 5
    assert row["target_role_now"] in {"primary", "secondary", "emerging", "none"}
    meta = body["metadata"]
    assert meta["algorithm_versions_in_database"] and "anonymisation" in meta and meta["consenting_students"] >= 1


def test_export_is_anonymous_and_leaks_no_free_text(client, monkeypatch):
    h = become_researcher(client, monkeypatch)
    opt_in(client, h)
    email = client.get("/auth/me", headers=h).json()["email"]
    client.post("/journal", headers=h, json={"text": "SECRET JOURNAL about python"})
    client.post("/reflections", headers=h, json={"enjoyed": "SECRET REFLECTION robots"})
    client.post("/mentor/chat", headers=h, json={"message": "SECRET CHAT question"})
    log = client.get("/research/my-log", headers=h).json()
    client.post(f"/careers/recommendations/{log[0]['id']}/feedback", headers=h, json={"helpful": False, "comment": "SECRET COMMENT"})
    client.post("/memory", headers=h, json={"category": "stable", "content": "SECRET MEMORY"})
    for dataset in ["recommendations", "career_history", "learning_preferences"]:
        for fmt in ["json", "csv"]:
            text = client.get(f"/research/export?dataset={dataset}&format={fmt}", headers=h).text
            assert "SECRET" not in text and email not in text and "Test Student" not in text and "Researcher" not in text
    uid = my_id(client, h)
    rows = client.get("/research/export", headers=h).json()["rows"]
    assert all(r["student"] != str(uid) and len(r["student"]) == 12 for r in rows)


def test_pseudonyms_are_stable_and_differ_between_students(client, monkeypatch):
    r = become_researcher(client, monkeypatch)
    other = ready_student(client, "Other")
    opt_in(client, r), opt_in(client, other)
    first = {x["student"] for x in client.get("/research/export", headers=r).json()["rows"]}
    second = {x["student"] for x in client.get("/research/export", headers=r).json()["rows"]}
    assert first == second and len(first) == 2


def test_export_csv_json_pagination_and_validation(client, monkeypatch):
    h = become_researcher(client, monkeypatch)
    opt_in(client, h)
    r = client.get("/research/export?format=csv", headers=h)
    assert r.headers["content-type"].startswith("text/csv") and "attachment" in r.headers["content-disposition"]
    rows = list(csv.DictReader(io.StringIO(r.text)))
    assert rows and "algorithm_version" in rows[0] and rows[0]["recommendation_id"].isdigit()
    page = client.get("/research/export?limit=1", headers=h).json()
    assert len(page["rows"]) == 1 and page["metadata"]["rows_in_dataset"] >= 1
    assert client.get("/research/export?dataset=emails", headers=h).status_code == 422
    assert client.get("/research/export?format=xml", headers=h).status_code == 422
    assert client.get("/research/export?limit=999999", headers=h).status_code == 422


def test_other_export_datasets(client, monkeypatch):
    h = become_researcher(client, monkeypatch)
    opt_in(client, h)
    course = client.get("/learning/resources", headers=h).json()[0]["id"]
    client.post(f"/learning/resources/{course}/feedback", headers=h, json={"status": "completed", "rating": 5})
    hist = client.get("/research/export?dataset=career_history", headers=h).json()["rows"]
    assert hist and {"student", "career", "role", "level", "at"} <= set(hist[0])
    prefs = client.get("/research/export?dataset=learning_preferences", headers=h).json()["rows"]
    assert prefs and {"student", "dimension", "value", "samples"} <= set(prefs[0])


def test_unlisted_email_cannot_become_a_researcher_by_changing_case_or_spaces(client, monkeypatch):
    h = ready_student(client)
    monkeypatch.setattr(settings, "researcher_emails", "  other@example.com ,")
    assert client.get("/research/export", headers=h).status_code == 403
    monkeypatch.setattr(settings, "researcher_emails", "")
    assert client.get("/research/export", headers=h).status_code == 403


def test_deleting_an_account_removes_its_phase3_data_too(client, db):
    h = ready_student(client)
    uid = my_id(client, h)
    client.post("/journal", headers=h, json={"text": "python diary"})
    client.post("/reflections", headers=h, json={"enjoyed": "robots"})
    client.post("/mentor/chat", headers=h, json={"message": "hello"})
    client.post("/roadmaps/generate", headers=h, json={"career_slug": "ai_ml_engineer"})
    client.post("/voice", headers=h, data={"transcript": "I enjoyed python"})
    assert client.delete("/profile", headers=h).status_code == 204
    for model in [m.JournalEntry, m.Reflection, m.MentorConversation, m.MentorMessage, m.Roadmap, m.VoiceEntry, m.Memory,
                  m.CareerEvidence, m.Recommendation]:
        assert db.query(model).filter_by(user_id=uid).count() == 0, model.__name__

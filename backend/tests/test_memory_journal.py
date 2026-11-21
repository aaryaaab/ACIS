import httpx
import pytest
from sqlalchemy import select

from app import models as m
from app.config import settings
from app.services import learning_model, speech
from tests.helpers import ready_student, signup


def snapshot_other_models(db, headers_user_id):
    prefs = sorted((p.dimension, p.value) for p in db.scalars(
        select(m.LearningPreference).where(m.LearningPreference.user_id == headers_user_id)))
    skills = sorted((s.skill_id, s.level) for s in db.scalars(
        select(m.StudentSkill).where(m.StudentSkill.user_id == headers_user_id)))
    return prefs, skills


def uid(client, headers):
    return client.get("/auth/me", headers=headers).json()["id"]


# =========================================================== memory
def test_all_four_memory_categories_with_required_fields(client):
    h = ready_student(client)
    for cat in ["stable", "evolving", "episodic", "temporary"]:
        r = client.post("/memory", headers=h, json={"category": cat, "content": f"a {cat} memory",
                                                     "tags": ["python"], "importance": 0.8})
        assert r.status_code == 201, r.text
        mem = r.json()
        for field in ["id", "category", "content", "source", "created_at", "confidence", "importance", "tags"]:
            assert field in mem
        assert (mem["expires_at"] is not None) == (cat == "temporary")
    counts = client.get("/memory/summary", headers=h).json()
    assert all(counts[c] >= 1 for c in ["stable", "evolving", "episodic", "temporary"])


def test_memory_validation(client):
    h = ready_student(client)
    assert client.post("/memory", headers=h, json={"category": "secret", "content": "x"}).status_code == 422
    assert client.post("/memory", headers=h, json={"category": "stable", "content": "   "}).status_code == 422
    assert client.post("/memory", headers=h, json={"category": "stable", "content": "x", "confidence": 1.5}).status_code == 422
    assert client.get("/memory?category=nope", headers=h).status_code == 422


def test_memory_list_filter_and_pagination(client):
    h = ready_student(client)
    for i in range(5):
        client.post("/memory", headers=h, json={"category": "episodic", "content": f"event {i}"})
    page = client.get("/memory?category=episodic&limit=2&offset=0", headers=h).json()
    assert len(page["items"]) == 2 and page["total"] >= 5
    assert all(x["category"] == "episodic" for x in page["items"])


def test_memory_edit_delete_and_category_is_fixed(client):
    h = ready_student(client)
    mid = client.post("/memory", headers=h, json={"category": "stable", "content": "likes maths"}).json()["id"]
    r = client.patch(f"/memory/{mid}", headers=h, json={"content": "loves maths", "importance": 0.9, "category": "temporary"})
    assert r.status_code == 200 and r.json()["content"] == "loves maths" and r.json()["category"] == "stable"
    assert client.delete(f"/memory/{mid}", headers=h).status_code == 204
    assert client.get(f"/memory/{mid}", headers=h).status_code == 404


def test_memory_belongs_only_to_its_owner(client):
    a, b = ready_student(client, "A"), ready_student(client, "B")
    mid = client.post("/memory", headers=a, json={"category": "stable", "content": "private fact"}).json()["id"]
    assert client.get(f"/memory/{mid}", headers=b).status_code == 404
    assert client.patch(f"/memory/{mid}", headers=b, json={"content": "hacked"}).status_code == 404
    assert client.delete(f"/memory/{mid}", headers=b).status_code == 404
    assert "private fact" not in client.get("/memory", headers=b).text
    assert "private fact" not in client.get("/memory/search?q=private", headers=b).text


def test_semantic_memory_search_ranks_relevant_first(client):
    h = ready_student(client)
    client.post("/memory", headers=h, json={"category": "stable", "content": "enjoys cooking and baking cakes"})
    client.post("/memory", headers=h, json={"category": "stable", "content": "built a line following robot with sensors"})
    top = client.get("/memory/search?q=robot sensors", headers=h).json()[0]
    assert "robot" in top["content"]


def test_expired_temporary_memories_disappear(client, db):
    h = ready_student(client)
    from datetime import datetime, timedelta
    db.add(m.Memory(user_id=uid(client, h), category="temporary", content="stale thing", source="test",
                    expires_at=datetime.utcnow() - timedelta(days=1)))
    db.flush()
    assert "stale thing" not in client.get("/memory", headers=h).text
    assert db.query(m.Memory).filter_by(content="stale thing").count() == 0


# =========================================================== journal
def evidence(db, user_id, prefix):
    return db.scalars(select(m.CareerEvidence).where(m.CareerEvidence.user_id == user_id,
                                                     m.CareerEvidence.note.like(prefix + "%"))).all()


def test_journal_entry_extracts_fields_and_adds_mild_evidence(client, db):
    h = ready_student(client)
    before = client.get("/careers/portfolio", headers=h).json()["primary"]["slug"]
    r = client.post("/journal", headers=h, json={"text": "I really enjoyed building a robot with an Arduino today."})
    assert r.status_code == 201
    body = r.json()
    assert "engineering" in body["detected"]["fields"] and body["career_evidence_added_for"]
    ev = evidence(db, uid(client, h), "journal:")
    assert ev and all(e.source_type == "journal" and e.direction == 1 for e in ev)
    assert client.get("/careers/portfolio", headers=h).json()["primary"]["slug"] == before   # one entry changes little


def test_negative_and_neutral_sentences(client, db):
    h = ready_student(client)
    user = uid(client, h)
    r = client.post("/journal", headers=h, json={"text": "I did not enjoy the physics lab. It was boring."}).json()
    assert r["career_evidence_added_for"]
    assert all(e.direction == -1 for e in evidence(db, user, "journal:"))
    n = db.query(m.CareerEvidence).filter_by(user_id=user).count()
    neutral = client.post("/journal", headers=h, json={"text": "Today I read about law."}).json()
    assert neutral["career_evidence_added_for"] == [] and db.query(m.CareerEvidence).filter_by(user_id=user).count() == n


def test_journal_does_not_read_moods_or_health(client, db):
    h = ready_student(client)
    r = client.post("/journal", headers=h, json={"text": "I felt anxious and depressed all week and could not sleep."}).json()
    assert r["detected"] == {"fields": [], "skills": []} and r["career_evidence_added_for"] == []
    assert "extracted" not in r and "mood" not in str(r).lower()


def test_journal_never_changes_learning_or_growth_models(client, db):
    h = ready_student(client)
    user = uid(client, h)
    before = snapshot_other_models(db, user)
    client.post("/journal", headers=h, json={"text": "I enjoyed learning python and machine learning. Coding is fun."})
    assert snapshot_other_models(db, user) == before


def test_journal_creates_episodic_memory_without_copying_the_text(client):
    h = ready_student(client)
    client.post("/journal", headers=h, json={"text": "Secret thought: I loved writing a python script."})
    mems = client.get("/memory?category=episodic", headers=h).json()["items"]
    assert any("journal entry" in x["content"] for x in mems)
    assert "Secret thought" not in str(mems)


def test_deleting_a_journal_entry_removes_what_it_created(client, db):
    h = ready_student(client)
    user = uid(client, h)
    e = client.post("/journal", headers=h, json={"text": "I loved building a robot."}).json()
    assert evidence(db, user, f"journal:{e['id']}")
    assert client.delete(f"/journal/{e['id']}", headers=h).status_code == 204
    assert not evidence(db, user, f"journal:{e['id']}")
    assert db.query(m.Memory).filter_by(user_id=user, source=f"journal:{e['id']}").count() == 0
    assert client.get(f"/journal/{e['id']}", headers=h).status_code == 404


def test_journals_are_private(client):
    a, b = ready_student(client, "A"), ready_student(client, "B")
    e = client.post("/journal", headers=a, json={"text": "My private diary about python."}).json()
    assert client.get(f"/journal/{e['id']}", headers=b).status_code == 404
    assert client.delete(f"/journal/{e['id']}", headers=b).status_code == 404
    assert "private diary" not in client.get("/journal", headers=b).text
    assert "private diary" not in client.get("/journal/search?q=diary", headers=b).text
    assert client.get("/journal").status_code == 401


def test_journal_validation_and_search(client):
    h = ready_student(client)
    assert client.post("/journal", headers=h, json={"text": "   "}).status_code == 422
    assert client.post("/journal", headers=h, json={"text": "x" * 5001}).status_code == 422
    client.post("/journal", headers=h, json={"text": "Visited a hospital and met a doctor."})
    client.post("/journal", headers=h, json={"text": "Debugging my website code all evening."})
    assert "website" in client.get("/journal/search?q=website code", headers=h).json()[0]["text"]
    page = client.get("/journal?limit=1", headers=h).json()
    assert len(page["items"]) == 1 and page["total"] == 2


def test_journal_needs_onboarding(client):
    headers, _ = signup(client)
    assert client.post("/journal", headers=headers, json={"text": "hello python"}).status_code == 404


# =========================================================== reflections
def test_reflection_prompt_due_then_not_due(client):
    h = ready_student(client)
    p = client.get("/reflections/prompt", headers=h).json()
    assert p["due"] is True and len(p["prompts"]) == 4
    client.post("/reflections", headers=h, json={"enjoyed": "the python project"})
    p = client.get("/reflections/prompt", headers=h).json()
    assert p["due"] is False and p["next_due_in_days"] == 14


def test_reflection_prompt_mentions_a_recently_finished_project(client):
    h = ready_student(client)
    pid = client.post("/growth/projects", headers=h, json={"title": "Weather app", "skill_slugs": ["python"]}).json()["id"]
    client.post(f"/growth/projects/{pid}/complete", headers=h)
    prompts = client.get("/reflections/prompt", headers=h).json()["prompts"]
    assert "Weather app" in prompts[0]["question"]


def test_reflection_is_stored_structurally_and_gives_gentle_evidence(client, db):
    h = ready_student(client)
    user = uid(client, h)
    before = client.get("/careers/portfolio", headers=h).json()
    scores_before = {s.career_id: s.score for s in db.scalars(select(m.CareerScore).where(m.CareerScore.user_id == user))}
    r = client.post("/reflections", headers=h, json={
        "enjoyed": "Building the robot was great", "disliked": "The long law lectures were boring",
        "surprised": "I liked debugging", "interests_changed": "unsure",
        "related_careers": [{"slug": "robotics_engineer", "feeling": "enjoyed"}]})
    assert r.status_code == 201, r.text
    assert "robotics_engineer" in r.json()["career_evidence_added_for"]
    ev = evidence(db, user, "reflection:")
    assert ev and all(e.source_type == "reflection" for e in ev)
    scores_after = {s.career_id: s.score for s in db.scalars(select(m.CareerScore).where(m.CareerScore.user_id == user))}
    assert max(abs(scores_after[k] - scores_before[k]) for k in scores_before) <= 0.05 + 1e-9
    assert client.get("/careers/portfolio", headers=h).json()["primary"] == before["primary"]


def test_explicit_career_mention_beats_text_inference(client, db):
    h = ready_student(client)
    client.post("/reflections", headers=h, json={
        "enjoyed": "I loved coding", "related_careers": [{"slug": "software_engineer", "feeling": "disliked"}]})
    sw = db.scalars(select(m.Career.id).where(m.Career.slug == "software_engineer")).one()
    rows = [e for e in evidence(db, uid(client, h), "reflection:") if e.career_id == sw]
    assert len(rows) == 1 and rows[0].direction == -1 and rows[0].strength == 0.6


def test_reflection_validation(client):
    h = ready_student(client)
    assert client.post("/reflections", headers=h, json={}).status_code == 422
    assert client.post("/reflections", headers=h, json={"enjoyed": "x", "interests_changed": "maybe"}).status_code == 422
    bad = client.post("/reflections", headers=h, json={"enjoyed": "x", "related_careers": [{"slug": "astronaut", "feeling": "enjoyed"}]})
    assert bad.status_code == 422 and "astronaut" in bad.text


def test_interest_change_creates_an_evolving_memory(client):
    h = ready_student(client)
    client.post("/reflections", headers=h, json={"surprised": "I now like design", "interests_changed": "yes"})
    mems = client.get("/memory?category=evolving", headers=h).json()["items"]
    assert any("interests have changed" in x["content"] for x in mems)


def test_reflection_never_changes_learning_or_growth(client, db):
    h = ready_student(client)
    user = uid(client, h)
    before = snapshot_other_models(db, user)
    client.post("/reflections", headers=h, json={"enjoyed": "learning python", "disliked": "long theory videos about physics"})
    assert snapshot_other_models(db, user) == before


def test_delete_reflection_and_ownership(client, db):
    a, b = ready_student(client, "A"), ready_student(client, "B")
    r = client.post("/reflections", headers=a, json={"enjoyed": "robots", "related_careers": [{"slug": "robotics_engineer", "feeling": "enjoyed"}]}).json()
    assert client.delete(f"/reflections/{r['id']}", headers=b).status_code == 404
    assert client.get("/reflections", headers=b).json()["total"] == 0
    assert client.delete(f"/reflections/{r['id']}", headers=a).status_code == 204
    assert not evidence(db, uid(client, a), f"reflection:{r['id']}")


# =========================================================== voice
def stt_mock(monkeypatch, handler):
    monkeypatch.setattr(settings, "stt_provider", "openai_compatible")
    monkeypatch.setattr(settings, "stt_base_url", "http://stt.test/v1")
    monkeypatch.setattr(settings, "stt_api_key", "secret-key")
    monkeypatch.setattr(speech, "http_client", lambda: httpx.Client(transport=httpx.MockTransport(handler)))


def test_voice_transcript_works_without_any_speech_service(client, db):
    h = ready_student(client)
    assert client.get("/voice/status", headers=h).json()["speech_to_text"] is False
    r = client.post("/voice", headers=h, data={"transcript": "I enjoyed my robotics club today"})
    assert r.status_code == 201 and r.json()["audio_stored"] is False
    assert db.query(m.VoiceEntry).filter_by(user_id=uid(client, h)).count() == 1
    assert client.get("/journal", headers=h).json()["total"] == 1
    assert client.get("/voice", headers=h).json()[0]["transcript"].startswith("I enjoyed")


def test_voice_audio_without_stt_configured_is_a_clear_501(client):
    h = ready_student(client)
    r = client.post("/voice", headers=h, files={"audio": ("a.webm", b"abc", "audio/webm")})
    assert r.status_code == 501 and "transcript" in r.json()["detail"]


def test_voice_audio_is_transcribed_by_the_configured_service(client, monkeypatch):
    seen = {}

    def handler(request: httpx.Request):
        seen["url"], seen["auth"] = str(request.url), request.headers.get("authorization")
        return httpx.Response(200, json={"text": "I loved the python workshop"})

    stt_mock(monkeypatch, handler)
    h = ready_student(client)
    r = client.post("/voice", headers=h, files={"audio": ("a.webm", b"fake-audio", "audio/webm")})
    assert r.status_code == 201 and r.json()["transcript"] == "I loved the python workshop"
    assert seen["url"] == "http://stt.test/v1/audio/transcriptions" and seen["auth"] == "Bearer secret-key"
    assert "technology" in r.json()["detected"]["fields"]


def test_voice_input_validation(client, monkeypatch):
    stt_mock(monkeypatch, lambda req: httpx.Response(200, json={"text": "hi"}))
    h = ready_student(client)
    assert client.post("/voice", headers=h).status_code == 422                                   # neither
    both = client.post("/voice", headers=h, data={"transcript": "hi"}, files={"audio": ("a.webm", b"x", "audio/webm")})
    assert both.status_code == 422
    assert client.post("/voice", headers=h, files={"audio": ("a.txt", b"x", "text/plain")}).status_code == 415
    monkeypatch.setattr(speech, "MAX_AUDIO_BYTES", 10)
    assert client.post("/voice", headers=h, files={"audio": ("a.webm", b"x" * 50, "audio/webm")}).status_code == 413


def test_voice_provider_failures_become_502_not_500(client, monkeypatch):
    h = ready_student(client)
    stt_mock(monkeypatch, lambda req: httpx.Response(500))
    assert client.post("/voice", headers=h, files={"audio": ("a.webm", b"x", "audio/webm")}).status_code == 502
    stt_mock(monkeypatch, lambda req: httpx.Response(200, json={"text": "  "}))
    assert client.post("/voice", headers=h, files={"audio": ("a.webm", b"x", "audio/webm")}).status_code == 502


def test_voice_is_private_and_needs_login(client):
    a, b = ready_student(client, "A"), ready_student(client, "B")
    client.post("/voice", headers=a, data={"transcript": "my private voice note about python"})
    assert client.get("/voice", headers=b).json() == []
    assert client.get("/voice").status_code == 401 and client.post("/voice", data={"transcript": "x"}).status_code == 401

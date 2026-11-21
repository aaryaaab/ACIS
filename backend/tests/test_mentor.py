import httpx
import pytest
from sqlalchemy import select

from app import models as m
from app.config import settings
from app.services import llm
from tests.helpers import explore_student, my_id, ready_student
from tests.test_model_separation import snapshot_career
from tests.test_memory_journal import snapshot_other_models


def chat(client, h, message, conversation_id=None):
    body = {"message": message}
    if conversation_id:
        body["conversation_id"] = conversation_id
    r = client.post("/mentor/chat", headers=h, json=body)
    assert r.status_code == 200, r.text
    return r.json()


def llm_on(monkeypatch, handler, provider="openai_compatible"):
    monkeypatch.setattr(settings, "llm_provider", provider)
    monkeypatch.setattr(settings, "llm_base_url", "http://llm.test/v1" if provider != "ollama" else "http://llm.test")
    monkeypatch.setattr(settings, "llm_model", "test-model")
    monkeypatch.setattr(settings, "llm_api_key", "k-123")
    monkeypatch.setattr(llm, "http_client", lambda: httpx.Client(transport=httpx.MockTransport(handler)))


# ------------------------------------------------------------ works with no API key
def test_mentor_works_without_any_api_key(client):
    h = ready_student(client)
    st = client.get("/mentor/status", headers=h).json()
    assert st["mode"] == "rule_based"
    r = chat(client, h, "hello")
    assert r["mode"] == "rule_based" and r["reply"]["llm_used"] is False and r["reply"]["content"]


def test_conversation_history_is_saved_and_continued(client):
    h = ready_student(client)
    first = chat(client, h, "hello there")
    cid = first["conversation_id"]
    chat(client, h, "what projects can I build?", cid)
    conv = client.get(f"/mentor/conversations/{cid}", headers=h).json()
    assert [x["role"] for x in conv["messages"]] == ["user", "mentor", "user", "mentor"]
    assert conv["title"] == "hello there"
    listing = client.get("/mentor/conversations", headers=h).json()
    assert listing["total"] == 1 and listing["items"][0]["id"] == cid
    assert client.delete(f"/mentor/conversations/{cid}", headers=h).status_code == 204
    assert client.get(f"/mentor/conversations/{cid}", headers=h).status_code == 404


def test_conversations_are_private(client):
    a, b = ready_student(client, "A"), ready_student(client, "B")
    cid = chat(client, a, "my secret question about python")["conversation_id"]
    assert client.get(f"/mentor/conversations/{cid}", headers=b).status_code == 404
    assert client.delete(f"/mentor/conversations/{cid}", headers=b).status_code == 404
    assert client.post("/mentor/chat", headers=b, json={"message": "hi", "conversation_id": cid}).status_code == 404
    assert "secret question" not in client.get("/mentor/conversations", headers=b).text
    assert client.post("/mentor/chat", json={"message": "hi"}).status_code == 401


def test_chat_validation(client):
    h = ready_student(client)
    assert client.post("/mentor/chat", headers=h, json={"message": "   "}).status_code == 422
    assert client.post("/mentor/chat", headers=h, json={"message": "x" * 2001}).status_code == 422
    assert client.post("/mentor/chat", headers=h, json={}).status_code == 422


def test_mentor_needs_onboarding(client):
    from tests.helpers import signup
    headers, _ = signup(client)
    assert client.post("/mentor/chat", headers=headers, json={"message": "hi"}).status_code == 404


# ------------------------------------------------------------ the kinds of help
def test_career_comparison_is_balanced_and_sourced(client):
    h = ready_student(client)
    r = chat(client, h, "Can you compare software engineer and UX designer for me?")["reply"]
    assert r["intent"] == "compare"
    assert "Software Engineer" in r["content"] and "UI / UX Designer" in r["content"]
    assert "not a verdict" in r["content"] and "Skills you would still build" in r["content"]
    assert any(s["type"] == "career_knowledge_base" for s in r["sources"])


def test_comparison_with_one_career_compares_against_current_direction(client):
    h = ready_student(client)
    r = chat(client, h, "how does lawyer compare for me?")["reply"]["content"]
    assert "Lawyer" in r and "Moderate" in r or "Emerging" in r
    asked = chat(client, h, "compare careers")["reply"]["content"]
    assert asked.startswith("Which two careers")


def test_why_explains_evidence_and_what_could_change(client):
    h = ready_student(client)
    r = chat(client, h, "Why did you recommend this career to me?")["reply"]
    assert r["intent"] == "why" and "What could change it" in r["content"] and "None of this is a prediction" in r["content"]
    assert "guarantee" not in r["content"].lower()


def test_learning_help_uses_skill_gaps_and_flags_unverified_links(client):
    h = ready_student(client)
    r = chat(client, h, "What should I learn for AI engineer?")["reply"]
    assert r["intent"] == "learn" and "biggest gap" in r["content"]
    assert "link not verified yet" in r["content"]


def test_project_suggestions(client):
    h = ready_student(client)
    r = chat(client, h, "Give me project ideas for data scientist")["reply"]
    assert r["intent"] == "projects" and "level" in r["content"]


def test_adult_who_is_unsure_is_not_told_what_to_be(client):
    h = ready_student(client)
    text = chat(client, h, "I'm confused, which career should I choose?")["reply"]["content"]
    assert "starting point" in text and "not a decision" in text and "?" in text
    assert "you should become" not in text.lower() and "you must" not in text.lower()


def test_explore_stage_student_is_never_given_a_recommendation(client):
    h = explore_student(client)
    text = chat(client, h, "What should I become?")["reply"]["content"]
    assert "will not pick a career for you" in text and "do not need to decide now" in text
    assert "strongest direction looks like" not in text


def test_opportunities_are_never_invented(client):
    h = ready_student(client)
    r = chat(client, h, "Any internships or scholarships for me?")["reply"]
    assert r["intent"] == "opportunities" and "won't guess or make any up" in r["content"] and r["sources"] == []


def test_opportunity_answers_come_only_from_verified_saved_rows(client, db):
    from datetime import date, timedelta
    h = ready_student(client)
    src = m.Source(name="Fixture Provider", url="https://example.org")
    db.add(src); db.flush()
    db.add(m.Opportunity(title="TEST FIXTURE hackathon", kind="hackathon", provider="Fixture Provider", eligibility="Test only",
                         deadline=date.today() + timedelta(days=10), url="https://example.org/hack",
                         verified_on=date.today(), career_slugs=["software_engineer", "ai_ml_engineer"], source_id=src.id))
    db.flush()
    r = chat(client, h, "any hackathon for me?")["reply"]
    assert "TEST FIXTURE hackathon" in r["content"] and "https://example.org/hack" in r["content"]
    assert "confirm" in r["content"].lower() or "re-check" in r["content"].lower()
    assert r["sources"][0]["url"] == "https://example.org/hack"


def test_market_questions_without_data_are_honest(client):
    h = ready_student(client)
    r = chat(client, h, "what are the latest trends in AI?")["reply"]
    assert r["intent"] == "intelligence" and "without guessing" in r["content"]


def test_market_answers_cite_source_and_retrieval_date(client, db):
    from datetime import date
    h = ready_student(client)
    src = m.Source(name="Fixture Feed", url="https://example.org/feed")
    db.add(src); db.flush()
    db.add(m.MarketUpdate(title="TEST FIXTURE update", summary="s", url="https://example.org/a", career_slugs=["ai_ml_engineer"],
                          retrieved_on=date(2026, 11, 1), source_id=src.id))
    db.flush()
    r = chat(client, h, "any news for AI engineer?")["reply"]["content"]
    assert "TEST FIXTURE update" in r and "Fixture Feed" in r and "2026-11-01" in r


def test_memory_recall_shows_what_it_knows_and_how_to_remove_it(client):
    h = ready_student(client)
    client.post("/memory", headers=h, json={"category": "stable", "content": "Wants to build medical devices"})
    r = chat(client, h, "What do you remember about me?")["reply"]["content"]
    assert "Wants to build medical devices" in r and "edit or delete" in r


def test_mentor_remembers_recent_topics_as_temporary_memory(client):
    h = ready_student(client)
    chat(client, h, "compare software engineer and lawyer")
    temp = client.get("/memory?category=temporary", headers=h).json()["items"]
    assert any("Recently asked the mentor about: compare" in x["content"] for x in temp)
    chat(client, h, "compare software engineer and lawyer")
    temp = client.get("/memory?category=temporary", headers=h).json()["items"]
    assert len([x for x in temp if "about: compare" in x["content"]]) == 1          # not duplicated


# ------------------------------------------------------------ safety
def test_distress_gets_a_safe_reply_with_verified_helpline_and_no_career_advice(client, monkeypatch):
    def must_not_be_called(request):
        raise AssertionError("the LLM must never handle a safety message")
    llm_on(monkeypatch, must_not_be_called)
    h = ready_student(client)
    r = chat(client, h, "I feel like I want to die")["reply"]
    assert r["intent"] == "support" and r["llm_used"] is False
    assert "14416" in r["content"] and "112" in r["content"] and "Tele-MANAS" in r["content"]
    assert not any(n in r["content"] for n in ["Software Engineer", "Data Scientist", "AI / Machine", "strongest direction"])


# ------------------------------------------------------------ the mentor cannot change the three models
def test_chatting_never_changes_career_learning_or_growth_models(client, db):
    h = ready_student(client)
    uid = my_id(client, h)
    career_before, other_before = snapshot_career(db, uid), snapshot_other_models(db, uid)
    for msg in ["compare software engineer and lawyer", "why did you recommend this?", "I think I hate AI now",
                "what should I learn?", "I'm so confused about my career", "any internships?", "what projects?"]:
        chat(client, h, msg)
    assert snapshot_career(db, uid) == career_before
    assert snapshot_other_models(db, uid) == other_before


# ------------------------------------------------------------ optional LLM
def test_llm_is_used_when_configured_and_gets_only_this_students_facts(client, db, monkeypatch):
    seen = {}

    def handler(request: httpx.Request):
        import json
        seen["url"], seen["auth"], seen["body"] = str(request.url), request.headers.get("authorization"), json.loads(request.content)
        return httpx.Response(200, json={"choices": [{"message": {"content": "Here is a friendly answer."}}]})

    llm_on(monkeypatch, handler)
    other = ready_student(client, "Other")
    client.post("/memory", headers=other, json={"category": "stable", "content": "OTHER STUDENT SECRET"})
    h = ready_student(client)
    client.post("/memory", headers=h, json={"category": "stable", "content": "I like robotics a lot"})
    r = chat(client, h, "tell me about robotics")
    assert r["mode"] == "llm" and r["reply"]["content"] == "Here is a friendly answer." and r["reply"]["llm_used"] is True
    assert seen["url"] == "http://llm.test/v1/chat/completions" and seen["auth"] == "Bearer k-123"
    msgs = seen["body"]["messages"]
    assert msgs[0]["role"] == "system" and "FACTS" in msgs[0]["content"] and "Never invent opportunities" in msgs[0]["content"]
    assert msgs[-1] == {"role": "user", "content": "tell me about robotics"}
    assert "OTHER STUDENT SECRET" not in str(seen["body"])
    assert client.get("/mentor/status", headers=h).json()["mode"] == "llm"


def test_ollama_request_format(client, monkeypatch):
    seen = {}

    def handler(request: httpx.Request):
        import json
        seen["url"], seen["body"] = str(request.url), json.loads(request.content)
        return httpx.Response(200, json={"message": {"content": "Local model answer"}})

    llm_on(monkeypatch, handler, provider="ollama")
    h = ready_student(client)
    r = chat(client, h, "hello")
    assert r["reply"]["content"] == "Local model answer"
    assert seen["url"] == "http://llm.test/api/chat" and seen["body"]["stream"] is False


def test_conversation_history_is_sent_to_the_llm(client, monkeypatch):
    bodies = []

    def handler(request):
        import json
        bodies.append(json.loads(request.content))
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})

    llm_on(monkeypatch, handler)
    h = ready_student(client)
    cid = chat(client, h, "first question")["conversation_id"]
    chat(client, h, "second question", cid)
    sent = [x["content"] for x in bodies[1]["messages"]]
    assert "first question" in sent and "second question" in sent


def test_llm_failure_falls_back_to_the_rule_based_answer(client, monkeypatch):
    llm_on(monkeypatch, lambda request: httpx.Response(500))
    h = ready_student(client)
    r = chat(client, h, "compare software engineer and lawyer")
    assert r["mode"] == "rule_based" and r["reply"]["llm_used"] is False and r["fallback_reason"]
    assert "not a verdict" in r["reply"]["content"]


def test_llm_replies_that_make_promises_are_rejected(client, monkeypatch):
    llm_on(monkeypatch, lambda request: httpx.Response(200, json={"choices": [{"message": {"content": "I guarantee you will get a job!"}}]}))
    h = ready_student(client)
    r = chat(client, h, "compare software engineer and lawyer")
    assert r["mode"] == "rule_based" and "guarantee" not in r["reply"]["content"].lower()


def test_half_configured_llm_is_ignored(client, monkeypatch):
    monkeypatch.setattr(settings, "llm_provider", "openai_compatible")
    monkeypatch.setattr(settings, "llm_model", "")
    h = ready_student(client)
    assert client.get("/mentor/status", headers=h).json()["mode"] == "rule_based"
    assert chat(client, h, "hello")["mode"] == "rule_based"

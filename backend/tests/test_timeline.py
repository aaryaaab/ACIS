from datetime import date, timedelta

from tests.helpers import explore_student, ready_student


def test_timeline_tells_the_story_in_order(client):
    h = ready_student(client)
    pid = client.post("/growth/projects", headers=h, json={"title": "Spam classifier", "skill_slugs": ["python"]}).json()["id"]
    client.post(f"/growth/projects/{pid}/complete", headers=h)
    client.post("/journal", headers=h, json={"text": "I loved building the classifier in python."})
    client.post("/reflections", headers=h, json={"enjoyed": "machine learning", "interests_changed": "yes"})
    client.post("/growth/achievements", headers=h, json={"kind": "competition", "title": "College hackathon"})
    body = client.get("/timeline", headers=h).json()
    kinds = {e["type"] for e in body["events"]}
    assert {"assessment", "career", "project", "journal", "reflection", "achievement", "skill"} <= kinds
    titles = " | ".join(e["title"] for e in body["events"])
    assert "Completed project: Spam classifier" in titles and "Competition: College hackathon" in titles
    times = [e["at"] for e in body["events"]]
    assert times == sorted(times, reverse=True)
    assert all(e["month"] == e["at"][:7] for e in body["events"])


def test_timeline_never_leaks_journal_text(client):
    h = ready_student(client)
    client.post("/journal", headers=h, json={"text": "Private sentence about python that nobody should see."})
    text = client.get("/timeline", headers=h).text
    assert "Private sentence" not in text and "Wrote a journal entry" in text


def test_timeline_shows_career_changes_with_confidence(client):
    h = ready_student(client)
    events = client.get("/timeline?types=career", headers=h).json()["events"]
    assert events and all(e["type"] == "career" for e in events)
    assert any("primary direction" in e["title"] for e in events)
    assert all("Confidence:" in e["detail"] for e in events)


def test_timeline_filters_and_validation(client):
    h = ready_student(client)
    assert client.get("/timeline?types=banana", headers=h).status_code == 422
    assert client.get("/timeline?from=2026-02-01&to=2026-01-01", headers=h).status_code == 422
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    assert client.get(f"/timeline?from={tomorrow}", headers=h).json()["total"] == 0
    today = date.today().isoformat()
    assert client.get(f"/timeline?from={today}&to={today}", headers=h).json()["total"] > 0
    assert client.get("/timeline?limit=0", headers=h).status_code == 422


def test_timeline_pagination_and_month_grouping(client):
    h = ready_student(client)
    for i in range(3):
        client.post("/journal", headers=h, json={"text": f"Entry {i} about python."})
    full = client.get("/timeline?limit=200", headers=h).json()
    page = client.get("/timeline?limit=2&offset=1", headers=h).json()
    assert page["total"] == full["total"] and len(page["events"]) == 2
    assert page["events"][0] == full["events"][1]
    grouped = client.get("/timeline?group=month", headers=h).json()
    assert grouped["months"] and grouped["months"][0]["events"]
    assert client.get("/timeline?group=year", headers=h).status_code == 422


def test_timeline_is_private_and_needs_login(client):
    a, b = ready_student(client, "A"), ready_student(client, "B")
    client.post("/growth/projects", headers=a, json={"title": "Only A has this project"})
    assert "Only A has this project" not in client.get("/timeline", headers=b).text
    assert client.get("/timeline").status_code == 401


def test_timeline_for_a_new_account_is_empty_not_an_error(client):
    from tests.helpers import signup
    headers, _ = signup(client)
    assert client.get("/timeline", headers=headers).json() == {"total": 0, "events": []}


def test_explore_student_timeline_has_no_primary_direction(client):
    h = explore_student(client)
    events = client.get("/timeline?types=career", headers=h).json()["events"]
    assert events and not any("primary direction" in e["title"] for e in events)

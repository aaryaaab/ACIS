from sqlalchemy import select

from app import models as m
from tests.helpers import explore_student, my_id, ready_student
from tests.test_memory_journal import snapshot_other_models
from tests.test_model_separation import snapshot_career


def generate(client, h, career="ai_ml_engineer", **extra):
    r = client.post("/roadmaps/generate", headers=h, json={"career_slug": career, **extra})
    assert r.status_code == 201, r.text
    return r.json()


def test_roadmap_is_built_from_skill_gaps_in_a_sensible_order(client):
    h = ready_student(client)
    road = generate(client, h)
    kinds = [i["kind"] for i in road["items"]]
    assert kinds[0] == "skill" and {"skill", "resource", "project"} <= set(kinds)
    assert [i["position"] for i in road["items"]] == list(range(len(road["items"])))
    assert road["progress"] == {"done": 0, "total": len(kinds), "percent": 0}
    assert road["career"]["slug"] == "ai_ml_engineer" and road["active"] is True
    skills = [i for i in road["items"] if i["kind"] == "skill"]
    assert all(s["current_level"] == 0 and s["required_level"] >= 1 for s in skills)
    resources = [i for i in road["items"] if i["kind"] == "resource"]
    assert resources and all(r["url"].startswith("http") for r in resources)
    assert len({r["ref_id"] for r in resources}) == len(resources)               # no duplicate resources


def test_first_project_is_the_easiest_available(client):
    h = ready_student(client)
    road = generate(client, h)
    projects = [i for i in road["items"] if i["kind"] == "project"]
    assert projects and projects[0]["difficulty"] == 1                 # beginner at every skill: start easy


def test_custom_title_and_regenerating_replaces_the_active_roadmap(client):
    h = ready_student(client)
    first = generate(client, h, title="My AI plan")
    assert first["title"] == "My AI plan"
    second = generate(client, h)
    roads = client.get("/roadmaps", headers=h).json()
    assert len(roads) == 2 and [r["active"] for r in roads] == [True, False]
    assert len(client.get("/roadmaps?active_only=true", headers=h).json()) == 1
    assert second["title"] == "Roadmap to AI / Machine Learning Engineer"


def test_roadmap_progress_follows_real_skill_progress(client):
    h = ready_student(client)
    road = generate(client, h)
    skill_item = next(i for i in road["items"] if i["kind"] == "skill")
    slug = next(s["slug"] for s in client.get("/growth/skills/catalogue", headers=h).json() if s["name"] == skill_item["skill"])
    client.put("/growth/skills", headers=h, json={"skill_slug": slug, "level": 5})
    after = client.get(f"/roadmaps/{road['id']}", headers=h).json()
    item = next(i for i in after["items"] if i["id"] == skill_item["id"])
    assert item["auto_done"] is True and item["done"] is False and item["effective_done"] is True
    assert after["progress"]["done"] >= 1


def test_ticking_an_item_updates_progress_and_can_be_undone(client):
    h = ready_student(client)
    road = generate(client, h)
    item = next(i for i in road["items"] if i["kind"] == "skill")
    r = client.patch(f"/roadmaps/{road['id']}/items/{item['id']}", headers=h, json={"done": True}).json()
    assert r["progress"]["done"] == 1 and r["progress"]["percent"] == round(100 / r["progress"]["total"])
    r = client.patch(f"/roadmaps/{road['id']}/items/{item['id']}", headers=h, json={"done": False}).json()
    assert r["progress"]["done"] == 0


def test_ticking_a_resource_is_a_learning_event_only(client, db):
    h = ready_student(client)
    uid = my_id(client, h)
    road = generate(client, h)
    career_before = snapshot_career(db, uid)
    prefs_before = client.get("/learning/preferences", headers=h).json()
    res = next(i for i in road["items"] if i["kind"] == "resource")
    client.patch(f"/roadmaps/{road['id']}/items/{res['id']}", headers=h, json={"done": True})
    fb = db.scalars(select(m.ResourceFeedback).where(m.ResourceFeedback.user_id == uid,
                                                     m.ResourceFeedback.resource_id == res["ref_id"])).all()
    assert [f.status for f in fb] == ["completed"]
    assert client.get("/learning/preferences", headers=h).json() != prefs_before          # learning model learned
    assert snapshot_career(db, uid) == career_before                                       # career model did not
    # ticking again must not double-count
    client.patch(f"/roadmaps/{road['id']}/items/{res['id']}", headers=h, json={"done": False})
    client.patch(f"/roadmaps/{road['id']}/items/{res['id']}", headers=h, json={"done": True})
    assert db.query(m.ResourceFeedback).filter_by(user_id=uid, resource_id=res["ref_id"]).count() == 1
    # the completed resource no longer shows up in the next roadmap
    new = generate(client, h)
    assert res["ref_id"] not in [i["ref_id"] for i in new["items"] if i["kind"] == "resource"]


def test_finishing_a_project_marks_its_roadmap_item_done_automatically(client):
    h = ready_student(client)
    road = generate(client, h)
    proj = next(i for i in road["items"] if i["kind"] == "project")
    pid = client.post("/growth/projects", headers=h, json={"title": proj["title"], "idea_id": proj["ref_id"]}).json()["id"]
    client.post(f"/growth/projects/{pid}/complete", headers=h)
    after = client.get(f"/roadmaps/{road['id']}", headers=h).json()
    assert next(i for i in after["items"] if i["id"] == proj["id"])["auto_done"] is True


def test_generating_a_roadmap_changes_no_model_and_logs_recommendations(client, db):
    h = ready_student(client)
    uid = my_id(client, h)
    career_before, other_before = snapshot_career(db, uid), snapshot_other_models(db, uid)
    road = generate(client, h)
    assert snapshot_career(db, uid) == career_before and snapshot_other_models(db, uid) == other_before
    recs = db.scalars(select(m.Recommendation).where(m.Recommendation.user_id == uid, m.Recommendation.kind.in_(["resource", "project"]))).all()
    assert len(recs) == len(road["recommendation_ids"]) > 0
    r = recs[0]
    assert r.algorithm_version and r.model_version and r.explanation and r.input_evidence["roadmap_id"] == road["id"]
    # student feedback on a roadmap pick is stored for research, and does not touch the career model
    rid = road["recommendation_ids"][0]["recommendation_id"]
    assert client.post(f"/careers/recommendations/{rid}/feedback", headers=h, json={"helpful": False}).status_code == 201
    assert snapshot_career(db, uid) == career_before


def test_roadmap_validation_and_stage_rules(client):
    h = ready_student(client)
    assert client.post("/roadmaps/generate", headers=h, json={"career_slug": "astronaut"}).status_code == 404
    assert client.post("/roadmaps/generate", headers=h, json={}).status_code == 422
    young = explore_student(client)
    r = client.post("/roadmaps/generate", headers=young, json={"career_slug": "software_engineer"})
    assert r.status_code == 409 and "Explore" in r.json()["detail"]


def test_nothing_to_plan_when_every_skill_is_already_met(client):
    h = ready_student(client)
    gap = client.get("/careers/ai_ml_engineer/skill-gap", headers=h).json()["skills"]
    for g in gap:
        client.put("/growth/skills", headers=h, json={"skill_slug": g["slug"], "level": 5})
    r = client.post("/roadmaps/generate", headers=h, json={"career_slug": "ai_ml_engineer"})
    assert r.status_code == 409 and "nothing to plan" in r.json()["detail"]


def test_roadmaps_are_private(client):
    a, b = ready_student(client, "A"), ready_student(client, "B")
    road = generate(client, a)
    item = road["items"][0]
    assert client.get(f"/roadmaps/{road['id']}", headers=b).status_code == 404
    assert client.patch(f"/roadmaps/{road['id']}/items/{item['id']}", headers=b, json={"done": True}).status_code == 404
    assert client.delete(f"/roadmaps/{road['id']}", headers=b).status_code == 404
    assert client.get("/roadmaps", headers=b).json() == []
    # an item id from another roadmap cannot be used through your own roadmap id
    mine = generate(client, b)
    assert client.patch(f"/roadmaps/{mine['id']}/items/{item['id']}", headers=b, json={"done": True}).status_code == 404
    assert client.get("/roadmaps").status_code == 401


def test_delete_roadmap(client):
    h = ready_student(client)
    road = generate(client, h)
    assert client.delete(f"/roadmaps/{road['id']}", headers=h).status_code == 204
    assert client.get(f"/roadmaps/{road['id']}", headers=h).status_code == 404

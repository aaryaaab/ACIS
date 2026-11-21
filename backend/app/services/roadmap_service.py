"""
Learning roadmaps. A roadmap is built from the student's skill gaps for one career: for each missing
skill it adds the skill itself, the best-fitting resource and the easiest project that practises it.

It READS the skills (growth) and learning preferences (learning) and WRITES only roadmap tables.
"""
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app import models as m
from app.services import recommenders
from app.services.skill_gap import skill_gap

MAX_SKILLS = 6


def build(db: Session, user_id: int, career: m.Career, title: str | None = None) -> tuple[m.Roadmap | None, list[dict]]:
    """Returns (roadmap, notes). notes explain each resource/project pick so it can be logged."""
    gaps = [g for g in skill_gap(db, user_id, career.id) if g["gap"] > 0][:MAX_SKILLS]
    if not gaps:
        return None, []
    db.execute(update(m.Roadmap).where(m.Roadmap.user_id == user_id, m.Roadmap.career_id == career.id)
               .values(active=False))
    road = m.Roadmap(user_id=user_id, career_id=career.id, title=title or f"Roadmap to {career.name}")
    db.add(road)
    db.flush()

    notes, used_resources, used_projects, pos = [], set(), set(), 0

    def add_item(kind, item_title, ref_id):
        nonlocal pos
        item = m.RoadmapItem(roadmap_id=road.id, position=pos, kind=kind, title=item_title, ref_id=ref_id)
        db.add(item)
        db.flush()
        pos += 1
        return item

    for g in gaps:
        add_item("skill", f"Build {g['skill']} up to level {g['required_level']} (you are at {g['current_level']})", g["skill_id"])
        res = recommenders.recommend_resources(db, user_id, career.id, limit=1, only_skill=g["slug"], exclude_ids=used_resources)
        if res:
            r, fit = res[0]["resource"], res[0]["fit"]
            used_resources.add(r.id)
            item = add_item("resource", f"Study: {r.title} ({r.provider})", r.id)
            why = (f"Covers your gap in {g['skill']} and suits how you tend to learn." if fit >= 0.6
                   else f"Covers your gap in {g['skill']}; it is a weaker match for your learning style, so rate it after trying.")
            notes.append({"item_id": item.id, "kind": "resource", "target_id": r.id, "label": r.title, "explanation": why,
                          "fit": round(fit, 2)})
        projects = [p for p in recommenders.recommend_projects(db, user_id, skill_slug=g["slug"],
                                                               max_difficulty=min(3, g["current_level"] + 1), limit=5)
                    if p["idea"].id not in used_projects]
        if projects:
            idea = projects[0]["idea"]
            used_projects.add(idea.id)
            item = add_item("project", f"Project: {idea.title}", idea.id)
            notes.append({"item_id": item.id, "kind": "project", "target_id": idea.id, "label": idea.title,
                          "explanation": f"The easiest available project that practises {g['skill']}."})
    return road, notes


def item_details(db: Session, user_id: int, item: m.RoadmapItem) -> dict:
    """Live detail for one item. 'auto_done' is derived from real progress, not typed by the student."""
    out = {"id": item.id, "position": item.position, "kind": item.kind, "title": item.title, "ref_id": item.ref_id,
           "done": item.done, "auto_done": False}
    if item.kind == "skill" and item.ref_id:
        skill = db.get(m.Skill, item.ref_id)
        row = db.scalars(select(m.StudentSkill).where(m.StudentSkill.user_id == user_id,
                                                      m.StudentSkill.skill_id == item.ref_id)).first()
        required = db.scalars(select(m.CareerSkill.level_required).join(
            m.Roadmap, m.Roadmap.career_id == m.CareerSkill.career_id).where(
            m.Roadmap.id == item.roadmap_id, m.CareerSkill.skill_id == item.ref_id)).first() or 1
        out.update(skill=skill.name if skill else None, current_level=row.level if row else 0, required_level=required,
                   auto_done=bool(row and row.level >= required))
    elif item.kind == "resource" and item.ref_id:
        r = db.get(m.Resource, item.ref_id)
        done = db.scalars(select(m.ResourceFeedback).where(m.ResourceFeedback.user_id == user_id,
                                                           m.ResourceFeedback.resource_id == item.ref_id,
                                                           m.ResourceFeedback.status == "completed")).first()
        if r:
            out.update(url=r.url, provider=r.provider, resource_kind=r.kind, difficulty=r.difficulty,
                       verified=bool(r.last_verified))
        out["auto_done"] = done is not None
    elif item.kind == "project" and item.ref_id:
        idea = db.get(m.ProjectIdea, item.ref_id)
        finished = db.scalars(select(m.Project).where(m.Project.user_id == user_id, m.Project.idea_id == item.ref_id,
                                                      m.Project.status == "completed")).first()
        if idea:
            out.update(description=idea.description, difficulty=idea.difficulty, est_hours=idea.est_hours)
        out["auto_done"] = finished is not None
    out["effective_done"] = item.done or out["auto_done"]
    return out


def progress(items: list[dict]) -> dict:
    total = len(items)
    done = sum(1 for i in items if i["effective_done"])
    return {"done": done, "total": total, "percent": round(100 * done / total) if total else 0}

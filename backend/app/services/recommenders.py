"""
Read-only recommenders for resources and projects. They READ the learning preferences and the
student's skills but write nothing, so they cannot affect any of the three models.
"""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models as m
from app.services import learning_model
from app.services.skill_gap import skill_gap


def resource_skills(db: Session, resource_id: int) -> list[str]:
    return list(db.scalars(select(m.Skill.slug).join(m.ResourceSkill, m.ResourceSkill.skill_id == m.Skill.id)
                           .where(m.ResourceSkill.resource_id == resource_id)))


def recommend_resources(db: Session, user_id: int, career_id: int, limit: int = 6,
                        only_skill: str | None = None, exclude_ids: set | None = None) -> list[dict]:
    """Resources that close the student's skill gaps, ranked by fit with how THEY learn."""
    gaps = {g["slug"]: g["priority"] for g in skill_gap(db, user_id, career_id) if g["gap"] > 0}
    if only_skill:
        gaps = {k: v for k, v in gaps.items() if k == only_skill}
    prefs = learning_model.get_preferences(db, user_id)
    done = {f.resource_id for f in db.scalars(select(m.ResourceFeedback).where(
        m.ResourceFeedback.user_id == user_id, m.ResourceFeedback.status == "completed"))}
    ranked = []
    for r in db.scalars(select(m.Resource)):
        if r.id in done or (exclude_ids and r.id in exclude_ids):
            continue
        skills = resource_skills(db, r.id)
        relevance = sum(gaps.get(s, 0) for s in skills)
        if relevance == 0:
            continue
        fit = learning_model.fit_score(prefs, r)
        ranked.append({"resource": r, "skills": skills, "fit": fit, "rank": relevance * (0.5 + fit)})
    ranked.sort(key=lambda x: -x["rank"])
    return ranked[:limit]


def recommend_projects(db: Session, user_id: int, career_slug: str | None = None, skill_slug: str | None = None,
                       max_difficulty: int = 3, limit: int = 10) -> list[dict]:
    """Easiest first; among equals, projects that use skills the student already has come first."""
    have = {s.slug for s in db.scalars(select(m.Skill).join(m.StudentSkill, m.StudentSkill.skill_id == m.Skill.id)
                                       .where(m.StudentSkill.user_id == user_id))}
    taken = {p.idea_id for p in db.scalars(select(m.Project).where(m.Project.user_id == user_id)) if p.idea_id}
    out = []
    for i in db.scalars(select(m.ProjectIdea)):
        if i.difficulty > max_difficulty or i.id in taken:
            continue
        if career_slug and career_slug not in i.career_slugs:
            continue
        if skill_slug and skill_slug not in i.skill_slugs:
            continue
        out.append({"idea": i, "known": len(have & set(i.skill_slugs))})
    out.sort(key=lambda x: (x["idea"].difficulty, -x["known"], x["idea"].id))
    return out[:limit]

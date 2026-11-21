"""Skill gap: required skills for a career vs the student's current skills."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models as m


def skill_gap(db: Session, user_id: int, career_id: int) -> list[dict]:
    have = {s.skill_id: s.level for s in db.scalars(
        select(m.StudentSkill).where(m.StudentSkill.user_id == user_id))}
    rows = db.execute(select(m.CareerSkill, m.Skill).join(m.Skill, m.Skill.id == m.CareerSkill.skill_id)
                      .where(m.CareerSkill.career_id == career_id)).all()
    out = []
    for cs, skill in rows:
        current = have.get(skill.id, 0)
        gap = max(0, cs.level_required - current)
        out.append({
            "skill_id": skill.id, "slug": skill.slug, "skill": skill.name,
            "required_level": cs.level_required, "current_level": current, "gap": gap,
            "importance": cs.importance,
            "priority": round(cs.importance * gap, 3),   # bigger = learn sooner
            "status": "met" if gap == 0 else ("missing" if current == 0 else "in_progress"),
        })
    out.sort(key=lambda x: (-x["priority"], x["skill"]))
    return out

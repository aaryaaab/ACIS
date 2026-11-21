"""
GROWTH MODEL

Answers: "is the student actually progressing?"

Writes only student_skills, projects and achievements. It does not touch the
career tables or the learning preferences. (The orchestrator decides whether a
growth event should also become career evidence.)
"""
from datetime import datetime, date

from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app import models as m


def set_skill_level(db: Session, user_id: int, skill: m.Skill, level: int) -> m.StudentSkill:
    level = max(1, min(5, level))
    row = db.scalars(select(m.StudentSkill).where(
        m.StudentSkill.user_id == user_id, m.StudentSkill.skill_id == skill.id)).first()
    if row is None:
        row = m.StudentSkill(user_id=user_id, skill_id=skill.id, level=level)
        db.add(row)
    else:
        row.level = level
        row.updated_at = datetime.utcnow()
    db.flush()
    return row


def start_project(db: Session, user_id: int, title: str, description: str = "",
                  idea_id: int | None = None, skill_slugs: list | None = None) -> m.Project:
    p = m.Project(user_id=user_id, title=title, description=description,
                  idea_id=idea_id, skill_slugs=skill_slugs or [])
    db.add(p)
    db.flush()
    return p


def complete_project(db: Session, user_id: int, project: m.Project, add_to_portfolio: bool = True) -> m.Project:
    """Marks a project done and raises the levels of the skills it used by one (max 3 via projects)."""
    if project.status == "completed":
        return project
    project.status = "completed"
    project.completed_at = datetime.utcnow()
    project.in_portfolio = add_to_portfolio
    for slug in project.skill_slugs:
        skill = db.scalars(select(m.Skill).where(m.Skill.slug == slug)).first()
        if skill is None:
            continue
        row = db.scalars(select(m.StudentSkill).where(
            m.StudentSkill.user_id == user_id, m.StudentSkill.skill_id == skill.id)).first()
        current = row.level if row else 0
        set_skill_level(db, user_id, skill, min(3, current + 1) if current < 3 else current)
    db.flush()
    return project


def add_achievement(db: Session, user_id: int, kind: str, title: str,
                    description: str = "", achieved_on: date | None = None) -> m.Achievement:
    a = m.Achievement(user_id=user_id, kind=kind, title=title, description=description,
                      achieved_on=achieved_on or date.today())
    db.add(a)
    db.flush()
    return a


def progress_summary(db: Session, user_id: int) -> dict:
    skills = db.scalar(select(func.count()).select_from(m.StudentSkill).where(m.StudentSkill.user_id == user_id))
    done = db.scalar(select(func.count()).select_from(m.Project).where(
        m.Project.user_id == user_id, m.Project.status == "completed"))
    active = db.scalar(select(func.count()).select_from(m.Project).where(
        m.Project.user_id == user_id, m.Project.status == "in_progress"))
    ach = db.execute(select(m.Achievement.kind, func.count()).where(m.Achievement.user_id == user_id)
                     .group_by(m.Achievement.kind)).all()
    return {"skills_tracked": skills, "projects_completed": done, "projects_in_progress": active,
            "achievements": {k: c for k, c in ach}}

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models as m
from app.database import get_db
from app.deps import current_user
from app.schemas import AchievementIn, ProjectIn, SkillIn
from app.services import career_model, growth_model, orchestrator

router = APIRouter(prefix="/growth", tags=["growth"])


@router.get("/skills")
def my_skills(user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.execute(select(m.StudentSkill, m.Skill).join(m.Skill, m.Skill.id == m.StudentSkill.skill_id)
                      .where(m.StudentSkill.user_id == user.id).order_by(m.Skill.name)).all()
    return [{"slug": s.slug, "name": s.name, "level": ss.level, "category": s.category} for ss, s in rows]


@router.get("/skills/catalogue")
def skill_catalogue(_: m.User = Depends(current_user), db: Session = Depends(get_db)):
    return [{"slug": s.slug, "name": s.name, "category": s.category} for s in db.scalars(select(m.Skill).order_by(m.Skill.name))]


@router.put("/skills")
def set_skill(data: SkillIn, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    skill = db.scalars(select(m.Skill).where(m.Skill.slug == data.skill_slug)).first()
    if skill is None:
        raise HTTPException(404, "Unknown skill")
    growth_model.set_skill_level(db, user.id, skill, data.level)
    db.commit()
    return {"slug": skill.slug, "level": data.level}


@router.get("/projects/ideas")
def project_ideas(career: str | None = None, max_difficulty: int = Query(3, ge=1, le=3),
                  user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    """Projects ordered by difficulty; ones that use skills the student already has come first."""
    have = {s.slug for s in db.scalars(select(m.Skill).join(m.StudentSkill, m.StudentSkill.skill_id == m.Skill.id)
                                       .where(m.StudentSkill.user_id == user.id))}
    done = {p.idea_id for p in db.scalars(select(m.Project).where(m.Project.user_id == user.id)) if p.idea_id}
    ideas = []
    for i in db.scalars(select(m.ProjectIdea)):
        if i.difficulty > max_difficulty or i.id in done:
            continue
        if career and career not in i.career_slugs:
            continue
        known = len(have & set(i.skill_slugs))
        ideas.append((i.difficulty, -known, i))
    ideas.sort(key=lambda x: (x[0], x[1]))
    return [{"id": i.id, "title": i.title, "description": i.description, "difficulty": i.difficulty,
             "est_hours": i.est_hours, "skills": i.skill_slugs, "you_already_know": len(have & set(i.skill_slugs))}
            for _, _, i in ideas]


@router.get("/projects")
def my_projects(user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(m.Project).where(m.Project.user_id == user.id).order_by(m.Project.started_at.desc()))
    return [{"id": p.id, "title": p.title, "description": p.description, "status": p.status, "skills": p.skill_slugs,
             "in_portfolio": p.in_portfolio, "repo_url": p.repo_url, "started_at": p.started_at,
             "completed_at": p.completed_at} for p in rows]


@router.post("/projects", status_code=201)
def new_project(data: ProjectIn, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    skills = data.skill_slugs
    if data.idea_id:
        idea = db.get(m.ProjectIdea, data.idea_id)
        if idea is None:
            raise HTTPException(404, "Unknown project idea")
        skills = skills or idea.skill_slugs
    p = growth_model.start_project(db, user.id, data.title, data.description, data.idea_id, skills)
    p.repo_url = data.repo_url
    db.commit()
    return {"id": p.id}


@router.post("/projects/{project_id}/complete")
def finish_project(project_id: int, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    p = db.get(m.Project, project_id)
    if p is None or p.user_id != user.id:
        raise HTTPException(404, "Project not found")
    out = orchestrator.complete_project(db, user, p)
    db.commit()
    return {"id": p.id, "status": p.status, **out}


@router.get("/achievements")
def achievements(user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(m.Achievement).where(m.Achievement.user_id == user.id).order_by(m.Achievement.achieved_on.desc()))
    return [{"id": a.id, "kind": a.kind, "title": a.title, "description": a.description, "date": a.achieved_on} for a in rows]


@router.post("/achievements", status_code=201)
def new_achievement(data: AchievementIn, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    a = growth_model.add_achievement(db, user.id, data.kind, data.title, data.description, data.achieved_on)
    if data.career_slug:
        career = db.scalars(select(m.Career).where(m.Career.slug == data.career_slug)).first()
        if career is None:
            raise HTTPException(404, "Unknown career")
        kind = "competition" if data.kind == "competition" else "activity"
        career_model.add_evidence(db, user.id, career.id, kind, strength=0.8, note=f"achievement: {data.title}")
    db.commit()
    return {"id": a.id}


@router.get("/progress")
def progress(user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    return growth_model.progress_summary(db, user.id)

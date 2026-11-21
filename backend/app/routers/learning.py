from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models as m
from app.database import get_db
from app.deps import current_user
from app.schemas import ResourceFeedbackIn
from app.services import learning_model, orchestrator
from app.services.skill_gap import skill_gap

router = APIRouter(prefix="/learning", tags=["learning"])


def resource_out(r: m.Resource, skills: list[str], fit: float | None = None) -> dict:
    return {"id": r.id, "title": r.title, "provider": r.provider, "url": r.url, "kind": r.kind,
            "difficulty": r.difficulty, "duration_hours": r.duration_hours, "cost": r.cost, "skills": skills,
            "verified": r.last_verified.isoformat() if r.last_verified else None,
            "verification_note": None if r.last_verified else "Link not verified yet. Please check it before relying on it.",
            **({"fit": round(fit, 2)} if fit is not None else {})}


def skills_of(db: Session, resource_id: int) -> list[str]:
    return list(db.scalars(select(m.Skill.slug).join(m.ResourceSkill, m.ResourceSkill.skill_id == m.Skill.id)
                           .where(m.ResourceSkill.resource_id == resource_id)))


@router.get("/resources")
def resources(skill: str | None = None, kind: str | None = None, limit: int = Query(30, ge=1, le=100),
              offset: int = Query(0, ge=0), _: m.User = Depends(current_user), db: Session = Depends(get_db)):
    q = select(m.Resource).order_by(m.Resource.title)
    if kind:
        q = q.where(m.Resource.kind == kind)
    if skill:
        q = q.join(m.ResourceSkill).join(m.Skill).where(m.Skill.slug == skill)
    return [resource_out(r, skills_of(db, r.id)) for r in db.scalars(q.limit(limit).offset(offset))]


@router.get("/recommended")
def recommended(career: str, limit: int = Query(6, ge=1, le=20), user: m.User = Depends(current_user),
                db: Session = Depends(get_db)):
    """Resources for the student's skill gaps for a career, ranked by how well they suit THIS student's learning style."""
    c = db.scalars(select(m.Career).where(m.Career.slug == career)).first()
    if c is None:
        raise HTTPException(404, "Unknown career")
    gaps = {g["slug"]: g["priority"] for g in skill_gap(db, user.id, c.id) if g["gap"] > 0}
    prefs = learning_model.get_preferences(db, user.id)
    seen = {f.resource_id for f in db.scalars(select(m.ResourceFeedback).where(
        m.ResourceFeedback.user_id == user.id, m.ResourceFeedback.status == "completed"))}
    ranked = []
    for r in db.scalars(select(m.Resource)):
        if r.id in seen:
            continue
        rs = skills_of(db, r.id)
        relevance = sum(gaps.get(s, 0) for s in rs)
        if relevance == 0:
            continue
        ranked.append((relevance * (0.5 + learning_model.fit_score(prefs, r)), r, rs, learning_model.fit_score(prefs, r)))
    ranked.sort(key=lambda x: -x[0])
    return {"career": c.name, "learning_style": prefs,
            "resources": [resource_out(r, rs, fit) for _, r, rs, fit in ranked[:limit]]}


@router.get("/preferences")
def preferences(user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    return learning_model.get_preferences(db, user.id)


@router.post("/resources/{resource_id}/feedback", status_code=201)
def feedback(resource_id: int, data: ResourceFeedbackIn, user: m.User = Depends(current_user),
             db: Session = Depends(get_db)):
    r = db.get(m.Resource, resource_id)
    if r is None:
        raise HTTPException(404, "Resource not found")
    out = orchestrator.resource_feedback(db, user, r, data.status, data.rating, data.comment)
    db.commit()
    return out

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models as m
from app.database import get_db
from app.deps import current_user, get_profile
from app.schemas import EvidenceIn, FeedbackIn
from app.services import career_model, orchestrator
from app.services.skill_gap import skill_gap

router = APIRouter(prefix="/careers", tags=["careers"])


@router.get("")
def list_careers(q: str = "", limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0),
                 _: m.User = Depends(current_user), db: Session = Depends(get_db)):
    query = select(m.Career).order_by(m.Career.name)
    if q:
        query = query.where(m.Career.name.ilike(f"%{q}%"))
    rows = db.scalars(query.limit(limit).offset(offset)).all()
    return [{"id": c.id, "slug": c.slug, "name": c.name, "description": c.description} for c in rows]


@router.get("/portfolio")
def portfolio(user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    profile = get_profile(user, db)
    if db.scalars(select(m.CareerScore).where(m.CareerScore.user_id == user.id)).first() is None:
        raise HTTPException(409, "Complete the assessment first")
    cp = db.scalars(select(m.CareerProfile).where(m.CareerProfile.user_id == user.id)).one()
    result = career_model.build_portfolio(db, user.id, orchestrator.explore_mode(profile))
    result["stage"] = profile.stage
    result["explore_message"] = ("You are in the Explore stage, so ACIS shows possible directions to try out, "
                                 "not a recommendation." if not result["recommendation_allowed"] else "")
    result["algorithm_version"] = cp.algorithm_version
    return result


@router.post("/recommendations/refresh")
def refresh(user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    profile = get_profile(user, db)
    result = orchestrator.refresh_career_profile(db, user, profile)
    db.commit()
    return result


@router.get("/history")
def history(limit: int = Query(100, ge=1, le=500), user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.execute(select(m.CareerHistory, m.Career.name).join(m.Career, m.Career.id == m.CareerHistory.career_id)
                      .where(m.CareerHistory.user_id == user.id)
                      .order_by(m.CareerHistory.created_at.desc(), m.CareerHistory.id.desc()).limit(limit)).all()
    return [{"career": name, "role": h.role, "level": h.level, "reason": h.reason, "at": h.created_at} for h, name in rows]


@router.post("/evidence", status_code=201)
def add_evidence(data: EvidenceIn, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    profile = get_profile(user, db)
    career = db.scalars(select(m.Career).where(m.Career.slug == data.career_slug)).first()
    if career is None:
        raise HTTPException(404, "Unknown career")
    career_model.add_evidence(db, user.id, career.id, data.source_type, data.direction, data.strength, data.note)
    result = orchestrator.refresh_career_profile(db, user, profile)
    db.commit()
    return result["portfolio"]


@router.get("/compare")
def compare(a: str, b: str, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    """Side-by-side comparison of two careers for this student."""
    out = []
    for slug in (a, b):
        career = db.scalars(select(m.Career).where(m.Career.slug == slug)).first()
        if career is None:
            raise HTTPException(404, f"Unknown career: {slug}")
        score = db.scalars(select(m.CareerScore).where(m.CareerScore.user_id == user.id,
                                                       m.CareerScore.career_id == career.id)).first()
        level = career_model.confidence_level(score.score, score.evidence_count, score.evidence_days) if score else None
        gaps = skill_gap(db, user.id, career.id)
        degrees = db.scalars(select(m.Degree).join(m.CareerDegree, m.CareerDegree.degree_id == m.Degree.id)
                             .where(m.CareerDegree.career_id == career.id)).all()
        out.append({"slug": career.slug, "name": career.name, "description": career.description,
                    "fit": level or "unknown", "pathway": career.pathway,
                    "degrees": [d.name for d in degrees],
                    "skills_missing": [g["skill"] for g in gaps if g["status"] == "missing"][:5],
                    "skills_met": [g["skill"] for g in gaps if g["status"] == "met"][:5]})
    return {"careers": out, "note": "Fit levels describe how well your current evidence matches each career. They are not predictions."}


@router.get("/{slug}/skill-gap")
def career_skill_gap(slug: str, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    career = db.scalars(select(m.Career).where(m.Career.slug == slug)).first()
    if career is None:
        raise HTTPException(404, "Unknown career")
    return {"career": career.name, "skills": skill_gap(db, user.id, career.id)}


@router.get("/recommendations/{rec_id}")
def get_recommendation(rec_id: int, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    rec = db.get(m.Recommendation, rec_id)
    if rec is None or rec.user_id != user.id:       # never reveal that other users' records exist
        raise HTTPException(404, "Recommendation not found")
    return {"id": rec.id, "kind": rec.kind, "label": rec.target_label, "confidence": rec.confidence,
            "why": rec.explanation, "what_could_change": rec.what_could_change,
            "evidence": rec.input_evidence.get("evidence_list", []), "created_at": rec.created_at}


@router.post("/recommendations/{rec_id}/feedback", status_code=201)
def recommendation_feedback(rec_id: int, data: FeedbackIn, user: m.User = Depends(current_user),
                            db: Session = Depends(get_db)):
    rec = db.get(m.Recommendation, rec_id)
    if rec is None or rec.user_id != user.id:
        raise HTTPException(404, "Recommendation not found")
    fb = orchestrator.career_feedback(db, user, rec, data.helpful, data.relevance, data.comment)
    db.commit()
    return {"id": fb.id}

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models as m
from app.assessment_bank import public_questions
from app.database import get_db
from app.deps import current_user, get_profile
from app.schemas import AssessmentIn, OnboardingIn
from app.services import orchestrator

router = APIRouter(tags=["student"])


def profile_out(p: m.StudentProfile) -> dict:
    return {"stage": p.stage, "education_level": p.education_level, "institution": p.institution, "city": p.city,
            "long_term_goal": p.long_term_goal, "is_minor": p.is_minor, "onboarding_done": p.onboarding_done,
            "rapid_mode_used": p.rapid_mode_used, "lifestyle": p.lifestyle, "financial_context": p.financial_context}


@router.post("/onboarding")
def onboarding(data: OnboardingIn, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    try:
        profile = orchestrator.finish_onboarding(db, user, data)
    except PermissionError as e:
        raise HTTPException(403, str(e))
    db.commit()
    return profile_out(profile)


@router.get("/profile")
def get_my_profile(user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    profile = db.scalars(select(m.StudentProfile).where(m.StudentProfile.user_id == user.id)).first()
    details = None
    if profile:
        academics = db.scalars(select(m.AcademicRecord).where(m.AcademicRecord.user_id == user.id)
                               .order_by(m.AcademicRecord.id)).all()
        details = {**profile_out(profile),
                   "date_of_birth": profile.date_of_birth.isoformat() if profile.date_of_birth else None,
                   "academics": [{"subject": a.subject, "score_percent": a.score_percent} for a in academics],
                   "research_consent": profile.research_consent}
    return {"user": {"email": user.email, "full_name": user.full_name}, "profile": details}


@router.delete("/profile", status_code=204)
def delete_my_data(user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    """Privacy control: deletes the account and everything that belongs to it."""
    db.delete(user)
    db.commit()


@router.get("/assessment/questions")
def questions(_: m.User = Depends(current_user)):
    return public_questions()


@router.post("/assessment")
def submit_assessment(data: AssessmentIn, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    profile = get_profile(user, db)
    result = orchestrator.run_assessment(db, user, profile, data, rapid=False)
    db.commit()
    return result


@router.post("/assessment/rapid")
def rapid_assessment(data: AssessmentIn, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    """Rapid Career Decision Mode: one-shot assessment plus immediate directions and next steps."""
    profile = get_profile(user, db)
    result = orchestrator.run_assessment(db, user, profile, data, rapid=True)
    db.commit()
    return result

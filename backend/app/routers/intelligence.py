from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models as m
from app.database import get_db
from app.deps import current_user, get_profile
from app.services import career_model, intelligence_service, orchestrator

router = APIRouter(prefix="/intelligence", tags=["career intelligence"])


@router.get("", summary="Saved market updates relevant to my career directions, with sources and dates")
def intelligence(career: str | None = None, limit: int = Query(10, ge=1, le=50), offset: int = Query(0, ge=0),
                 user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    profile = get_profile(user, db)
    portfolio = career_model.build_portfolio(db, user.id, orchestrator.explore_mode(profile))
    tiers = {}
    if portfolio["primary"]:
        tiers[portfolio["primary"]["slug"]] = "primary"
    tiers.update({e["slug"]: "secondary" for e in portfolio["secondary"]})
    for e in portfolio["emerging"]:
        tiers.setdefault(e["slug"], "emerging")
    items = intelligence_service.for_student(db, tiers, career)
    return {"total": len(items), "items": items[offset:offset + limit],
            "message": "" if items else "No saved updates match your directions yet. ACIS only shows items it has "
                                        "actually retrieved from a named source, and never makes any up.",
            "note": "Each item shows where it came from and when it was retrieved. Check the original source before acting on it."}


@router.get("/sources", summary="Every source the knowledge base uses, with licence and last-verified date")
def sources(_: m.User = Depends(current_user), db: Session = Depends(get_db)):
    return [intelligence_service.source_out(s) for s in db.scalars(select(m.Source).order_by(m.Source.name))]

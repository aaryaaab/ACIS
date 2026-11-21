from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import models as m
from app.database import get_db
from app.deps import current_user, get_profile
from app.services import career_model, opportunity_service, orchestrator

router = APIRouter(prefix="/opportunities", tags=["opportunities"])


def _tiers(db: Session, user: m.User) -> dict[str, str]:
    profile = get_profile(user, db)
    p = career_model.build_portfolio(db, user.id, orchestrator.explore_mode(profile))
    tiers = {p["primary"]["slug"]: "primary"} if p["primary"] else {}
    tiers.update({e["slug"]: "secondary" for e in p["secondary"]})
    for e in p["emerging"]:
        tiers.setdefault(e["slug"], "emerging")
    return tiers


@router.get("", summary="Verified opportunities, most relevant to me first")
def list_opportunities(kind: Literal["internship", "scholarship", "hackathon", "research"] | None = None,
                       career: str | None = None, include_closed: bool = False, include_unverified: bool = False,
                       limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0),
                       user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    items = opportunity_service.list_for_student(db, _tiers(db, user), kind, career, include_closed, include_unverified)
    return {"total": len(items), "items": items[offset:offset + limit],
            "message": "" if items else "No verified opportunities are saved yet. ACIS never invents opportunities or deadlines.",
            "note": "Deadlines and eligibility can change. Always confirm on the provider's own page before applying."}


@router.get("/{opportunity_id}")
def get_opportunity(opportunity_id: int, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    from datetime import date
    o = db.get(m.Opportunity, opportunity_id)
    if o is None:
        raise HTTPException(404, "Opportunity not found")
    return opportunity_service.opportunity_out(o, db.get(m.Source, o.source_id) if o.source_id else None, date.today())

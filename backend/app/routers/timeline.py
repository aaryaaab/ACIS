from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app import models as m
from app.database import get_db
from app.deps import current_user
from app.services import timeline_service

router = APIRouter(prefix="/timeline", tags=["timeline"])


@router.get("", summary="My career evolution over time (newest first)")
def timeline(types: str | None = Query(None, description="Comma-separated: " + ", ".join(timeline_service.TYPES)),
             from_date: date | None = Query(None, alias="from"), to_date: date | None = Query(None, alias="to"),
             group: str = Query("none", pattern="^(none|month)$"),
             limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
             user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    wanted = None
    if types:
        wanted = {t.strip() for t in types.split(",") if t.strip()}
        bad = wanted - set(timeline_service.TYPES)
        if bad:
            raise HTTPException(422, f"Unknown type(s): {', '.join(sorted(bad))}")
    if from_date and to_date and from_date > to_date:
        raise HTTPException(422, "'from' must not be after 'to'")
    events = timeline_service.build(db, user.id, wanted, from_date, to_date)
    page = events[offset:offset + limit]
    if group == "month":
        months: dict[str, list] = {}
        for e in page:
            months.setdefault(e["month"], []).append(e)
        return {"total": len(events), "months": [{"month": k, "events": v} for k, v in months.items()]}
    return {"total": len(events), "events": page}

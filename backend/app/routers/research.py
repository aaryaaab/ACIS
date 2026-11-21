import csv
import io
import json
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import JSONResponse, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models as m
from app.database import get_db
from app.deps import current_user, get_profile
from app.schemas import ResearchConsentIn
from app.services import research_service

router = APIRouter(prefix="/research", tags=["research logging & export"])


@router.get("/consent", summary="Have I agreed to my anonymised data being used in research?")
def get_consent(user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    return {"research_consent": get_profile(user, db).research_consent}


@router.put("/consent", summary="Opt in or out of anonymised research use (default: out)")
def set_consent(data: ResearchConsentIn, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    profile = get_profile(user, db)
    if profile.is_minor and data.consent and not profile.guardian_consent:
        raise HTTPException(403, "A parent or guardian must consent first")
    profile.research_consent = data.consent
    db.commit()
    return {"research_consent": profile.research_consent}


@router.get("/my-data", summary="Download everything ACIS stores about me (JSON)")
def my_data(user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    return JSONResponse(research_service.my_data(db, user),
                        headers={"Content-Disposition": 'attachment; filename="acis-my-data.json"'})


@router.get("/my-log", summary="My own recommendation log: what was recommended, why, and my feedback")
def my_log(limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
           user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(m.Recommendation).where(m.Recommendation.user_id == user.id)
                      .order_by(m.Recommendation.id.desc()).limit(limit).offset(offset))
    out = []
    for r in rows:
        fb = db.scalars(select(m.RecommendationFeedback).where(m.RecommendationFeedback.recommendation_id == r.id)).all()
        out.append({"id": r.id, "created_at": r.created_at, "kind": r.kind, "target": r.target_label,
                    "confidence": r.confidence, "why": r.explanation, "algorithm_version": r.algorithm_version,
                    "model_version": r.model_version, "knowledge_base_version": r.knowledge_base_version,
                    "feedback": [{"helpful": f.helpful, "relevance": f.relevance, "comment": f.comment} for f in fb]})
    return out


@router.get("/export", summary="Anonymised dataset for the academic evaluation (researchers only)")
def export(dataset: Literal["recommendations", "career_history", "learning_preferences"] = "recommendations",
           format: Literal["json", "csv"] = "json", limit: int = Query(1000, ge=1, le=5000), offset: int = Query(0, ge=0),
           user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    if not research_service.is_researcher(user):
        raise HTTPException(403, "Research export is limited to accounts listed in RESEARCHER_EMAILS")
    total, rows = research_service.BUILDERS[dataset](db, limit, offset)
    if format == "csv":
        buf = io.StringIO()
        if rows:
            writer = csv.DictWriter(buf, fieldnames=list(rows[0]))
            writer.writeheader()
            for r in rows:
                writer.writerow({k: json.dumps(v) if isinstance(v, (dict, list)) else v for k, v in r.items()})
        return Response(buf.getvalue(), media_type="text/csv",
                        headers={"Content-Disposition": f'attachment; filename="acis-{dataset}.csv"'})
    return {"metadata": research_service.export_metadata(db, dataset, total), "limit": limit, "offset": offset, "rows": rows}

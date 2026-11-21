"""
Research data for the academic evaluation.

  * Every student can download ALL of their own data (my_data).
  * Only listed researchers can download the anonymised dataset (research_export), and it contains only
    students who opted in. It has no names, emails, free text, journals or comments.
"""
import hashlib
import hmac
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import models as m
from app.config import settings

DATASETS = ["recommendations", "career_history", "learning_preferences"]


def pseudonym(user_id: int) -> str:
    """Stable anonymous id. Cannot be reversed without the server's secret key."""
    return hmac.new(settings.secret_key.encode(), f"user:{user_id}".encode(), hashlib.sha256).hexdigest()[:12]


def is_researcher(user: m.User) -> bool:
    allowed = {e.strip().lower() for e in settings.researcher_emails.split(",") if e.strip()}
    return user.email.lower() in allowed


def consenting_user_ids(db: Session) -> list[int]:
    return list(db.scalars(select(m.StudentProfile.user_id).where(m.StudentProfile.research_consent.is_(True))))


def _role_now(db: Session, user_id: int, career_id: int | None) -> str:
    if career_id is None:
        return "not_applicable"
    h = db.scalars(select(m.CareerHistory).where(m.CareerHistory.user_id == user_id, m.CareerHistory.career_id == career_id)
                   .order_by(m.CareerHistory.id.desc())).first()
    return h.role if h else "none"


def recommendations_dataset(db: Session, limit: int, offset: int) -> tuple[int, list[dict]]:
    ids = consenting_user_ids(db)
    q = select(m.Recommendation).where(m.Recommendation.user_id.in_(ids))
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    rows = []
    for r in db.scalars(q.order_by(m.Recommendation.id).limit(limit).offset(offset)):
        fb = db.scalars(select(m.RecommendationFeedback).where(m.RecommendationFeedback.recommendation_id == r.id)).all()
        rows.append({
            "recommendation_id": r.id, "student": pseudonym(r.user_id), "created_at": r.created_at.isoformat(),
            "kind": r.kind, "target": r.target_label, "confidence": r.confidence,
            "input_evidence": {k: v for k, v in r.input_evidence.items() if k != "evidence_list"},
            "explanation": r.explanation, "algorithm_version": r.algorithm_version, "model_version": r.model_version,
            "knowledge_base_version": r.knowledge_base_version,
            "feedback": [{"helpful": f.helpful, "relevance": f.relevance, "at": f.created_at.isoformat()} for f in fb],
            "target_role_now": _role_now(db, r.user_id, r.target_id if r.kind == "career" else None)})
    return total, rows


def career_history_dataset(db: Session, limit: int, offset: int) -> tuple[int, list[dict]]:
    ids = consenting_user_ids(db)
    q = select(m.CareerHistory, m.Career.slug).join(m.Career, m.Career.id == m.CareerHistory.career_id) \
        .where(m.CareerHistory.user_id.in_(ids))
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    rows = [{"student": pseudonym(h.user_id), "career": slug, "role": h.role, "level": h.level,
             "at": h.created_at.isoformat()} for h, slug in db.execute(q.order_by(m.CareerHistory.id).limit(limit).offset(offset))]
    return total, rows


def learning_preferences_dataset(db: Session, limit: int, offset: int) -> tuple[int, list[dict]]:
    ids = consenting_user_ids(db)
    q = select(m.LearningPreference).where(m.LearningPreference.user_id.in_(ids))
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    rows = [{"student": pseudonym(p.user_id), "dimension": p.dimension, "value": round(p.value, 3), "samples": p.samples}
            for p in db.scalars(q.order_by(m.LearningPreference.id).limit(limit).offset(offset))]
    return total, rows


BUILDERS = {"recommendations": recommendations_dataset, "career_history": career_history_dataset,
            "learning_preferences": learning_preferences_dataset}


def export_metadata(db: Session, dataset: str, total: int) -> dict:
    versions = sorted(set(db.scalars(select(m.Recommendation.algorithm_version).distinct())))
    return {"dataset": dataset, "exported_at": datetime.utcnow().isoformat() + "Z", "rows_in_dataset": total,
            "consenting_students": len(consenting_user_ids(db)), "algorithm_versions_in_database": versions,
            "anonymisation": "Student ids are keyed hashes. Names, emails, journals, reflections text, comments and "
                             "voice transcripts are never included. Only students who opted in are included.",
            "limitations": "Rule-based starter knowledge base; confidence labels are not validated predictions."}


def my_data(db: Session, user: m.User) -> dict:
    """Everything stored about the student (password hash excluded). This is their right to a copy."""
    uid = user.id

    def rows(model, order=None):
        q = select(model).where(model.user_id == uid)
        return list(db.scalars(q.order_by(order) if order is not None else q))

    def plain(obj, skip=("embedding",)):
        return {c.name: (getattr(obj, c.name).isoformat() if hasattr(getattr(obj, c.name), "isoformat") else getattr(obj, c.name))
                for c in obj.__table__.columns if c.name not in skip}

    profile = db.scalars(select(m.StudentProfile).where(m.StudentProfile.user_id == uid)).first()
    convs = []
    for c in rows(m.MentorConversation):
        convs.append({**plain(c), "messages": [plain(x) for x in c.messages]})
    career_scores = [{"career": s.career.slug, "internal_score": round(s.score, 3), "baseline": round(s.baseline, 3),
                      "evidence_count": s.evidence_count} for s in rows(m.CareerScore)]
    return {
        "exported_at": datetime.utcnow().isoformat() + "Z",
        "account": {"email": user.email, "full_name": user.full_name, "created_at": user.created_at.isoformat()},
        "profile": plain(profile) if profile else None,
        "academic_records": [plain(x) for x in rows(m.AcademicRecord)],
        "interests": [plain(x) for x in rows(m.Interest)],
        "aptitude_results": [plain(x) for x in rows(m.AptitudeResult)],
        "personality_results": [plain(x) for x in rows(m.PersonalityResult)],
        "career_scores_internal": career_scores,
        "career_evidence": [plain(x) for x in rows(m.CareerEvidence)],
        "career_history": [plain(x) for x in rows(m.CareerHistory)],
        "learning_preferences": [plain(x) for x in rows(m.LearningPreference)],
        "resource_feedback": [plain(x) for x in rows(m.ResourceFeedback)],
        "skills": [{"skill": s.skill.slug, "level": s.level} for s in rows(m.StudentSkill)],
        "projects": [plain(x) for x in rows(m.Project)],
        "achievements": [plain(x) for x in rows(m.Achievement)],
        "memories": [plain(x) for x in rows(m.Memory)],
        "journal_entries": [plain(x) for x in rows(m.JournalEntry)],
        "voice_entries": [plain(x) for x in rows(m.VoiceEntry)],
        "reflections": [plain(x) for x in rows(m.Reflection)],
        "roadmaps": [{**plain(r), "items": [plain(i) for i in r.items]} for r in rows(m.Roadmap)],
        "recommendations": [plain(x) for x in rows(m.Recommendation)],
        "recommendation_feedback": [plain(x) for x in rows(m.RecommendationFeedback)],
        "mentor_conversations": convs,
    }

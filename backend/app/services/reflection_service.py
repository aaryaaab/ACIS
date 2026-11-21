"""Periodic reflection prompts. Reads only; it never changes any model."""
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models as m

REFLECTION_EVERY_DAYS = 14
CORE_PROMPTS = [
    {"field": "enjoyed", "question": "What did you enjoy most over the last few weeks?"},
    {"field": "disliked", "question": "What did you dislike or find draining?"},
    {"field": "surprised", "question": "Was there anything that surprised you about yourself or about a field?"},
    {"field": "interests_changed", "question": "Do you feel your interests have changed recently? (yes / no / unsure)"},
]


def prompt_status(db: Session, user_id: int) -> dict:
    last = db.scalars(select(m.Reflection).where(m.Reflection.user_id == user_id)
                      .order_by(m.Reflection.created_at.desc())).first()
    now = datetime.utcnow()
    days = (now - last.created_at).days if last else None
    due = last is None or days >= REFLECTION_EVERY_DAYS
    prompts = list(CORE_PROMPTS)
    recent = db.scalars(select(m.Project).where(
        m.Project.user_id == user_id, m.Project.status == "completed",
        m.Project.completed_at >= now - timedelta(days=30)).order_by(m.Project.completed_at.desc())).first()
    if recent:
        prompts.insert(0, {"field": "enjoyed", "question": f"You finished “{recent.title}”. What did you enjoy or dislike about it?"})
    return {"due": due, "days_since_last": days, "next_due_in_days": 0 if due else REFLECTION_EVERY_DAYS - days,
            "prompts": prompts,
            "note": "Reflections are optional. One reflection only nudges your career picture slightly; "
                    "patterns over time matter more."}

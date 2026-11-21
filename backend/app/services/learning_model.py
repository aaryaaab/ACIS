"""
LEARNING MODEL

Answers: "how does this student learn best?"

Writes only learning_preferences and resource_feedback.
It must never import or touch the career tables. A student who abandons a
theory-heavy AI video has told us about the VIDEO, not about AI.
"""
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models as m

DIMENSIONS = ["video", "reading", "interactive", "project", "theory", "long_sessions", "difficulty"]
LEARNING_RATE = 0.25


def _clamp(x: float) -> float:
    return max(0.0, min(1.0, x))


def get_preferences(db: Session, user_id: int) -> dict[str, float]:
    rows = db.scalars(select(m.LearningPreference).where(m.LearningPreference.user_id == user_id)).all()
    prefs = {d: 0.5 for d in DIMENSIONS}
    prefs.update({r.dimension: r.value for r in rows})
    return prefs


def _nudge(db: Session, user_id: int, dimension: str, target: float, rate: float = LEARNING_RATE) -> None:
    row = db.scalars(select(m.LearningPreference).where(
        m.LearningPreference.user_id == user_id, m.LearningPreference.dimension == dimension)).first()
    if row is None:
        row = m.LearningPreference(user_id=user_id, dimension=dimension, value=0.5, samples=0)
        db.add(row)
    row.value = _clamp(row.value + rate * (_clamp(target) - row.value))
    row.samples += 1
    row.updated_at = datetime.utcnow()


def _signal(status: str, rating: int | None) -> float:
    """-1 (disliked / gave up) .. +1 (liked / finished)."""
    if rating is not None:
        s = (rating - 3) / 2
        return min(s, -0.4) if status == "abandoned" else s
    return {"completed": 0.5, "abandoned": -0.6}.get(status, 0.0)


def record_feedback(db: Session, user_id: int, resource: m.Resource, status: str,
                    rating: int | None = None, comment: str = "") -> m.ResourceFeedback:
    fb = m.ResourceFeedback(user_id=user_id, resource_id=resource.id, status=status,
                            rating=rating, comment=comment)
    db.add(fb)
    if status != "started":
        _apply(db, user_id, resource, _signal(status, rating))
    db.flush()
    return fb


def _apply(db: Session, user_id: int, r: m.Resource, signal: float) -> None:
    # When a resource is very theoretical we cannot tell whether the student disliked the format or the
    # theory, so the format and session-length preferences move more slowly (blame is shared).
    shared = 0.5 if r.theory_level > 0.6 else 1.0
    # format (video / reading / interactive / project)
    if r.kind in ("video", "reading", "interactive", "project"):
        _nudge(db, user_id, r.kind, 0.5 + 0.5 * signal, rate=LEARNING_RATE * shared)
    # theory vs hands-on: disliking a very theoretical resource lowers the theory preference
    _nudge(db, user_id, "theory", 0.5 + signal * (r.theory_level - 0.5))
    # a disliked theory-heavy resource also pushes the student towards project-based learning
    if signal < 0 and r.theory_level > 0.6 and r.kind != "project":
        _nudge(db, user_id, "project", 0.9, rate=0.15)
    # session length
    long_factor = 0.5 if r.session_minutes >= 45 else -0.5
    _nudge(db, user_id, "long_sessions", 0.5 + signal * long_factor, rate=LEARNING_RATE * shared)
    # difficulty comfort
    _nudge(db, user_id, "difficulty", 0.5 + signal * (r.difficulty - 2) * 0.25)


def fit_score(prefs: dict[str, float], r: m.Resource) -> float:
    """How well a resource matches the student's learning style, 0..1."""
    fmt = prefs.get(r.kind, 0.5)
    theory_fit = 1 - abs(prefs["theory"] - r.theory_level)
    long_fit = 1 - abs(prefs["long_sessions"] - (1.0 if r.session_minutes >= 45 else 0.0))
    wanted_difficulty = 1 + 2 * prefs["difficulty"]          # 1..3
    diff_fit = 1 - min(1.0, abs(wanted_difficulty - r.difficulty) / 2)
    return 0.40 * fmt + 0.25 * theory_fit + 0.15 * long_fit + 0.20 * diff_fit

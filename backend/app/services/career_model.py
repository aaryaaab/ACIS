"""
CAREER MODEL

Answers: "which career directions currently fit this student?"

This is the ONLY module that writes career_profiles, career_scores,
career_evidence and career_history. Learning events (course ratings,
abandoned videos) never reach this file.

How scoring works
  1. baseline  : weighted match of interests, aptitude, academics, personality
  2. evidence  : projects, competitions, reflections etc. push the target score
                 up or down, but only by a limited amount
  3. stability : the stored score may move at most MAX_DAILY_STEP per day
  4. display   : users see High / Moderate / Emerging, never the raw number
"""
import math
from datetime import datetime, date

from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app import models as m
from app.domain import (ALGORITHM_VERSION, KNOWLEDGE_BASE_VERSION, SUBJECT_DOMAINS)

# How much each kind of evidence counts. A click is almost nothing; a project is a lot.
EVIDENCE_WEIGHTS = {
    "project": 1.0, "competition": 1.0, "club": 0.7, "activity": 0.4,
    "reflection": 0.5, "journal": 0.3, "click": 0.05,
}
MAX_EVIDENCE_SHIFT = 0.30      # evidence can move the target at most this far from baseline
EVIDENCE_HALF_LIFE_DAYS = 90
MAX_DAILY_STEP = 0.05          # stability rule
PRIMARY_SWITCH_MARGIN = 0.05   # a challenger must clearly beat the current primary
MIN_EVIDENCE_TO_PROMOTE = 3    # pieces of evidence needed before an evidence-driven rise counts
MIN_EVIDENCE_DAYS_TO_PROMOTE = 3

WEIGHTS = {"interest": 0.45, "aptitude": 0.30, "academic": 0.15, "personality": 0.10}


# ------------------------------------------------------------------ baseline
def _interest_match(student: dict, career: dict):
    total = sum(career.values())
    if not total:
        return None
    return sum(w * student.get(d, 0.0) for d, w in career.items()) / total


def _aptitude_match(student: dict, required: dict):
    total = sum(required.values())
    if not total or not student:
        return None
    got = 0.0
    for a, req in required.items():
        got += req * min(1.0, student.get(a, 0.0) / max(req, 0.01))
    return got / total


def _academic_by_domain(records) -> dict:
    out: dict[str, list[float]] = {}
    for r in records:
        for d in SUBJECT_DOMAINS.get(r.subject.strip().lower(), []):
            out.setdefault(d, []).append(r.score_percent / 100)
    return {d: sum(v) / len(v) for d, v in out.items()}


def _personality_match(student: dict, hint: dict):
    if not student or not hint:
        return None
    diffs = [abs(student.get(t, 0.5) - v) for t, v in hint.items()]
    return 1 - sum(diffs) / len(diffs)


def baseline_score(career: m.Career, interests: dict, aptitude: dict, academics: dict, personality: dict) -> float:
    parts = {
        "interest": _interest_match(interests, career.interest_profile),
        "aptitude": _aptitude_match(aptitude, career.aptitude_profile),
        "academic": _interest_match(academics, career.interest_profile) if academics else None,
        "personality": _personality_match(personality, career.personality_hint),
    }
    used = {k: v for k, v in parts.items() if v is not None}
    if not used:
        return 0.0
    weight_sum = sum(WEIGHTS[k] for k in used)
    return sum(WEIGHTS[k] * v for k, v in used.items()) / weight_sum


def load_student_inputs(db: Session, user_id: int):
    interests = {i.domain: i.level for i in db.scalars(
        select(m.Interest).where(m.Interest.user_id == user_id).order_by(m.Interest.created_at))}
    apt = db.scalars(select(m.AptitudeResult).where(m.AptitudeResult.user_id == user_id)
                     .order_by(m.AptitudeResult.created_at.desc())).first()
    per = db.scalars(select(m.PersonalityResult).where(m.PersonalityResult.user_id == user_id)
                     .order_by(m.PersonalityResult.created_at.desc())).first()
    acad = db.scalars(select(m.AcademicRecord).where(m.AcademicRecord.user_id == user_id)).all()
    return interests, (apt.scores if apt else {}), _academic_by_domain(acad), (per.scores if per else {})


# ------------------------------------------------------------------ evidence
def add_evidence(db: Session, user_id: int, career_id: int, source_type: str,
                 direction: int = 1, strength: float = 1.0, note: str = "") -> m.CareerEvidence:
    if source_type not in EVIDENCE_WEIGHTS:
        raise ValueError(f"unknown evidence type: {source_type}")
    ev = m.CareerEvidence(user_id=user_id, career_id=career_id, source_type=source_type,
                          direction=1 if direction >= 0 else -1,
                          strength=max(0.0, min(1.0, strength)), note=note)
    db.add(ev)
    db.flush()
    return ev


def evidence_signal(evidence: list, today: date | None = None) -> tuple[float, int, int]:
    """Returns (signal, number of evidence items, number of distinct days)."""
    today = today or datetime.utcnow().date()
    # Per (type, day) we cap the contribution, so ten clicks in a day do not add up.
    buckets: dict[tuple, float] = {}
    for ev in evidence:
        day = ev.created_at.date()
        age = max(0, (today - day).days)
        decay = 0.5 ** (age / EVIDENCE_HALF_LIFE_DAYS)
        w = EVIDENCE_WEIGHTS[ev.source_type]
        key = (ev.source_type, day)
        buckets[key] = buckets.get(key, 0.0) + ev.direction * ev.strength * w * decay
    signal = 0.0
    for (stype, _), val in buckets.items():
        cap = EVIDENCE_WEIGHTS[stype]
        signal += max(-cap, min(cap, val))
    days = len({ev.created_at.date() for ev in evidence})
    return signal, len(evidence), days


def target_score(baseline: float, signal: float) -> float:
    shift = MAX_EVIDENCE_SHIFT * math.tanh(signal / 2.0)
    return max(0.0, min(1.0, baseline + shift))


# ------------------------------------------------------------------ levels
def confidence_level(score: float, evidence_count: int, evidence_days: int) -> str:
    if score >= 0.72 and evidence_count >= MIN_EVIDENCE_TO_PROMOTE and evidence_days >= MIN_EVIDENCE_DAYS_TO_PROMOTE:
        return "high"
    if score >= 0.5:
        return "moderate"
    return "emerging"


# ------------------------------------------------------------------ update
def recompute_scores(db: Session, user_id: int, today: date | None = None) -> list[m.CareerScore]:
    """Recalculate every career score for the student, applying the stability rule."""
    today = today or datetime.utcnow().date()
    interests, aptitude, academics, personality = load_student_inputs(db, user_id)
    careers = db.scalars(select(m.Career)).all()

    evidence_by_career: dict[int, list] = {}
    for ev in db.scalars(select(m.CareerEvidence).where(m.CareerEvidence.user_id == user_id)):
        evidence_by_career.setdefault(ev.career_id, []).append(ev)

    existing = {s.career_id: s for s in db.scalars(select(m.CareerScore).where(m.CareerScore.user_id == user_id))}
    result = []
    for c in careers:
        base = baseline_score(c, interests, aptitude, academics, personality)
        signal, n, days = evidence_signal(evidence_by_career.get(c.id, []), today)
        target = target_score(base, signal)

        row = existing.get(c.id)
        if row is None:
            # first time we score this career: start from the assessment baseline
            row = m.CareerScore(user_id=user_id, career_id=c.id, score=base, baseline=base,
                                day_anchor_score=base, anchor_date=today)
            db.add(row)
            new_score = target if n else base
            new_score = max(base - MAX_DAILY_STEP, min(base + MAX_DAILY_STEP, new_score))
        else:
            if row.anchor_date != today:
                row.day_anchor_score = row.score
                row.anchor_date = today
            lo, hi = row.day_anchor_score - MAX_DAILY_STEP, row.day_anchor_score + MAX_DAILY_STEP
            new_score = max(lo, min(hi, target))
        row.baseline = base
        row.score = max(0.0, min(1.0, new_score))
        row.evidence_count, row.evidence_days = n, days
        row.updated_at = datetime.utcnow()
        result.append(row)

    profile = db.scalars(select(m.CareerProfile).where(m.CareerProfile.user_id == user_id)).first()
    if profile is None:
        profile = m.CareerProfile(user_id=user_id)
        db.add(profile)
    profile.algorithm_version = ALGORITHM_VERSION
    profile.last_updated = datetime.utcnow()
    db.flush()
    return result


# ------------------------------------------------------------------ portfolio
def build_portfolio(db: Session, user_id: int, explore_mode: bool) -> dict:
    scores = db.scalars(select(m.CareerScore).where(m.CareerScore.user_id == user_id)).all()
    if not scores:
        return {"primary": None, "secondary": [], "emerging": [], "recommendation_allowed": not explore_mode}

    levelled = []
    for s in scores:
        levelled.append((s, confidence_level(s.score, s.evidence_count, s.evidence_days)))
    levelled.sort(key=lambda x: x[0].score, reverse=True)

    if explore_mode:
        # Explore-stage students are never given a "you should become X" answer.
        top = [(s, "emerging") for s, _ in levelled[:4]]
        return {"primary": None, "secondary": [], "recommendation_allowed": False,
                "emerging": [_entry(s, lv) for s, lv in top]}

    last_primary = _last_role_career(db, user_id, "primary")
    primary = None
    eligible = [(s, lv) for s, lv in levelled if lv in ("high", "moderate")]
    if eligible:
        primary = eligible[0]
        if last_primary is not None:
            prev = next(((s, lv) for s, lv in eligible if s.career_id == last_primary), None)
            if prev and eligible[0][0].score - prev[0].score < PRIMARY_SWITCH_MARGIN:
                primary = prev      # keep the current primary unless the challenger clearly wins

    rest = [(s, lv) for s, lv in levelled if not primary or s.id != primary[0].id]
    secondary = [(s, lv) for s, lv in rest if lv in ("high", "moderate")
                 and primary and s.score >= primary[0].score - 0.25][:2]
    sec_ids = {s.id for s, _ in secondary}
    emerging = [(s, "emerging") for s, lv in rest if s.id not in sec_ids and s.score >= 0.35][:3]

    return {
        "primary": _entry(*primary) if primary else None,
        "secondary": [_entry(s, lv) for s, lv in secondary],
        "emerging": [_entry(s, lv) for s, lv in emerging],
        "recommendation_allowed": True,
    }


def _entry(score: m.CareerScore, level: str) -> dict:
    return {"career_id": score.career_id, "career": score.career.name, "slug": score.career.slug,
            "confidence": level, "evidence_count": score.evidence_count}


def _last_role_career(db: Session, user_id: int, role: str):
    row = db.scalars(select(m.CareerHistory).where(m.CareerHistory.user_id == user_id,
                                                   m.CareerHistory.role == role)
                     .order_by(m.CareerHistory.created_at.desc(), m.CareerHistory.id.desc())).first()
    return row.career_id if row else None


def record_history(db: Session, user_id: int, portfolio: dict) -> None:
    """Write a history row whenever a career's role or level changes."""
    rows = []
    if portfolio["primary"]:
        rows.append(("primary", portfolio["primary"]))
    rows += [("secondary", e) for e in portfolio["secondary"]]
    rows += [("emerging", e) for e in portfolio["emerging"]]
    for role, e in rows:
        last = db.scalars(select(m.CareerHistory).where(m.CareerHistory.user_id == user_id,
                                                        m.CareerHistory.career_id == e["career_id"])
                          .order_by(m.CareerHistory.id.desc())).first()
        if last is None or last.role != role or last.level != e["confidence"]:
            why = "initial assessment" if last is None else f"changed from {last.role}/{last.level}"
            db.add(m.CareerHistory(user_id=user_id, career_id=e["career_id"], level=e["confidence"],
                                   role=role, reason=why))
    db.flush()


# ------------------------------------------------------------------ explanation
def explain(db: Session, user_id: int, entry: dict) -> dict:
    """What / why / evidence / confidence / what could change it."""
    interests, aptitude, _, _ = load_student_inputs(db, user_id)
    career = db.get(m.Career, entry["career_id"])
    why_parts, evidence = [], []

    shared = sorted(((d, interests.get(d, 0.0)) for d in career.interest_profile
                     if career.interest_profile[d] >= 0.5), key=lambda x: -x[1])
    strong = [d.replace("_", " ") for d, v in shared if v >= 0.65][:2]
    if strong:
        why_parts.append("you rated " + " and ".join(strong) + " highly, which this career draws on")
        evidence.append("self-reported interest in " + ", ".join(strong))
    apts = sorted(((a, aptitude.get(a, 0.0)) for a in career.aptitude_profile
                   if career.aptitude_profile[a] >= 0.5), key=lambda x: -x[1])
    strong_apt = [a for a, v in apts if v >= 0.65][:2]
    if strong_apt:
        why_parts.append("your " + " and ".join(strong_apt) + " aptitude results are a good fit")
        evidence.append("aptitude assessment: " + ", ".join(strong_apt))

    ev_rows = db.execute(select(m.CareerEvidence.source_type, func.count())
                         .where(m.CareerEvidence.user_id == user_id, m.CareerEvidence.career_id == entry["career_id"],
                                m.CareerEvidence.direction > 0)
                         .group_by(m.CareerEvidence.source_type)).all()
    for stype, cnt in ev_rows:
        evidence.append(f"{cnt} {stype} item(s) pointing to this direction")
    if ev_rows:
        why_parts.append("your activities over time point the same way")

    if not why_parts:
        why_parts.append("it overlaps with several of your answers, though the match is not strong")
    level = entry["confidence"]
    why = f"{entry['career']} is shown as {level} confidence because " + "; ".join(why_parts) + "."
    if entry["evidence_count"] == 0:
        why += " This is based on your assessments only, so treat it as a starting point."
    change = ("More projects, competitions or reflections that touch this field would strengthen it. "
              "Consistent activity in a different field, or reflections saying you enjoyed it less, would lower it gradually.")
    return {"what": entry["career"], "why": why, "evidence": evidence,
            "confidence": level, "what_could_change": change}


def remove_evidence_by_note(db: Session, user_id: int, note: str) -> int:
    """Used when a student deletes a journal entry or reflection: the evidence it produced goes too."""
    rows = db.scalars(select(m.CareerEvidence).where(m.CareerEvidence.user_id == user_id,
                                                     m.CareerEvidence.note == note)).all()
    for r in rows:
        db.delete(r)
    db.flush()
    return len(rows)


def entry_for(db: Session, user_id: int, career_id: int) -> dict | None:
    """Read-only: one career's current level for this student (used by the mentor and comparisons)."""
    s = db.scalars(select(m.CareerScore).where(m.CareerScore.user_id == user_id,
                                               m.CareerScore.career_id == career_id)).first()
    if s is None:
        return None
    return _entry(s, confidence_level(s.score, s.evidence_count, s.evidence_days))

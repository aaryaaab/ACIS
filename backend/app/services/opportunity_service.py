"""Opportunities already stored in the database. Never invents a listing, a deadline or eligibility."""
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models as m

KINDS = ["internship", "scholarship", "hackathon", "research"]
REVERIFY_AFTER_DAYS = 30
TIER = {"primary": 0, "secondary": 1, "emerging": 2}


def opportunity_out(o: m.Opportunity, src: m.Source | None, today: date) -> dict:
    if o.deadline is None:
        status, days_left = "no_deadline_listed", None
    elif o.deadline < today:
        status, days_left = "closed", (o.deadline - today).days
    else:
        status, days_left = "open", (o.deadline - today).days
    age = (today - o.verified_on).days if o.verified_on else None
    return {"id": o.id, "title": o.title, "kind": o.kind, "provider": o.provider, "eligibility": o.eligibility,
            "deadline": o.deadline.isoformat() if o.deadline else None, "status": status, "days_left": days_left,
            "url": o.url, "career_slugs": o.career_slugs,
            "verified_on": o.verified_on.isoformat() if o.verified_on else None, "verified_days_ago": age,
            "needs_reverification": age is None or age > REVERIFY_AFTER_DAYS,
            "verification_note": "Not verified yet" if age is None else
            f"Last verified {age} day(s) ago. Always confirm the deadline and eligibility on the provider's own page.",
            "source": {"name": src.name, "url": src.url} if src else None}


def list_for_student(db: Session, tiers: dict[str, str], kind: str | None = None, career: str | None = None,
                     include_closed: bool = False, include_unverified: bool = False,
                     today: date | None = None) -> list[dict]:
    today = today or date.today()
    q = select(m.Opportunity, m.Source).outerjoin(m.Source, m.Source.id == m.Opportunity.source_id)
    if kind:
        q = q.where(m.Opportunity.kind == kind)
    rows = []
    for o, src in db.execute(q):
        if career and career not in o.career_slugs:
            continue
        if not include_unverified and o.verified_on is None:
            continue
        if not include_closed and o.deadline is not None and o.deadline < today:
            continue
        hits = [TIER[tiers[s]] for s in o.career_slugs if s in tiers]
        tier = min(hits) if hits else 3
        rows.append((tier, o.deadline or date.max, o.id, opportunity_out(o, src, today)))
    rows.sort(key=lambda r: r[:3])
    return [r[3] for r in rows]

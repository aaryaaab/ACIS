"""
Career intelligence: market updates ALREADY SAVED in the database, each with its source and the date
it was retrieved. This module never writes anything and never produces facts of its own.
"""
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models as m

STALE_AFTER_DAYS = 60
TIER = {"primary": 0, "secondary": 1, "emerging": 2}


def source_out(src: m.Source | None) -> dict | None:
    if src is None:
        return None
    return {"name": src.name, "url": src.url, "licence": src.licence, "attribution": src.attribution,
            "last_verified": src.last_verified.isoformat() if src.last_verified else None}


def for_student(db: Session, tiers: dict[str, str], career: str | None = None, today: date | None = None) -> list[dict]:
    """tiers: {career_slug: "primary" | "secondary" | "emerging"} for this student."""
    today = today or date.today()
    names = {c.slug: c.name for c in db.scalars(select(m.Career))}
    rows = db.execute(select(m.MarketUpdate, m.Source).outerjoin(m.Source, m.Source.id == m.MarketUpdate.source_id)
                      .order_by(m.MarketUpdate.retrieved_on.desc(), m.MarketUpdate.id.desc())).all()
    items = []
    for upd, src in rows:
        tags = list(upd.career_slugs or [])
        if career:
            if career not in tags:
                continue
            tier, why = 0, f"Tagged for {names.get(career, career)}"
        else:
            hits = [(TIER[tiers[s]], s) for s in tags if s in tiers]
            if hits:
                best = min(hits)
                tier = best[0]
                label = [k for k, v in TIER.items() if v == best[0]][0]
                why = f"Tagged for {names.get(best[1], best[1])}, one of your {label} directions"
            elif not tags:
                tier, why = 3, "General update (not tagged to a specific career)"
            else:
                continue                      # tagged for careers that are not in this student's portfolio
        age = (today - upd.retrieved_on).days
        items.append({"id": upd.id, "title": upd.title, "summary": upd.summary, "url": upd.url,
                      "retrieved_on": upd.retrieved_on.isoformat(), "age_days": age,
                      "stale": age > STALE_AFTER_DAYS, "source": source_out(src), "why_shown": why,
                      "_tier": tier})
    items.sort(key=lambda x: (x["_tier"], x["age_days"]))
    for i in items:
        i.pop("_tier")
    return items

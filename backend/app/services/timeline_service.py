"""Career timeline: one chronological story built by READING the other tables."""
from datetime import date, datetime, time

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models as m

TYPES = ["assessment", "career", "project", "achievement", "reflection", "journal", "learning", "skill"]


def build(db: Session, user_id: int, types: set[str] | None = None, start: date | None = None,
          end: date | None = None) -> list[dict]:
    types = types or set(TYPES)
    lo = datetime.combine(start, time.min) if start else None
    hi = datetime.combine(end, time.max) if end else None
    events: list[dict] = []

    def add(kind, when, title, detail="", ref=None):
        if kind not in types or when is None:
            return
        if (lo and when < lo) or (hi and when > hi):
            return
        events.append({"type": kind, "at": when, "month": when.strftime("%Y-%m"), "title": title,
                       "detail": detail, "ref": ref})

    for a in db.scalars(select(m.AptitudeResult).where(m.AptitudeResult.user_id == user_id)):
        add("assessment", a.created_at, "Completed an assessment", "Interests, aptitude and personality items")

    for h, name in db.execute(select(m.CareerHistory, m.Career.name).join(m.Career, m.Career.id == m.CareerHistory.career_id)
                              .where(m.CareerHistory.user_id == user_id)):
        verb = {"primary": "became a primary direction", "secondary": "became a secondary direction",
                "emerging": "showed up as an emerging interest"}[h.role]
        add("career", h.created_at, f"{name} {verb}", f"Confidence: {h.level}. {h.reason}.", {"career": name})

    for p in db.scalars(select(m.Project).where(m.Project.user_id == user_id)):
        add("project", p.started_at, f"Started project: {p.title}", "", {"project_id": p.id})
        if p.completed_at:
            add("project", p.completed_at, f"Completed project: {p.title}",
                "Added to portfolio" if p.in_portfolio else "", {"project_id": p.id})

    for a in db.scalars(select(m.Achievement).where(m.Achievement.user_id == user_id)):
        add("achievement", datetime.combine(a.achieved_on, time(12)), f"{a.kind.title()}: {a.title}", a.description)

    for r in db.scalars(select(m.Reflection).where(m.Reflection.user_id == user_id)):
        detail = "Said their interests have changed" if r.interests_changed == "yes" else ""
        add("reflection", r.created_at, "Wrote a reflection", detail, {"reflection_id": r.id})

    for j in db.scalars(select(m.JournalEntry).where(m.JournalEntry.user_id == user_id)):
        fields = sorted(j.extracted.get("domains", {}))
        add("journal", j.created_at, "Wrote a journal entry",
            ("Touched on: " + ", ".join(f.replace("_", " ") for f in fields)) if fields else "", {"journal_id": j.id})

    for fb, title in db.execute(select(m.ResourceFeedback, m.Resource.title).join(m.Resource, m.Resource.id == m.ResourceFeedback.resource_id)
                                .where(m.ResourceFeedback.user_id == user_id, m.ResourceFeedback.status != "started")):
        verb = "Completed" if fb.status == "completed" else "Stopped"
        add("learning", fb.created_at, f"{verb}: {title}")

    for ss, skill in db.execute(select(m.StudentSkill, m.Skill).join(m.Skill, m.Skill.id == m.StudentSkill.skill_id)
                                .where(m.StudentSkill.user_id == user_id)):
        add("skill", ss.updated_at, f"Skill updated: {skill.name} (level {ss.level} of 5)")

    events.sort(key=lambda e: e["at"], reverse=True)
    return events

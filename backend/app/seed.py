"""Loads the CSV/JSON files in /datasets into the database. Safe to run more than once."""
import csv
import json
from datetime import date
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models as m
from app.services.embeddings import embed

DATA_DIR = Path(__file__).resolve().parents[2] / "datasets"


def _csv(name):
    with open(DATA_DIR / name, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _date(text):
    return date.fromisoformat(text) if text else None


def seed(db: Session, data_dir: Path | None = None) -> dict:
    global DATA_DIR
    if data_dir:
        DATA_DIR = data_dir

    sources = {}
    for s in json.load(open(DATA_DIR / "sources.json", encoding="utf-8")):
        row = db.scalars(select(m.Source).where(m.Source.name == s["name"])).first() or m.Source(name=s["name"])
        row.url, row.licence, row.attribution = s["url"], s["licence"], s["attribution"]
        row.last_verified, row.note = _date(s["last_verified"]), s["note"]
        db.add(row)
        db.flush()
        sources[s["key"]] = row.id

    skills = {}
    for r in _csv("skills.csv"):
        row = db.scalars(select(m.Skill).where(m.Skill.slug == r["slug"])).first() or m.Skill(slug=r["slug"])
        row.name, row.category, row.source_id = r["name"], r["category"], sources[r["source_key"]]
        db.add(row)
        db.flush()
        skills[r["slug"]] = row.id

    degrees = {}
    for r in _csv("degrees.csv"):
        row = db.scalars(select(m.Degree).where(m.Degree.name == r["name"])).first() or m.Degree(name=r["name"])
        row.level, row.entrance_exams = r["level"], r["entrance_exams"]
        db.add(row)
        db.flush()
        degrees[r["slug"]] = row.id

    careers = {}
    for c in json.load(open(DATA_DIR / "careers.json", encoding="utf-8")):
        row = db.scalars(select(m.Career).where(m.Career.slug == c["slug"])).first() or m.Career(slug=c["slug"])
        row.name, row.description, row.pathway = c["name"], c["description"], c["pathway"]
        row.interest_profile, row.aptitude_profile, row.personality_hint = c["interest"], c["apt"], c["pers"]
        row.source_id = sources["acis_curated"]
        row.embedding = embed(f"{c['name']}. {c['description']}")
        db.add(row)
        db.flush()
        careers[c["slug"]] = row.id
        for slug, (importance, level) in c["skills"].items():
            if slug not in skills:
                raise ValueError(f"career {c['slug']} uses unknown skill {slug}")
            link = db.get(m.CareerSkill, (row.id, skills[slug])) or m.CareerSkill(career_id=row.id, skill_id=skills[slug])
            link.importance, link.level_required = importance, level
            db.add(link)
        for d in c["degrees"]:
            if d not in degrees:
                raise ValueError(f"career {c['slug']} uses unknown degree {d}")
            if db.get(m.CareerDegree, (row.id, degrees[d])) is None:
                db.add(m.CareerDegree(career_id=row.id, degree_id=degrees[d]))

    resources = 0
    for r in _csv("resources.csv"):
        row = db.scalars(select(m.Resource).where(m.Resource.title == r["title"])).first() or m.Resource(title=r["title"])
        row.provider, row.url, row.kind = r["provider"], r["url"], r["kind"]
        row.difficulty, row.duration_hours = int(r["difficulty"]), float(r["duration_hours"])
        row.session_minutes, row.theory_level = int(r["session_minutes"]), float(r["theory_level"])
        row.cost, row.last_verified, row.source_id = r["cost"], _date(r["last_verified"]), sources[r["source_key"]]
        row.embedding = embed(row.title)
        db.add(row)
        db.flush()
        for slug in r["skills"].split(";"):
            if slug not in skills:
                raise ValueError(f"resource {r['slug']} uses unknown skill {slug}")
            if db.get(m.ResourceSkill, (row.id, skills[slug])) is None:
                db.add(m.ResourceSkill(resource_id=row.id, skill_id=skills[slug]))
        resources += 1

    for r in _csv("project_ideas.csv"):
        row = db.scalars(select(m.ProjectIdea).where(m.ProjectIdea.title == r["title"])).first() or m.ProjectIdea(title=r["title"])
        row.description, row.difficulty, row.est_hours = r["description"], int(r["difficulty"]), int(r["est_hours"])
        row.skill_slugs, row.career_slugs = r["skills"].split(";"), r["careers"].split(";")
        for slug in row.skill_slugs:
            if slug not in skills:
                raise ValueError(f"project {r['title']} uses unknown skill {slug}")
        for slug in row.career_slugs:
            if slug not in careers:
                raise ValueError(f"project {r['title']} uses unknown career {slug}")
        db.add(row)

    opp = 0
    for r in _csv("opportunities.csv"):
        if not r["url"] or not r["verified_on"]:
            continue          # never load an opportunity without a source URL and a verification date
        row = db.scalars(select(m.Opportunity).where(m.Opportunity.title == r["title"],
                                                      m.Opportunity.provider == r["provider"])).first() or m.Opportunity(
            title=r["title"], provider=r["provider"])
        row.kind, row.eligibility, row.deadline = r["kind"], r["eligibility"], _date(r["deadline"])
        row.url, row.verified_on, row.career_slugs = r["url"], _date(r["verified_on"]), r["careers"].split(";")
        row.source_id = sources.get(r["source_key"])
        row.embedding = embed(f"{r['title']} {r['eligibility']}")
        db.add(row)
        opp += 1

    mu = 0
    for r in _csv("market_updates.csv"):
        if not r["url"] or not r["retrieved_on"]:
            continue
        db.add(m.MarketUpdate(title=r["title"], summary=r["summary"], url=r["url"],
                              retrieved_on=_date(r["retrieved_on"]), career_slugs=r["careers"].split(";"),
                              source_id=sources.get(r["source_key"]), embedding=embed(r["title"])))
        mu += 1

    db.commit()
    return {"careers": len(careers), "skills": len(skills), "degrees": len(degrees),
            "resources": resources, "opportunities": opp, "market_updates": mu}

"""
Orchestrator: explicit, auditable workflows that connect the three models.

Rules this file follows:
  * Career scores are written only through career_model.
  * Learning feedback goes only to learning_model. It is NEVER turned into career evidence.
  * Growth events (completed projects, achievements) go to growth_model first; then, as a separate
    visible step, may be passed to the career model as ordinary evidence (which is rate-limited).
Every workflow writes an agent_runs row so it can be inspected later.
"""
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models as m
from app.assessment_bank import score_aptitude, score_personality
from app.domain import ALGORITHM_VERSION, KNOWLEDGE_BASE_VERSION
from app.services import career_model, growth_model, learning_model, memory_service
from app.services.skill_gap import skill_gap


def log_run(db: Session, user_id: int, agent: str, inputs: dict, outputs: dict, llm_used: bool = False):
    db.add(m.AgentRun(user_id=user_id, agent=agent, input_summary=inputs, output_summary=outputs, llm_used=llm_used))


# ------------------------------------------------------------------ onboarding
def stage_from_education(level: str) -> str:
    level = level.lower()
    if level in ("class_8", "class_9", "class_10"):
        return "explore"
    if level in ("class_11", "class_12"):
        return "decide"
    if level in ("btech_1", "btech_2", "college_1", "college_2"):
        return "learn"
    if level in ("btech_3", "college_3"):
        return "build"
    if level in ("btech_4", "college_4", "graduate"):
        return "launch"
    if level == "working":
        return "grow"
    return "explore"


def age_on(dob: date, today: date | None = None) -> int:
    today = today or date.today()
    return today.year - dob.year - ((today.month, today.day) < (dob.month, dob.day))


def finish_onboarding(db: Session, user: m.User, data) -> m.StudentProfile:
    is_minor = age_on(data.date_of_birth) < 18
    if is_minor and not data.guardian_consent:
        raise PermissionError("A parent or guardian must consent before a student under 18 can continue.")
    profile = db.scalars(select(m.StudentProfile).where(m.StudentProfile.user_id == user.id)).first()
    if profile is None:
        profile = m.StudentProfile(user_id=user.id)
        db.add(profile)
    profile.date_of_birth, profile.is_minor, profile.guardian_consent = data.date_of_birth, is_minor, data.guardian_consent
    profile.education_level, profile.institution, profile.city = data.education_level, data.institution, data.city
    profile.long_term_goal, profile.lifestyle, profile.financial_context = data.long_term_goal, data.lifestyle, data.financial_context
    profile.stage = data.stage if data.stage in ("explore", "decide", "learn", "build", "launch", "grow") \
        else stage_from_education(data.education_level)
    profile.onboarding_done = True

    db.query(m.AcademicRecord).filter_by(user_id=user.id).delete()
    for subject, score in data.academics.items():
        db.add(m.AcademicRecord(user_id=user.id, subject=subject, score_percent=score))

    memory_service.add_memory(db, user.id, "stable", f"Education level: {data.education_level}. Stage: {profile.stage}.",
                              source="onboarding", confidence=1.0, importance=0.8)
    if data.long_term_goal.strip():
        memory_service.add_memory(db, user.id, "stable", f"Long-term goal (in the student's words): {data.long_term_goal.strip()}",
                                  source="onboarding", confidence=0.9, importance=0.9)
    db.flush()
    return profile


# ------------------------------------------------------------------ assessment
def run_assessment(db: Session, user: m.User, profile: m.StudentProfile, data, rapid: bool = False) -> dict:
    db.query(m.Interest).filter_by(user_id=user.id).delete()
    for domain, rating in data.interests.items():
        db.add(m.Interest(user_id=user.id, domain=domain, level=round((rating - 1) / 4, 2)))
    aptitude = score_aptitude(data.aptitude_answers, data.creative)
    personality = score_personality(data.personality)
    db.add(m.AptitudeResult(user_id=user.id, scores=aptitude))
    db.add(m.PersonalityResult(user_id=user.id, scores=personality))
    db.flush()

    if rapid:
        profile.rapid_mode_used = True
        if profile.stage == "explore":
            profile.stage = "decide"         # they asked for a decision, so we treat them as deciding

    memory_service.add_memory(db, user.id, "episodic",
                              f"Completed the {'rapid ' if rapid else ''}assessment on {date.today().isoformat()}.",
                              source="assessment", confidence=1.0, importance=0.6)
    top = sorted(data.interests.items(), key=lambda x: -x[1])[:3]
    memory_service.add_memory(db, user.id, "evolving", "Top self-reported interests: " + ", ".join(d.replace("_", " ") for d, _ in top),
                              source="assessment", confidence=0.6, importance=0.7, tags=[d for d, _ in top])

    result = refresh_career_profile(db, user, profile, rapid=rapid)
    log_run(db, user.id, "discovery", {"rapid": rapid}, {"aptitude": aptitude})
    return {"aptitude": aptitude, "personality": personality, **result}


def explore_mode(profile: m.StudentProfile) -> bool:
    return profile.stage == "explore" and not profile.rapid_mode_used


def refresh_career_profile(db: Session, user: m.User, profile: m.StudentProfile, rapid: bool = False) -> dict:
    career_model.recompute_scores(db, user.id)
    cp = db.scalars(select(m.CareerProfile).where(m.CareerProfile.user_id == user.id)).one()
    cp.explore_mode = explore_mode(profile)
    portfolio = career_model.build_portfolio(db, user.id, cp.explore_mode)
    career_model.record_history(db, user.id, portfolio)
    recs = log_career_recommendations(db, user.id, portfolio)
    out = {"portfolio": portfolio, "recommendation_ids": recs}
    if rapid and portfolio["primary"]:
        out["rapid"] = rapid_plan(db, user.id, portfolio)
    log_run(db, user.id, "career_modeling", {"rapid": rapid}, {"primary": (portfolio["primary"] or {}).get("slug")})
    return out


def log_career_recommendations(db: Session, user_id: int, portfolio: dict) -> dict:
    """Research log: one row per primary/secondary recommendation (not duplicated within a day)."""
    from app.services.career_model import load_student_inputs
    ids = {}
    interests, aptitude, _, _ = load_student_inputs(db, user_id)
    today = datetime.utcnow().date()
    entries = ([portfolio["primary"]] if portfolio["primary"] else []) + portfolio["secondary"]
    for e in entries:
        existing = db.scalars(select(m.Recommendation).where(
            m.Recommendation.user_id == user_id, m.Recommendation.kind == "career",
            m.Recommendation.target_id == e["career_id"], m.Recommendation.confidence == e["confidence"])
            .order_by(m.Recommendation.id.desc())).first()
        if existing and existing.created_at.date() == today:
            ids[e["slug"]] = existing.id
            continue
        ex = career_model.explain(db, user_id, e)
        rec = m.Recommendation(user_id=user_id, kind="career", target_id=e["career_id"], target_label=e["career"],
                               confidence=e["confidence"], explanation=ex["why"], what_could_change=ex["what_could_change"],
                               input_evidence={"interests": interests, "aptitude": aptitude,
                                               "evidence_items": e["evidence_count"], "evidence_list": ex["evidence"]},
                               algorithm_version=ALGORITHM_VERSION, model_version="rule-based (no LLM)",
                               knowledge_base_version=KNOWLEDGE_BASE_VERSION)
        db.add(rec)
        db.flush()
        ids[e["slug"]] = rec.id
    return ids


def rapid_plan(db: Session, user_id: int, portfolio: dict) -> dict:
    def pathway(entry):
        career = db.get(m.Career, entry["career_id"])
        degrees = db.execute(select(m.Degree).join(m.CareerDegree, m.CareerDegree.degree_id == m.Degree.id)
                             .where(m.CareerDegree.career_id == career.id)).scalars().all()
        gaps = [g for g in skill_gap(db, user_id, career.id) if g["gap"] > 0][:3]
        return {"career": career.name, "confidence": entry["confidence"], "pathway": career.pathway,
                "degrees": [{"name": d.name, "entrance_exams": d.entrance_exams} for d in degrees],
                "first_skills": [g["skill"] for g in gaps]}
    primary = pathway(portfolio["primary"])
    secondary = [pathway(e) for e in portfolio["secondary"][:1]]
    steps = ["Read the pathway for your primary direction and check each entrance exam's official website for dates.",
             f"Start one small beginner project that uses: {', '.join(primary['first_skills']) or 'your current skills'}.",
             "Talk to one person working in this field and one in your secondary direction.",
             "Come back in a few weeks and write a short reflection on what you enjoyed. ACIS will keep refining this."]
    return {"primary": primary, "secondary": secondary, "next_steps": steps,
            "note": "This is a starting direction based on your assessment, not a prediction. ACIS now continues as your long-term mentor."}


# ------------------------------------------------------------------ feedback loops
def career_feedback(db: Session, user: m.User, rec: m.Recommendation, helpful: bool,
                    relevance: int | None, comment: str) -> m.RecommendationFeedback:
    fb = m.RecommendationFeedback(recommendation_id=rec.id, user_id=user.id, helpful=helpful,
                                  relevance=relevance, comment=comment)
    db.add(fb)
    if rec.kind == "career" and rec.target_id:
        # Mild evidence only. The career model's stability rule still limits the effect.
        career_model.add_evidence(db, user.id, rec.target_id, "activity", direction=1 if helpful else -1,
                                  strength=0.5, note="feedback on a recommendation")
        profile = db.scalars(select(m.StudentProfile).where(m.StudentProfile.user_id == user.id)).first()
        refresh_career_profile(db, user, profile)
    db.flush()
    return fb


def resource_feedback(db: Session, user: m.User, resource: m.Resource, status: str,
                      rating: int | None, comment: str) -> dict:
    """Learning events go to the Learning Model ONLY."""
    fb = learning_model.record_feedback(db, user.id, resource, status, rating, comment)
    prefs = learning_model.get_preferences(db, user.id)
    log_run(db, user.id, "learning", {"resource": resource.title, "status": status}, {"preferences": prefs})
    return {"feedback_id": fb.id, "preferences": prefs}


def complete_project(db: Session, user: m.User, project: m.Project) -> dict:
    growth_model.complete_project(db, user.id, project)
    # Separate, visible step: a finished project is evidence of sustained engagement.
    touched = []
    if project.skill_slugs:
        for career in db.scalars(select(m.Career)):
            required = {s for (s,) in db.execute(select(m.Skill.slug).join(m.CareerSkill, m.CareerSkill.skill_id == m.Skill.id)
                                                 .where(m.CareerSkill.career_id == career.id))}
            overlap = len(required & set(project.skill_slugs)) / len(project.skill_slugs)
            if overlap >= 0.5:
                career_model.add_evidence(db, user.id, career.id, "project", strength=round(0.5 + 0.5 * overlap, 2),
                                          note=f"completed project: {project.title}")
                touched.append(career.slug)
    profile = db.scalars(select(m.StudentProfile).where(m.StudentProfile.user_id == user.id)).first()
    memory_service.add_memory(db, user.id, "episodic", f"Completed project: {project.title}", source="growth",
                              confidence=1.0, importance=0.7, tags=project.skill_slugs)
    if touched:
        refresh_career_profile(db, user, profile)
    log_run(db, user.id, "growth", {"project": project.title}, {"career_evidence_added_for": touched})
    return {"career_evidence_for": touched}


# ------------------------------------------------------------------ journals, reflections, voice
from app.services import journal_service  # noqa: E402
from app.services.embeddings import embed  # noqa: E402


def _careers_strong_in(db: Session, domain: str, minimum: float = 0.8) -> list[m.Career]:
    return [c for c in db.scalars(select(m.Career)) if c.interest_profile.get(domain, 0) >= minimum]


def _pass_evidence(db: Session, user_id: int, wanted: dict, source_type: str, note: str) -> list[str]:
    """wanted: {career_id: (direction, strength)} -> career evidence rows. Returns career slugs touched."""
    touched = []
    for career_id, (direction, strength) in wanted.items():
        career_model.add_evidence(db, user_id, career_id, source_type, direction, strength, note)
        touched.append(db.get(m.Career, career_id).slug)
    return touched


def journal_entry(db: Session, user: m.User, profile: m.StudentProfile, text: str) -> tuple[m.JournalEntry, list[str]]:
    analysis = journal_service.analyse(db, text)
    entry = m.JournalEntry(user_id=user.id, text=text, extracted=analysis, embedding=embed(text))
    db.add(entry)
    db.flush()

    wanted: dict[int, tuple[int, float]] = {}
    for domain, counts in analysis["domains"].items():
        direction = journal_service.net_direction(counts)
        if direction == 0:
            continue                       # neutral mentions are remembered but not used as evidence
        strength = min(1.0, 0.4 + 0.2 * max(counts["positive"], counts["negative"]))
        for c in _careers_strong_in(db, domain):
            if c.id not in wanted or strength > wanted[c.id][1]:
                wanted[c.id] = (direction, strength)
    touched = _pass_evidence(db, user.id, wanted, "journal", f"journal:{entry.id}")

    tags = sorted(analysis["domains"]) + analysis["skills"]
    if tags:
        names = ", ".join(t.replace("_", " ") for t in tags)
        memory_service.add_memory(db, user.id, "episodic", f"Wrote a journal entry that touched on: {names}.",
                                  source=f"journal:{entry.id}", confidence=0.6, importance=0.4, tags=tags)
    if touched:
        refresh_career_profile(db, user, profile)
    log_run(db, user.id, "journal", {"chars": len(text)}, {"domains": sorted(analysis["domains"]), "careers_touched": touched})
    return entry, touched


def delete_journal(db: Session, user: m.User, profile: m.StudentProfile, entry: m.JournalEntry) -> None:
    note = f"journal:{entry.id}"
    db.query(m.VoiceEntry).filter_by(journal_entry_id=entry.id).delete()
    removed = career_model.remove_evidence_by_note(db, user.id, note)
    db.query(m.Memory).filter_by(user_id=user.id, source=note).delete()
    db.delete(entry)
    db.flush()
    if removed:
        refresh_career_profile(db, user, profile)


def voice_entry(db: Session, user: m.User, profile: m.StudentProfile, transcript: str) -> tuple[m.VoiceEntry, m.JournalEntry, list[str]]:
    entry, touched = journal_entry(db, user, profile, transcript)
    voice = m.VoiceEntry(user_id=user.id, transcript=transcript, journal_entry_id=entry.id)
    db.add(voice)
    db.flush()
    return voice, entry, touched


def reflection(db: Session, user: m.User, profile: m.StudentProfile, data, career_by_slug: dict) -> tuple[m.Reflection, list[str]]:
    """Explicit mentions count more than careers inferred from the free text."""
    wanted: dict[int, tuple[int, float]] = {}
    for domain in journal_service.domains_mentioned(data.enjoyed):
        for c in _careers_strong_in(db, domain):
            wanted[c.id] = (1, 0.3)
    for domain in journal_service.domains_mentioned(data.disliked):
        for c in _careers_strong_in(db, domain):
            wanted[c.id] = (-1, 0.3)
    for mention in data.related_careers:
        wanted[career_by_slug[mention.slug].id] = (1 if mention.feeling == "enjoyed" else -1, 0.6)

    text = " ".join([data.enjoyed, data.disliked, data.surprised])
    ref = m.Reflection(user_id=user.id, enjoyed=data.enjoyed, disliked=data.disliked, surprised=data.surprised,
                       interests_changed=data.interests_changed,
                       related_careers=[{"slug": r.slug, "feeling": r.feeling} for r in data.related_careers],
                       embedding=embed(text))
    db.add(ref)
    db.flush()
    touched = _pass_evidence(db, user.id, wanted, "reflection", f"reflection:{ref.id}")

    liked = [db.get(m.Career, c).name for c, (d, _) in wanted.items() if d > 0]
    disliked = [db.get(m.Career, c).name for c, (d, _) in wanted.items() if d < 0]
    summary = "Reflection recorded."
    if liked:
        summary += " Enjoyed things related to: " + ", ".join(liked[:4]) + "."
    if disliked:
        summary += " Disliked things related to: " + ", ".join(disliked[:4]) + "."
    memory_service.add_memory(db, user.id, "episodic", summary, source=f"reflection:{ref.id}",
                              confidence=0.7, importance=0.6, tags=touched[:8])
    if data.interests_changed == "yes":
        memory_service.add_memory(db, user.id, "evolving",
                                  "Student said their interests have changed recently. Worth re-checking in the next assessment.",
                                  source=f"reflection:{ref.id}", confidence=0.7, importance=0.8)
    if touched:
        refresh_career_profile(db, user, profile)
    log_run(db, user.id, "reflection", {"explicit": len(data.related_careers)}, {"careers_touched": touched})
    return ref, touched


def delete_reflection(db: Session, user: m.User, profile: m.StudentProfile, ref: m.Reflection) -> None:
    note = f"reflection:{ref.id}"
    removed = career_model.remove_evidence_by_note(db, user.id, note)
    db.query(m.Memory).filter_by(user_id=user.id, source=note).delete()
    db.delete(ref)
    db.flush()
    if removed:
        refresh_career_profile(db, user, profile)


# ------------------------------------------------------------------ roadmaps
from app.services import roadmap_service  # noqa: E402


def generate_roadmap(db: Session, user: m.User, profile: m.StudentProfile, career: m.Career, title: str | None):
    """Builds a roadmap and logs each resource/project pick in the research log (recommendations table)."""
    road, notes = roadmap_service.build(db, user.id, career, title)
    if road is None:
        return None, []
    rec_ids = []
    for n in notes:
        rec = m.Recommendation(user_id=user.id, kind=n["kind"], target_id=n["target_id"], target_label=n["label"],
                               explanation=n["explanation"], what_could_change="Your skill levels and learning feedback.",
                               input_evidence={"roadmap_id": road.id, "roadmap_item_id": n["item_id"],
                                               "career": career.slug, "style_fit": n.get("fit")},
                               algorithm_version=ALGORITHM_VERSION, model_version="rule-based (no LLM)",
                               knowledge_base_version=KNOWLEDGE_BASE_VERSION)
        db.add(rec)
        db.flush()
        rec_ids.append({"roadmap_item_id": n["item_id"], "recommendation_id": rec.id})
    log_run(db, user.id, "roadmap", {"career": career.slug}, {"items": len(road.items)})
    return road, rec_ids


def roadmap_item_done(db: Session, user: m.User, item: m.RoadmapItem, done: bool) -> None:
    """Ticking a resource item counts as completing it, which is a LEARNING event only."""
    first_time = done and not item.done
    item.done = done
    if first_time and item.kind == "resource" and item.ref_id:
        resource = db.get(m.Resource, item.ref_id)
        already = db.scalars(select(m.ResourceFeedback).where(
            m.ResourceFeedback.user_id == user.id, m.ResourceFeedback.resource_id == item.ref_id,
            m.ResourceFeedback.status == "completed")).first()
        if resource and not already:
            resource_feedback(db, user, resource, "completed", None, "marked done on roadmap")
    db.flush()

"""
AI Mentor.

Two ways to answer:
  1. LLM (optional): Ollama or any OpenAI-compatible endpoint, given ONLY facts from our database.
  2. Rule-based fallback (default): assembles the answer from the same facts. No API key needed.

The mentor only READS the career, learning and growth models. It never changes them.
Its own writes are limited to the conversation and a short-lived "temporary" memory.
"""
import re
from datetime import date

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models as m
from app.services import (career_model, intelligence_service, llm, memory_service, opportunity_service,
                          recommenders)
from app.services.skill_gap import skill_gap

# Verified against public Government of India sources on 2026-11-17. Re-check before launch.
CRISIS_WORDS = ["suicide", "kill myself", "end my life", "want to die", "self harm", "self-harm",
                "hurt myself", "no reason to live", "end it all"]
CRISIS_REPLY = (
    "I'm really sorry you're going through this, and I'm glad you told me. This is more important than any "
    "career question, and it is not something I should try to handle on my own.\n\n"
    "Please talk to someone right now: a parent, a teacher, a friend, or a counsellor you trust. In India you can "
    "call Tele-MANAS, a free 24x7 government helpline, on 14416 or 1-800-891-4416. If you are in immediate "
    "danger, call 112.\n\n"
    "We can come back to your plans whenever you feel ready. There is no hurry.")

ALIASES = {
    "ai_ml_engineer": ["ai engineer", "ml engineer", "machine learning engineer", "machine learning", "ai", "ml"],
    "ux_designer": ["ui ux designer", "ux designer", "ui designer", "ux", "ui", "designer", "design"],
    "doctor": ["doctor", "mbbs", "medicine"],
    "chartered_accountant": ["chartered accountant", "accountant", "ca"],
    "software_engineer": ["software engineer", "software developer", "developer", "programmer", "software"],
    "data_scientist": ["data scientist", "data science"],
    "robotics_engineer": ["robotics engineer", "robotics"],
    "mechanical_engineer": ["mechanical engineer", "mechanical"],
    "lawyer": ["lawyer", "law"],
    "journalist": ["journalist", "journalism", "media"],
    "teacher_educator": ["teacher", "teaching", "educator"],
    "entrepreneur": ["entrepreneur", "startup", "founder"],
    "business_analyst": ["business analyst", "management analyst", "analyst"],
    "cybersecurity_analyst": ["cybersecurity analyst", "cybersecurity", "cyber security", "security analyst"],
    "biotech_researcher": ["biotechnology researcher", "biotech", "biotechnology", "researcher"],
    "electronics_embedded": ["embedded engineer", "embedded", "electronics"],
}
LEVEL_TEXT = {"high": "High confidence", "moderate": "Moderate confidence",
              "emerging": "Emerging (not enough evidence yet)", None: "not assessed yet"}


# ------------------------------------------------------------------ understanding the question
def careers_mentioned(db: Session, text: str) -> list[m.Career]:
    lower = " " + re.sub(r"[^a-z0-9+ ]", " ", text.lower()) + " "
    found: list[tuple[int, m.Career]] = []
    for c in db.scalars(select(m.Career)):
        names = [c.name.lower(), c.slug.replace("_", " ")] + ALIASES.get(c.slug, [])
        best = None
        for n in sorted(set(names), key=len, reverse=True):
            pos = lower.find(f" {n} ")
            if pos >= 0:
                best = pos
                break
        if best is not None:
            found.append((best, c))
    found.sort(key=lambda x: x[0])
    return [c for _, c in found]


def detect_intent(text: str, mentioned: int) -> str:
    t = text.lower()
    if any(w in t for w in CRISIS_WORDS):
        return "support"
    if re.search(r"what (do you|did you) (remember|know)|remember about me|know about me", t):
        return "memory"
    if re.search(r"\bcompar|\bvs\b|\bversus\b|difference between", t):
        return "compare"                       # even with no career named: we will ask which two
    if re.search(r"\bor\b.*\bwhich\b|better than", t) and mentioned >= 1:
        return "compare"
    if re.search(r"\bwhy\b.*(recommend|suggest|show|primary|career|direction)|how did you (pick|choose|decide)", t):
        return "why"
    if re.search(r"internship|scholarship|hackathon|opportunit|fellowship", t):
        return "opportunities"
    if re.search(r"\bnews\b|trend|latest|market|demand|emerging tech", t):
        return "intelligence"
    if re.search(r"\bproject|portfolio|build something|what can i build", t):
        return "projects"
    if re.search(r"\blearn|course|resource|study|skill|roadmap|what should i (read|watch)|where do i start|get started", t):
        return "learn"
    if re.search(r"confus|not sure|unsure|don'?t know|which career|what should i (become|do|choose)|help me (choose|decide)|"
                 r"can'?t decide|what career|am i (good|suited)|fit for me", t):
        return "decide"
    return "general"


# ------------------------------------------------------------------ facts used in answers
def _kb_source(db: Session, career: m.Career) -> dict:
    src = db.get(m.Source, career.source_id) if career.source_id else None
    return {"type": "career_knowledge_base", "name": src.name if src else "unknown",
            "verified": bool(src and src.last_verified)}


def _tiers(portfolio: dict) -> dict[str, str]:
    t = {}
    if portfolio.get("primary"):
        t[portfolio["primary"]["slug"]] = "primary"
    for e in portfolio.get("secondary", []):
        t[e["slug"]] = "secondary"
    for e in portfolio.get("emerging", []):
        t.setdefault(e["slug"], "emerging")
    return t


def _focus_career(db: Session, portfolio: dict, mentioned: list[m.Career]) -> m.Career | None:
    if mentioned:
        return mentioned[0]
    if portfolio.get("primary"):
        return db.get(m.Career, portfolio["primary"]["career_id"])
    if portfolio.get("emerging"):
        return db.get(m.Career, portfolio["emerging"][0]["career_id"])
    return None


def _career_block(db: Session, user_id: int, c: m.Career) -> str:
    entry = career_model.entry_for(db, user_id, c.id)
    level = entry["confidence"] if entry else None
    missing = [g["skill"] for g in skill_gap(db, user_id, c.id) if g["gap"] > 0][:4]
    return (f"{c.name}: {c.description}\n"
            f"  Fit with your evidence so far: {LEVEL_TEXT[level]}.\n"
            f"  Typical route: {c.pathway}\n"
            f"  Skills you would still build: {', '.join(missing) if missing else 'none of the listed ones, you already meet them'}.")


# ------------------------------------------------------------------ rule-based answers
def _answer_compare(db, user, portfolio, mentioned):
    if len(mentioned) >= 2:
        a, b = mentioned[0], mentioned[1]
    elif len(mentioned) == 1 and portfolio.get("primary") and portfolio["primary"]["slug"] != mentioned[0].slug:
        a, b = mentioned[0], db.get(m.Career, portfolio["primary"]["career_id"])
    else:
        return ("Which two careers would you like me to compare? For example: “compare software engineer and "
                "UX designer”. I can compare any of the careers in my knowledge base."), []
    text = (f"Here is a side-by-side look at {a.name} and {b.name}, based on what I know about you.\n\n"
            f"{_career_block(db, user.id, a)}\n\n{_career_block(db, user.id, b)}\n\n"
            "This is a comparison, not a verdict. The fit levels only describe how much of your evidence points each way "
            "right now, and they can change. A low-cost way to learn more is to try a small project in each and "
            "notice which one you wanted to keep doing. Which of the two feels more like you today, and why?")
    return text, [_kb_source(db, a), _kb_source(db, b), {"type": "your_profile"}]


def _answer_why(db, user, portfolio, mentioned):
    c = _focus_career(db, portfolio, mentioned)
    if c is None:
        return "I don't have enough from you yet. Complete the assessment and I can explain what I see.", []
    entry = career_model.entry_for(db, user.id, c.id)
    ex = career_model.explain(db, user.id, entry)
    evidence = "\n".join(f"  - {e}" for e in ex["evidence"]) or "  - (nothing strong yet)"
    return (f"{ex['why']}\n\nWhat this is based on:\n{evidence}\n\nWhat could change it: {ex['what_could_change']}\n\n"
            "None of this is a prediction about your future. It is a snapshot that I will keep updating."), \
        [{"type": "your_profile"}, _kb_source(db, c)]


def _answer_learn(db, user, portfolio, mentioned):
    c = _focus_career(db, portfolio, mentioned)
    if c is None:
        return "Tell me a career you are curious about (or finish the assessment) and I will map out the skills to build.", []
    gaps = [g for g in skill_gap(db, user.id, c.id) if g["gap"] > 0][:3]
    if not gaps:
        return f"You already meet the listed skill levels for {c.name}. A good next step is a portfolio project.", [_kb_source(db, c)]
    recs = recommenders.recommend_resources(db, user.id, c.id, limit=3)
    lines = [f"For {c.name}, these are the skills where you have the biggest gap:"]
    lines += [f"  - {g['skill']} (you are at level {g['current_level']}, the role usually needs about {g['required_level']})" for g in gaps]
    if recs:
        lines.append("\nResources that fit how you learn best, and cover those gaps:")
        for r in recs:
            res = r["resource"]
            note = "" if res.last_verified else " (link not verified yet, please check it)"
            lines.append(f"  - {res.title} by {res.provider}, a {res.kind} resource: {res.url}{note}")
    lines.append("\nI choose resources using your past feedback, so rate what you try and the suggestions get better.")
    return "\n".join(lines), [{"type": "your_skills_and_learning_style"}, _kb_source(db, c)]


def _answer_projects(db, user, portfolio, mentioned):
    c = _focus_career(db, portfolio, mentioned)
    ideas = recommenders.recommend_projects(db, user.id, c.slug if c else None, limit=3)
    if not ideas:
        return "I don't have a new project idea for that direction right now.", []
    lines = ["Here are projects to try, easiest first:" if c is None else f"Here are projects for {c.name}, easiest first:"]
    for x in ideas:
        i = x["idea"]
        lines.append(f"  - {i.title} (level {i.difficulty} of 3, about {i.est_hours} hours): {i.description}")
    lines.append("\nFinishing a project is one of the strongest signals I can learn from, so tell me when you complete one.")
    return "\n".join(lines), [{"type": "project_catalogue", "name": "ACIS curated sample"}]


def _answer_opportunities(db, user, portfolio, mentioned):
    c = mentioned[0].slug if mentioned else None
    items = opportunity_service.list_for_student(db, _tiers(portfolio), career=c)
    if not items:
        return ("I don't have any verified opportunities saved right now, and I won't guess or make any up. "
                "The most reliable places to look are the official pages of the organisations themselves, such as the "
                "college, the company or the government scheme. If you find one, tell me and I can help you decide "
                "whether it suits you."), []
    lines = ["These are the verified opportunities I have saved (always re-check the dates on the provider's page):"]
    for o in items[:3]:
        when = f"deadline {o['deadline']}" if o["deadline"] else "no deadline listed"
        lines.append(f"  - {o['title']} ({o['kind']}, {o['provider']}), {when}. Eligibility: {o['eligibility'] or 'not listed'}. "
                     f"Source: {o['url']}. {o['verification_note']}")
    return "\n".join(lines), [{"type": "opportunities", "name": o["provider"], "url": o["url"]} for o in items[:3]]


def _answer_intelligence(db, user, portfolio, mentioned):
    c = mentioned[0].slug if mentioned else None
    items = intelligence_service.for_student(db, _tiers(portfolio), career=c)
    if not items:
        return ("I don't have any saved market updates yet, so I can't tell you about current trends without guessing. "
                "Once updates from real sources are loaded I will show them with their source and date."), []
    lines = ["Here are the latest updates I have saved, each with its source and the date it was retrieved:"]
    for i in items[:3]:
        src = i["source"]["name"] if i["source"] else "unknown source"
        lines.append(f"  - {i['title']} ({src}, retrieved {i['retrieved_on']}): {i['url']}")
    return "\n".join(lines), [{"type": "market_update", "name": (i["source"] or {}).get("name"), "url": i["url"],
                               "retrieved_on": i["retrieved_on"]} for i in items[:3]]


def _answer_decide(db, user, profile, portfolio, mentioned):
    ideas = recommenders.recommend_projects(db, user.id, max_difficulty=1, limit=2)
    tries = "".join(f"\n  - {x['idea'].title}" for x in ideas)
    if not portfolio.get("recommendation_allowed", True):
        names = ", ".join(e["career"] for e in portfolio.get("emerging", [])[:3]) or "a few directions"
        return (f"It is completely normal not to know yet, and you do not need to decide now. At this stage I will not "
                f"pick a career for you. Based on your answers, some directions worth exploring are: {names}.\n\n"
                f"The best way to find out is to try small things and notice what you enjoy. Some easy starting points:{tries}\n\n"
                "After a few weeks, write a short reflection about what you liked and disliked. What kind of activity made "
                "you lose track of time recently?"), [{"type": "your_profile"}]
    p = portfolio.get("primary")
    if p is None:
        return "I need a bit more from you first. Please complete the assessment and I will show what stands out.", []
    sec = ", ".join(e["career"] for e in portfolio.get("secondary", []))
    return (f"Right now your strongest direction looks like {p['career']} ({p['confidence']} confidence)"
            + (f", with {sec} close behind" if sec else "") + ". Please treat this as a starting point and not a decision. "
            "You do not have to commit, and keeping a second option open is sensible.\n\n"
            f"To test it cheaply, you could try one of these:{tries}\n\n"
            "Want me to compare two of these directions, or explain why I see them? And is there anything about "
            f"{p['career']} that worries you?"), [{"type": "your_profile"}]


def _answer_memory(db, user):
    mems = [x for x in memory_service.list_memories(db, user.id, limit=60) if x.category in ("stable", "evolving")][:6]
    if not mems:
        return "I don't have much saved about you yet. As you use ACIS, I will remember key things and show them here.", []
    lines = ["This is some of what I currently remember about you:"] + [f"  - ({x.category}) {x.content}" for x in mems]
    lines.append("\nYou can edit or delete any memory in the Memory section, and I will stop using it.")
    return "\n".join(lines), [{"type": "your_memory"}]


def _answer_general(db, user, portfolio):
    p = portfolio.get("primary")
    focus = (f"Your strongest direction at the moment looks like {p['career']}, but that can change." if p else
             "I am still getting to know you, so I am not pointing you to any one direction.")
    return (f"Hi! {focus}\n\nI can help you compare careers, explain why something showed up, suggest what to learn "
            "next, find projects, or look at saved opportunities and market updates. What would you like to explore?"), []


def rule_based(db, user, profile, portfolio, message, mentioned, intent) -> tuple[str, list]:
    if intent == "support":
        return CRISIS_REPLY, [{"type": "safety", "name": "Tele-MANAS (Govt. of India)"}]
    if intent == "memory":
        return _answer_memory(db, user)
    if intent == "compare":
        return _answer_compare(db, user, portfolio, mentioned)
    if intent == "why":
        return _answer_why(db, user, portfolio, mentioned)
    if intent == "opportunities":
        return _answer_opportunities(db, user, portfolio, mentioned)
    if intent == "intelligence":
        return _answer_intelligence(db, user, portfolio, mentioned)
    if intent == "projects":
        return _answer_projects(db, user, portfolio, mentioned)
    if intent == "learn":
        return _answer_learn(db, user, portfolio, mentioned)
    if intent == "decide":
        return _answer_decide(db, user, profile, portfolio, mentioned)
    return _answer_general(db, user, portfolio)


# ------------------------------------------------------------------ optional LLM
SYSTEM_PROMPT = (
    "You are ACIS Mentor, a calm career mentor for Indian students. Follow these rules strictly:\n"
    "1. Use ONLY the FACTS below for anything about the student, careers, courses, opportunities or market data. "
    "If the facts do not contain something, say you do not have it.\n"
    "2. Never invent opportunities, deadlines, salaries, cut-offs or admission outcomes, and never guarantee any outcome.\n"
    "3. Never tell the student which career to choose. Help them compare, reflect and try small experiments.\n"
    "4. Do not make medical or psychological claims about the student.\n"
    "5. Be warm and concise (under 180 words). Mention sources by name when you use them.")
FORBIDDEN = ["guarantee", "100% sure", "will definitely", "you will get a job", "certain to succeed"]


def _llm_answer(db, user, portfolio, message, history, facts_text, memories) -> str:
    mem_lines = "\n".join(f"- {x.content}" for x in memories) or "- (none)"
    system = f"{SYSTEM_PROMPT}\n\nFACTS:\n{facts_text}\n\nWHAT YOU REMEMBER ABOUT THE STUDENT:\n{mem_lines}"
    msgs = [{"role": "system", "content": system}]
    for h in history[-10:]:
        msgs.append({"role": "assistant" if h.role == "mentor" else "user", "content": h.content})
    msgs.append({"role": "user", "content": message})
    reply = llm.complete(msgs)
    if not reply or any(w in reply.lower() for w in FORBIDDEN):
        raise llm.LLMError("LLM reply was empty or made a promise we do not allow")
    return reply


# ------------------------------------------------------------------ main entry point
def respond(db: Session, user: m.User, profile: m.StudentProfile, portfolio: dict, message: str,
            history: list[m.MentorMessage]) -> dict:
    mentioned = careers_mentioned(db, message)
    intent = detect_intent(message, len(mentioned))
    text, sources = rule_based(db, user, profile, portfolio, message, mentioned, intent)
    result = {"text": text, "intent": intent, "sources": sources, "llm_used": False, "fallback_reason": None}

    if intent != "support" and llm.is_configured():           # safety replies are never rewritten by a model
        memories = memory_service.search_memories(db, user.id, message, limit=4)
        try:
            result["text"] = _llm_answer(db, user, portfolio, message, history, text, memories)
            result["llm_used"] = True
        except llm.LLMError as e:
            result["fallback_reason"] = str(e)

    if intent not in ("support", "general"):
        note = f"Recently asked the mentor about: {intent}."
        exists = [x for x in memory_service.list_memories(db, user.id, "temporary", limit=20) if x.content == note]
        if not exists:
            memory_service.add_memory(db, user.id, "temporary", note, source="mentor", confidence=0.9, importance=0.3,
                                      tags=[c.slug for c in mentioned][:5], ttl_days=14)
    return result

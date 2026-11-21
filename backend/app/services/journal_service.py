"""
Reads a journal entry or reflection and pulls out WHICH FIELDS the student wrote about and
whether they sounded positive or negative about each.

It is a plain keyword approach, deliberately simple and explainable:
  * it only looks at fields of study / work and skills, never at mood, health or personality
  * it works sentence by sentence, and handles simple negation ("didn't enjoy")
  * it has no memory of earlier entries and writes nothing to the career tables
    (the orchestrator decides what, if anything, becomes career evidence)
"""
import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models as m

DOMAIN_WORDS = {
    "technology": ["code", "coding", "programming", "python", "software", "app", "apps", "website", "computer",
                   "algorithm", "javascript", "developer", "machine learning", "ai", "data"],
    "science": ["physics", "chemistry", "biology", "experiment", "laboratory", "lab", "science", "scientist", "research"],
    "engineering": ["robot", "robots", "robotics", "circuit", "circuits", "arduino", "electronics", "mechanical",
                    "engineering", "cad", "drone", "machine", "machines"],
    "mathematics": ["maths", "math", "mathematics", "equation", "equations", "statistics", "geometry", "calculus", "algebra"],
    "arts_design": ["design", "drawing", "sketch", "painting", "figma", "music", "art", "poster", "illustration", "ui", "ux"],
    "business": ["business", "startup", "marketing", "finance", "sales", "entrepreneur", "accounting", "stock", "stocks"],
    "healthcare": ["doctor", "medicine", "hospital", "patient", "patients", "nursing", "clinic", "health"],
    "social_impact": ["teaching", "teach", "volunteer", "volunteering", "ngo", "community", "tutoring", "social work"],
    "writing_media": ["writing", "blog", "story", "stories", "journalism", "article", "podcast", "editing", "poem"],
    "law_governance": ["law", "legal", "court", "debate", "policy", "upsc", "civil services", "constitution"],
}
POSITIVE = {"enjoyed", "enjoy", "enjoying", "loved", "love", "liked", "like", "fun", "excited", "exciting",
            "interesting", "fascinating", "fascinated", "proud", "great", "amazing", "curious", "satisfying"}
NEGATIVE = {"boring", "bored", "hated", "hate", "disliked", "dislike", "tedious", "frustrating", "dull",
            "pointless", "exhausting"}
NEGATORS = {"not", "didn't", "didnt", "don't", "dont", "never", "no", "wasn't", "wasnt", "hardly", "cannot", "can't"}


def _tokens(sentence: str) -> list[str]:
    return re.findall(r"[a-z0-9+#']+", sentence.lower().replace("’", "'"))


def _polarity(tokens: list[str]) -> int:
    score = 0
    for i, t in enumerate(tokens):
        flipped = any(x in NEGATORS for x in tokens[max(0, i - 2):i])
        if t in POSITIVE:
            score += -1 if flipped else 1
        elif t in NEGATIVE:
            score += 1 if flipped else -1
    return (score > 0) - (score < 0)


def _domains_in(tokens: list[str]) -> set[str]:
    text = " " + " ".join(tokens) + " "
    return {d for d, words in DOMAIN_WORDS.items() if any(f" {w} " in text for w in words)}


def domains_mentioned(text: str) -> set[str]:
    return _domains_in(_tokens(text))


def skills_mentioned(db: Session, text: str) -> list[str]:
    padded = " " + " ".join(_tokens(text)) + " "
    found = []
    for slug, name in db.execute(select(m.Skill.slug, m.Skill.name)):
        names = {slug.replace("_", " "), name.lower(), re.split(r" & | / ", name.lower())[0]}
        if any(len(n) >= 3 and f" {n} " in padded for n in names):
            found.append(slug)
    return sorted(found)


def analyse(db: Session, text: str) -> dict:
    """{"domains": {"technology": {"positive": 1, "negative": 0, "neutral": 0}}, "skills": ["python"]}"""
    domains: dict[str, dict[str, int]] = {}
    for sentence in re.split(r"[.!?\n]+", text):
        tokens = _tokens(sentence)
        if not tokens:
            continue
        pol = _polarity(tokens)
        for d in _domains_in(tokens):
            slot = domains.setdefault(d, {"positive": 0, "negative": 0, "neutral": 0})
            slot["positive" if pol > 0 else "negative" if pol < 0 else "neutral"] += 1
    return {"domains": domains, "skills": skills_mentioned(db, text)}


def net_direction(counts: dict) -> int:
    """+1, -1 or 0 (nothing worth recording) for one domain."""
    return (counts["positive"] > counts["negative"]) - (counts["negative"] > counts["positive"])

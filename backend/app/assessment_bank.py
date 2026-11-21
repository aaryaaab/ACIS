"""
Questions for the aptitude and personality parts of the assessment.

The answer key stays on the server. These are short screening items written for this project,
not a validated psychometric test, and the results are only ever used as one kind of evidence.
"""

APTITUDE_QUESTIONS = [
    # logical
    {"id": "l1", "aptitude": "logical", "text": "2, 6, 12, 20, 30, ... What comes next?", "options": ["38", "40", "42", "44"], "answer": 2},
    {"id": "l2", "aptitude": "logical", "text": "All doctors are graduates. Meena is a doctor. Therefore:", "options": ["Meena is a graduate", "Meena is not a graduate", "All graduates are doctors", "Meena is a teacher"], "answer": 0},
    {"id": "l3", "aptitude": "logical", "text": "If A > B and B > C, which is certainly true?", "options": ["C > A", "A > C", "B > A", "A = C"], "answer": 1},
    # numerical
    {"id": "n1", "aptitude": "numerical", "text": "A shirt costs 800 after a 20% discount. What was the original price?", "options": ["960", "1000", "1040", "1200"], "answer": 1},
    {"id": "n2", "aptitude": "numerical", "text": "A train covers 150 km in 2.5 hours. Its average speed in km/h is:", "options": ["50", "55", "60", "65"], "answer": 2},
    {"id": "n3", "aptitude": "numerical", "text": "What is 15% of 240?", "options": ["32", "34", "36", "38"], "answer": 2},
    # verbal
    {"id": "v1", "aptitude": "verbal", "text": "Choose the word closest in meaning to 'scarce'.", "options": ["Plentiful", "Rare", "Costly", "Heavy"], "answer": 1},
    {"id": "v2", "aptitude": "verbal", "text": "Book is to reader as meal is to:", "options": ["Cook", "Plate", "Eater", "Kitchen"], "answer": 2},
    {"id": "v3", "aptitude": "verbal", "text": "Which sentence is correct?", "options": ["Their going to the market.", "They're going to the market.", "There going to the market.", "Theyre going to the market."], "answer": 1},
    # spatial
    {"id": "s1", "aptitude": "spatial", "text": "How many faces does a cube have?", "options": ["4", "6", "8", "12"], "answer": 1},
    {"id": "s2", "aptitude": "spatial", "text": "You face north and turn right, then right again. Which way do you face?", "options": ["North", "East", "South", "West"], "answer": 2},
    {"id": "s3", "aptitude": "spatial", "text": "A cube is painted red on all faces, then cut into 27 equal small cubes (3x3x3). How many small cubes have exactly 3 red faces?", "options": ["4", "8", "12", "6"], "answer": 1},
]
CREATIVE_ITEMS = [
    {"id": "c1", "text": "I often come up with unusual ideas for solving everyday problems."},
    {"id": "c2", "text": "I enjoy making things (drawings, stories, designs, music, models) just for the sake of it."},
    {"id": "c3", "text": "When there is no clear instruction, I like finding my own way to do something."},
]
# Big Five, two statements per trait. reverse=True means a high agreement lowers the trait.
PERSONALITY_ITEMS = [
    {"id": "p1", "trait": "openness", "reverse": False, "text": "I like learning about new ideas and unfamiliar subjects."},
    {"id": "p2", "trait": "openness", "reverse": True, "text": "I prefer sticking to routines I already know."},
    {"id": "p3", "trait": "conscientiousness", "reverse": False, "text": "I plan my work and finish what I start."},
    {"id": "p4", "trait": "conscientiousness", "reverse": True, "text": "I often leave things to the last minute."},
    {"id": "p5", "trait": "extraversion", "reverse": False, "text": "I feel energised when I am around other people."},
    {"id": "p6", "trait": "extraversion", "reverse": True, "text": "I prefer working alone to working in a group."},
    {"id": "p7", "trait": "agreeableness", "reverse": False, "text": "I enjoy helping others even when it costs me time."},
    {"id": "p8", "trait": "agreeableness", "reverse": True, "text": "I find it hard to see things from other people's point of view."},
    {"id": "p9", "trait": "emotional_stability", "reverse": False, "text": "I stay fairly calm when things go wrong."},
    {"id": "p10", "trait": "emotional_stability", "reverse": True, "text": "I get stressed easily by deadlines or exams."},
]
INTEREST_ITEMS = [
    {"domain": "technology", "text": "Building apps, websites or working with computers"},
    {"domain": "science", "text": "Understanding how nature and living things work"},
    {"domain": "engineering", "text": "Designing and building machines, circuits or structures"},
    {"domain": "mathematics", "text": "Solving maths problems and finding patterns"},
    {"domain": "arts_design", "text": "Drawing, designing, music or other creative work"},
    {"domain": "business", "text": "Running a business, money, markets and strategy"},
    {"domain": "healthcare", "text": "Caring for people's health and wellbeing"},
    {"domain": "social_impact", "text": "Teaching, community work or solving social problems"},
    {"domain": "writing_media", "text": "Writing, storytelling, media and communication"},
    {"domain": "law_governance", "text": "Law, rules, public policy and fairness"},
]


def public_questions() -> dict:
    """What the frontend is allowed to see (no answer key)."""
    return {
        "interests": INTEREST_ITEMS,
        "aptitude": [{k: v for k, v in q.items() if k != "answer"} for q in APTITUDE_QUESTIONS],
        "creative": CREATIVE_ITEMS,
        "personality": [{k: v for k, v in q.items() if k != "reverse"} for q in PERSONALITY_ITEMS],
        "scales": {"interest": "1 (not at all) to 5 (a lot)", "likert": "1 (disagree) to 5 (agree)"},
    }


def score_aptitude(answers: dict[str, int], creative: dict[str, int]) -> dict[str, float]:
    out: dict[str, float] = {}
    for apt in ("logical", "numerical", "verbal", "spatial"):
        qs = [q for q in APTITUDE_QUESTIONS if q["aptitude"] == apt]
        right = sum(1 for q in qs if answers.get(q["id"]) == q["answer"])
        out[apt] = round(right / len(qs), 2)
    vals = [min(5, max(1, creative.get(c["id"], 3))) for c in CREATIVE_ITEMS]
    out["creative"] = round((sum(vals) / len(vals) - 1) / 4, 2)
    return out


def score_personality(answers: dict[str, int]) -> dict[str, float]:
    traits: dict[str, list[float]] = {}
    for item in PERSONALITY_ITEMS:
        v = min(5, max(1, answers.get(item["id"], 3)))
        v = 6 - v if item["reverse"] else v
        traits.setdefault(item["trait"], []).append((v - 1) / 4)
    return {t: round(sum(v) / len(v), 2) for t, v in traits.items()}

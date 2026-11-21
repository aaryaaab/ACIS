"""Shared constants. Kept in one place so the frontend forms and the scoring agree."""

INTEREST_DOMAINS = [
    "technology", "science", "engineering", "mathematics", "arts_design",
    "business", "healthcare", "social_impact", "writing_media", "law_governance",
]
APTITUDES = ["logical", "numerical", "verbal", "spatial", "creative"]
BIG_FIVE = ["openness", "conscientiousness", "extraversion", "agreeableness", "emotional_stability"]
STAGES = ["explore", "decide", "learn", "build", "launch", "grow"]
MEMORY_CATEGORIES = ["stable", "evolving", "episodic", "temporary"]

# School subject -> interest domains it hints at (used for the academic part of scoring)
SUBJECT_DOMAINS = {
    "mathematics": ["mathematics", "technology", "engineering"],
    "physics": ["science", "engineering"],
    "chemistry": ["science", "healthcare"],
    "biology": ["science", "healthcare"],
    "computer science": ["technology", "engineering"],
    "english": ["writing_media", "law_governance"],
    "social science": ["social_impact", "law_governance"],
    "economics": ["business", "mathematics"],
    "accountancy": ["business"],
    "art": ["arts_design"],
}

ALGORITHM_VERSION = "cm-1.0"
KNOWLEDGE_BASE_VERSION = "kb-0.1-sample"

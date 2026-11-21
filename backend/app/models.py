"""
Database tables for ACIS.

The three core models live in separate groups of tables:

  CAREER MODEL   career_profiles, career_scores, career_evidence, career_history
  LEARNING MODEL learning_preferences, resource_feedback
  GROWTH MODEL   student_skills, projects, achievements

Only the matching service in app/services/ writes to each group.
"""
from datetime import datetime, date

from pgvector.sqlalchemy import Vector
from sqlalchemy import (
    JSON, Boolean, Date, DateTime, Float, ForeignKey, Integer, String, Text,
    UniqueConstraint, Index, func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import TypeDecorator

from app.database import Base

EMBEDDING_DIM = 384


class EmbeddingType(TypeDecorator):
    """pgvector on PostgreSQL, plain JSON elsewhere (keeps SQLite-based tools working)."""
    impl = JSON
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(Vector(EMBEDDING_DIM))
        return dialect.type_descriptor(JSON())

    class comparator_factory(TypeDecorator.Comparator):
        def cosine_distance(self, other):
            """column.cosine_distance(vector) -> pgvector's <=> operator (smaller = more similar)."""
            return self.op("<=>", return_type=Float)(other)


def now():
    return datetime.utcnow()


def fk(target: str, **kw):
    return mapped_column(ForeignKey(target, ondelete="CASCADE"), **kw)


# --------------------------------------------------------------------------
# Users and student data
# --------------------------------------------------------------------------
class User(Base):
    __tablename__ = "users"
    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str | None] = mapped_column(String(255))   # null when using Supabase
    external_id: Mapped[str | None] = mapped_column(String(255), unique=True)  # Supabase user id
    full_name: Mapped[str] = mapped_column(String(120), default="")
    # Increases on sign-out. Login tokens carry the value they were issued with, so old tokens stop working.
    session_epoch: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class StudentProfile(Base):
    __tablename__ = "student_profiles"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = fk("users.id", unique=True)
    date_of_birth: Mapped[date | None] = mapped_column(Date)
    is_minor: Mapped[bool] = mapped_column(Boolean, default=False)
    guardian_consent: Mapped[bool] = mapped_column(Boolean, default=False)
    # explore | decide | learn | build | launch | grow
    stage: Mapped[str] = mapped_column(String(20), default="explore")
    education_level: Mapped[str] = mapped_column(String(40), default="")   # e.g. "class_9", "btech_2"
    institution: Mapped[str] = mapped_column(String(160), default="")
    city: Mapped[str] = mapped_column(String(80), default="")
    long_term_goal: Mapped[str] = mapped_column(Text, default="")
    lifestyle: Mapped[dict] = mapped_column(JSON, default=dict)            # work style, location, etc.
    financial_context: Mapped[str] = mapped_column(String(40), default="")  # optional, self-reported
    onboarding_done: Mapped[bool] = mapped_column(Boolean, default=False)
    rapid_mode_used: Mapped[bool] = mapped_column(Boolean, default=False)
    # opt-in: lets anonymised recommendation logs be included in research exports
    research_consent: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class AcademicRecord(Base):
    __tablename__ = "academic_records"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = fk("users.id", index=True)
    subject: Mapped[str] = mapped_column(String(80))
    score_percent: Mapped[float] = mapped_column(Float)
    term: Mapped[str] = mapped_column(String(40), default="")


class Interest(Base):
    __tablename__ = "interests"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = fk("users.id", index=True)
    domain: Mapped[str] = mapped_column(String(40))        # one of INTEREST_DOMAINS
    level: Mapped[float] = mapped_column(Float)            # 0..1 self-reported
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class AptitudeResult(Base):
    __tablename__ = "aptitude_results"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = fk("users.id", index=True)
    # {"logical":0.7,"numerical":..,"verbal":..,"spatial":..,"creative":..}
    scores: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class PersonalityResult(Base):
    __tablename__ = "personality_results"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = fk("users.id", index=True)
    # Big Five, 0..1. Treated as weak evidence only, never as a label.
    scores: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


# --------------------------------------------------------------------------
# Knowledge base (shared, not owned by any student)
# --------------------------------------------------------------------------
class Source(Base):
    __tablename__ = "sources"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160), unique=True)
    url: Mapped[str] = mapped_column(String(500), default="")
    licence: Mapped[str] = mapped_column(String(160), default="")
    attribution: Mapped[str] = mapped_column(String(300), default="")
    last_verified: Mapped[date | None] = mapped_column(Date)    # null = not verified yet
    note: Mapped[str] = mapped_column(Text, default="")


class Skill(Base):
    __tablename__ = "skills"
    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(60), unique=True)
    name: Mapped[str] = mapped_column(String(100))
    category: Mapped[str] = mapped_column(String(60), default="")
    description: Mapped[str] = mapped_column(Text, default="")
    source_id: Mapped[int | None] = mapped_column(ForeignKey("sources.id"))


class Career(Base):
    __tablename__ = "careers"
    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(60), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    # how strongly the career draws on each interest domain / aptitude (0..1)
    interest_profile: Mapped[dict] = mapped_column(JSON, default=dict)
    aptitude_profile: Mapped[dict] = mapped_column(JSON, default=dict)
    personality_hint: Mapped[dict] = mapped_column(JSON, default=dict)
    pathway: Mapped[str] = mapped_column(Text, default="")
    source_id: Mapped[int | None] = mapped_column(ForeignKey("sources.id"))
    embedding: Mapped[list | None] = mapped_column(EmbeddingType)


class CareerSkill(Base):
    __tablename__ = "career_skills"
    career_id: Mapped[int] = fk("careers.id", primary_key=True)
    skill_id: Mapped[int] = fk("skills.id", primary_key=True)
    importance: Mapped[float] = mapped_column(Float, default=0.5)     # 0..1
    level_required: Mapped[int] = mapped_column(Integer, default=3)   # 1..5


class Degree(Base):
    __tablename__ = "degrees"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    level: Mapped[str] = mapped_column(String(40), default="")        # ug, pg, diploma ...
    description: Mapped[str] = mapped_column(Text, default="")
    entrance_exams: Mapped[str] = mapped_column(String(300), default="")


class CareerDegree(Base):
    __tablename__ = "career_degrees"
    career_id: Mapped[int] = fk("careers.id", primary_key=True)
    degree_id: Mapped[int] = fk("degrees.id", primary_key=True)


class Resource(Base):
    __tablename__ = "resources"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    provider: Mapped[str] = mapped_column(String(100))
    url: Mapped[str] = mapped_column(String(500))
    kind: Mapped[str] = mapped_column(String(20))                 # video | reading | interactive | project
    difficulty: Mapped[int] = mapped_column(Integer, default=1)   # 1 beginner .. 3 advanced
    duration_hours: Mapped[float] = mapped_column(Float, default=1)
    session_minutes: Mapped[int] = mapped_column(Integer, default=30)   # typical length of one sitting
    theory_level: Mapped[float] = mapped_column(Float, default=0.5)     # 0 hands-on .. 1 very theoretical
    cost: Mapped[str] = mapped_column(String(20), default="free")
    description: Mapped[str] = mapped_column(Text, default="")
    last_verified: Mapped[date | None] = mapped_column(Date)
    source_id: Mapped[int | None] = mapped_column(ForeignKey("sources.id"))
    embedding: Mapped[list | None] = mapped_column(EmbeddingType)


class ResourceSkill(Base):
    __tablename__ = "resource_skills"
    resource_id: Mapped[int] = fk("resources.id", primary_key=True)
    skill_id: Mapped[int] = fk("skills.id", primary_key=True)


class ProjectIdea(Base):
    """Catalogue of projects ACIS can recommend (not the student's own projects)."""
    __tablename__ = "project_ideas"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    difficulty: Mapped[int] = mapped_column(Integer, default=1)
    est_hours: Mapped[int] = mapped_column(Integer, default=10)
    skill_slugs: Mapped[list] = mapped_column(JSON, default=list)
    career_slugs: Mapped[list] = mapped_column(JSON, default=list)


class Opportunity(Base):
    __tablename__ = "opportunities"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(30))          # internship | scholarship | hackathon | research
    provider: Mapped[str] = mapped_column(String(160))
    eligibility: Mapped[str] = mapped_column(Text, default="")
    deadline: Mapped[date | None] = mapped_column(Date)
    url: Mapped[str] = mapped_column(String(500))
    verified_on: Mapped[date | None] = mapped_column(Date)
    career_slugs: Mapped[list] = mapped_column(JSON, default=list)
    source_id: Mapped[int | None] = mapped_column(ForeignKey("sources.id"))
    embedding: Mapped[list | None] = mapped_column(EmbeddingType)


class MarketUpdate(Base):
    __tablename__ = "market_updates"
    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(240))
    summary: Mapped[str] = mapped_column(Text, default="")
    career_slugs: Mapped[list] = mapped_column(JSON, default=list)
    url: Mapped[str] = mapped_column(String(500), default="")
    retrieved_on: Mapped[date] = mapped_column(Date)
    source_id: Mapped[int | None] = mapped_column(ForeignKey("sources.id"))
    embedding: Mapped[list | None] = mapped_column(EmbeddingType)


# --------------------------------------------------------------------------
# CAREER MODEL  (written only by services/career_model.py)
# --------------------------------------------------------------------------
class CareerProfile(Base):
    __tablename__ = "career_profiles"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = fk("users.id", unique=True)
    algorithm_version: Mapped[str] = mapped_column(String(20), default="")
    last_updated: Mapped[datetime] = mapped_column(DateTime, default=now)
    explore_mode: Mapped[bool] = mapped_column(Boolean, default=True)   # true = do not recommend yet


class CareerScore(Base):
    __tablename__ = "career_scores"
    __table_args__ = (UniqueConstraint("user_id", "career_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = fk("users.id", index=True)
    career_id: Mapped[int] = fk("careers.id")
    score: Mapped[float] = mapped_column(Float)              # internal, never shown as a number
    baseline: Mapped[float] = mapped_column(Float, default=0.0)   # from assessments
    evidence_count: Mapped[int] = mapped_column(Integer, default=0)
    evidence_days: Mapped[int] = mapped_column(Integer, default=0)
    # score at the start of the current day; used to cap how far it can move in one day
    day_anchor_score: Mapped[float] = mapped_column(Float, default=0.0)
    anchor_date: Mapped[date | None] = mapped_column(Date)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    career = relationship("Career")


class CareerEvidence(Base):
    __tablename__ = "career_evidence"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = fk("users.id", index=True)
    career_id: Mapped[int] = fk("careers.id")
    # project | competition | club | reflection | journal | activity | click
    source_type: Mapped[str] = mapped_column(String(20))
    direction: Mapped[int] = mapped_column(Integer, default=1)       # +1 supports, -1 weakens
    strength: Mapped[float] = mapped_column(Float, default=1.0)      # 0..1 within source type
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now, index=True)


class CareerHistory(Base):
    __tablename__ = "career_history"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = fk("users.id", index=True)
    career_id: Mapped[int] = fk("careers.id")
    level: Mapped[str] = mapped_column(String(20))           # high | moderate | emerging
    role: Mapped[str] = mapped_column(String(20))            # primary | secondary | emerging
    reason: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now, index=True)


# --------------------------------------------------------------------------
# LEARNING MODEL  (written only by services/learning_model.py)
# --------------------------------------------------------------------------
class LearningPreference(Base):
    __tablename__ = "learning_preferences"
    __table_args__ = (UniqueConstraint("user_id", "dimension"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = fk("users.id", index=True)
    # video | reading | interactive | project | long_sessions | theory | difficulty
    dimension: Mapped[str] = mapped_column(String(30))
    value: Mapped[float] = mapped_column(Float, default=0.5)    # 0..1
    samples: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class ResourceFeedback(Base):
    __tablename__ = "resource_feedback"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = fk("users.id", index=True)
    resource_id: Mapped[int] = fk("resources.id")
    status: Mapped[str] = mapped_column(String(20), default="started")  # started | completed | abandoned
    rating: Mapped[int | None] = mapped_column(Integer)                 # 1..5
    comment: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


# --------------------------------------------------------------------------
# GROWTH MODEL  (written only by services/growth_model.py)
# --------------------------------------------------------------------------
class StudentSkill(Base):
    __tablename__ = "student_skills"
    __table_args__ = (UniqueConstraint("user_id", "skill_id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = fk("users.id", index=True)
    skill_id: Mapped[int] = fk("skills.id")
    level: Mapped[int] = mapped_column(Integer, default=1)       # 1..5
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    skill = relationship("Skill")


class Project(Base):
    """A project the student is doing or has done."""
    __tablename__ = "projects"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = fk("users.id", index=True)
    idea_id: Mapped[int | None] = mapped_column(ForeignKey("project_ideas.id"))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="in_progress")  # in_progress | completed
    skill_slugs: Mapped[list] = mapped_column(JSON, default=list)
    repo_url: Mapped[str] = mapped_column(String(300), default="")
    in_portfolio: Mapped[bool] = mapped_column(Boolean, default=False)
    started_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime)


class Achievement(Base):
    __tablename__ = "achievements"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = fk("users.id", index=True)
    # certification | internship | competition | research | milestone
    kind: Mapped[str] = mapped_column(String(20))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    achieved_on: Mapped[date] = mapped_column(Date, default=date.today)


# --------------------------------------------------------------------------
# Memory, journals, reflections
# --------------------------------------------------------------------------
class Memory(Base):
    __tablename__ = "memories"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = fk("users.id", index=True)
    category: Mapped[str] = mapped_column(String(10))        # stable | evolving | episodic | temporary
    content: Mapped[str] = mapped_column(Text)
    source: Mapped[str] = mapped_column(String(40), default="system")
    confidence: Mapped[float] = mapped_column(Float, default=0.5)
    importance: Mapped[float] = mapped_column(Float, default=0.5)
    tags: Mapped[list] = mapped_column(JSON, default=list)   # related career / skill slugs
    expires_at: Mapped[datetime | None] = mapped_column(DateTime)   # used by temporary memories
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now, index=True)
    embedding: Mapped[list | None] = mapped_column(EmbeddingType)


class JournalEntry(Base):
    __tablename__ = "journal_entries"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = fk("users.id", index=True)
    text: Mapped[str] = mapped_column(Text)
    extracted: Mapped[dict] = mapped_column(JSON, default=dict)     # detected interests/skills
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now, index=True)
    embedding: Mapped[list | None] = mapped_column(EmbeddingType)


class VoiceEntry(Base):
    __tablename__ = "voice_entries"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = fk("users.id", index=True)
    transcript: Mapped[str] = mapped_column(Text)
    journal_entry_id: Mapped[int | None] = mapped_column(ForeignKey("journal_entries.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Reflection(Base):
    __tablename__ = "reflections"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = fk("users.id", index=True)
    enjoyed: Mapped[str] = mapped_column(Text, default="")
    disliked: Mapped[str] = mapped_column(Text, default="")
    surprised: Mapped[str] = mapped_column(Text, default="")
    interests_changed: Mapped[str] = mapped_column(String(10), default="no")   # yes | no | unsure
    related_careers: Mapped[list] = mapped_column(JSON, default=list)          # career slugs the student mentions
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now, index=True)
    embedding: Mapped[list | None] = mapped_column(EmbeddingType)


# --------------------------------------------------------------------------
# Roadmaps, notifications
# --------------------------------------------------------------------------
class Roadmap(Base):
    __tablename__ = "roadmaps"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = fk("users.id", index=True)
    career_id: Mapped[int] = fk("careers.id")
    title: Mapped[str] = mapped_column(String(200))
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    items = relationship("RoadmapItem", cascade="all, delete-orphan", order_by="RoadmapItem.position")


class RoadmapItem(Base):
    __tablename__ = "roadmap_items"
    id: Mapped[int] = mapped_column(primary_key=True)
    roadmap_id: Mapped[int] = fk("roadmaps.id", index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)
    kind: Mapped[str] = mapped_column(String(20))            # skill | resource | project
    title: Mapped[str] = mapped_column(String(200))
    ref_id: Mapped[int | None] = mapped_column(Integer)      # id of the skill/resource/project idea
    done: Mapped[bool] = mapped_column(Boolean, default=False)


class Notification(Base):
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = fk("users.id", index=True)
    message: Mapped[str] = mapped_column(Text)
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


# --------------------------------------------------------------------------
# Research logging
# --------------------------------------------------------------------------
class AgentRun(Base):
    __tablename__ = "agent_runs"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    agent: Mapped[str] = mapped_column(String(40))
    input_summary: Mapped[dict] = mapped_column(JSON, default=dict)
    output_summary: Mapped[dict] = mapped_column(JSON, default=dict)
    llm_used: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


class Recommendation(Base):
    __tablename__ = "recommendations"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = fk("users.id", index=True)
    kind: Mapped[str] = mapped_column(String(20))            # career | resource | project | opportunity
    target_id: Mapped[int | None] = mapped_column(Integer)
    target_label: Mapped[str] = mapped_column(String(200), default="")
    confidence: Mapped[str] = mapped_column(String(20), default="")
    explanation: Mapped[str] = mapped_column(Text, default="")
    what_could_change: Mapped[str] = mapped_column(Text, default="")
    input_evidence: Mapped[dict] = mapped_column(JSON, default=dict)
    algorithm_version: Mapped[str] = mapped_column(String(20), default="")
    model_version: Mapped[str] = mapped_column(String(60), default="rule-based")
    knowledge_base_version: Mapped[str] = mapped_column(String(20), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now, index=True)


class RecommendationFeedback(Base):
    __tablename__ = "recommendation_feedback"
    id: Mapped[int] = mapped_column(primary_key=True)
    recommendation_id: Mapped[int] = fk("recommendations.id", index=True)
    user_id: Mapped[int] = fk("users.id", index=True)
    helpful: Mapped[bool] = mapped_column(Boolean)
    relevance: Mapped[int | None] = mapped_column(Integer)   # 1..5
    comment: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)


Index("ix_memories_user_category", Memory.user_id, Memory.category)


# --------------------------------------------------------------------------
# AI Mentor conversations (the mentor only reads the three models, it never writes to them)
# --------------------------------------------------------------------------
class MentorConversation(Base):
    __tablename__ = "mentor_conversations"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = fk("users.id", index=True)
    title: Mapped[str] = mapped_column(String(80), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)
    messages = relationship("MentorMessage", cascade="all, delete-orphan", order_by="MentorMessage.id")


class MentorMessage(Base):
    __tablename__ = "mentor_messages"
    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = fk("mentor_conversations.id", index=True)
    user_id: Mapped[int] = fk("users.id", index=True)
    role: Mapped[str] = mapped_column(String(10))            # user | mentor
    content: Mapped[str] = mapped_column(Text)
    intent: Mapped[str] = mapped_column(String(30), default="")
    sources: Mapped[list] = mapped_column(JSON, default=list)   # where each fact came from
    llm_used: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=now)

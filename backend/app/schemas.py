from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.domain import INTEREST_DOMAINS


class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=100)
    full_name: str = Field(default="", max_length=120)

    @field_validator("password")
    @classmethod
    def password_fits_bcrypt(cls, v: str) -> str:
        from app.security import MAX_PASSWORD_BYTES, password_too_long
        if password_too_long(v):
            raise ValueError(f"Use at most {MAX_PASSWORD_BYTES} bytes (about {MAX_PASSWORD_BYTES} letters, fewer if you use emoji or accents)")
        return v


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    full_name: str


class OnboardingIn(BaseModel):
    date_of_birth: date
    guardian_consent: bool = False
    education_level: str = Field(max_length=40)       # class_8 ... class_12, btech_1 ... btech_4, graduate, working
    institution: str = Field(default="", max_length=160)
    city: str = Field(default="", max_length=80)
    long_term_goal: str = Field(default="", max_length=1000)
    lifestyle: dict = Field(default_factory=dict)
    financial_context: Literal["", "budget_limited", "moderate", "flexible"] = ""
    academics: dict[str, float] = Field(default_factory=dict)   # subject -> percent
    stage: str | None = None

    @field_validator("academics")
    @classmethod
    def percent_range(cls, v):
        for subject, score in v.items():
            if not 0 <= score <= 100:
                raise ValueError(f"{subject}: score must be between 0 and 100")
        return v


class AssessmentIn(BaseModel):
    interests: dict[str, int]                         # domain -> 1..5
    aptitude_answers: dict[str, int] = Field(default_factory=dict)   # question id -> option index
    creative: dict[str, int] = Field(default_factory=dict)
    personality: dict[str, int] = Field(default_factory=dict)

    @field_validator("interests")
    @classmethod
    def valid_interests(cls, v):
        for d, level in v.items():
            if d not in INTEREST_DOMAINS:
                raise ValueError(f"unknown interest domain: {d}")
            if not 1 <= level <= 5:
                raise ValueError("interest ratings must be 1 to 5")
        return v


class EvidenceIn(BaseModel):
    career_slug: str
    source_type: Literal["project", "competition", "club", "activity", "reflection", "journal", "click"]
    direction: Literal[1, -1] = 1
    strength: float = Field(default=1.0, ge=0, le=1)
    note: str = Field(default="", max_length=500)


class FeedbackIn(BaseModel):
    helpful: bool
    relevance: int | None = Field(default=None, ge=1, le=5)
    comment: str = Field(default="", max_length=1000)


class ResourceFeedbackIn(BaseModel):
    status: Literal["started", "completed", "abandoned"]
    rating: int | None = Field(default=None, ge=1, le=5)
    comment: str = Field(default="", max_length=1000)


class SkillIn(BaseModel):
    skill_slug: str
    level: int = Field(ge=1, le=5)


class ProjectIn(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=2000)
    idea_id: int | None = None
    skill_slugs: list[str] = Field(default_factory=list)
    repo_url: str = Field(default="", max_length=300)


class AchievementIn(BaseModel):
    kind: Literal["certification", "internship", "competition", "research", "milestone"]
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=1000)
    achieved_on: date | None = None
    career_slug: str | None = None      # optional: the career this achievement relates to


# ---------------------------------------------------------------- Phase 3
from pydantic import model_validator  # noqa: E402


def _not_blank(v: str) -> str:
    if not v.strip():
        raise ValueError("must not be empty")
    return v.strip()


class MemoryIn(BaseModel):
    category: Literal["stable", "evolving", "episodic", "temporary"]
    content: str = Field(min_length=1, max_length=1000)
    source: str = Field(default="student", max_length=40)
    confidence: float = Field(default=0.7, ge=0, le=1)
    importance: float = Field(default=0.5, ge=0, le=1)
    tags: list[str] = Field(default_factory=list, max_length=10)
    ttl_days: int | None = Field(default=None, ge=1, le=90)     # temporary memories only

    _clean = field_validator("content")(_not_blank)


class MemoryUpdate(BaseModel):
    content: str | None = Field(default=None, min_length=1, max_length=1000)
    confidence: float | None = Field(default=None, ge=0, le=1)
    importance: float | None = Field(default=None, ge=0, le=1)
    tags: list[str] | None = Field(default=None, max_length=10)


class JournalIn(BaseModel):
    text: str = Field(min_length=1, max_length=5000)
    _clean = field_validator("text")(_not_blank)


class VoiceTranscriptIn(BaseModel):
    transcript: str = Field(min_length=1, max_length=5000)
    _clean = field_validator("transcript")(_not_blank)


class CareerMention(BaseModel):
    slug: str
    feeling: Literal["enjoyed", "disliked"]


class ReflectionIn(BaseModel):
    enjoyed: str = Field(default="", max_length=2000)
    disliked: str = Field(default="", max_length=2000)
    surprised: str = Field(default="", max_length=2000)
    interests_changed: Literal["yes", "no", "unsure"] = "no"
    related_careers: list[CareerMention] = Field(default_factory=list, max_length=10)

    @model_validator(mode="after")
    def something_written(self):
        if not (self.enjoyed.strip() or self.disliked.strip() or self.surprised.strip() or self.related_careers):
            raise ValueError("Write something in at least one field, or pick a career")
        return self


class MentorIn(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    conversation_id: int | None = None
    _clean = field_validator("message")(_not_blank)


class RoadmapGenerateIn(BaseModel):
    career_slug: str
    title: str | None = Field(default=None, max_length=200)


class RoadmapItemUpdate(BaseModel):
    done: bool


class ResearchConsentIn(BaseModel):
    consent: bool

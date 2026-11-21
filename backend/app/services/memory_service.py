"""Long-term memory: stable, evolving, episodic and temporary entries."""
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models as m
from app.domain import MEMORY_CATEGORIES
from app.services.embeddings import embed


def add_memory(db: Session, user_id: int, category: str, content: str, source: str = "system",
               confidence: float = 0.5, importance: float = 0.5, tags: list | None = None,
               ttl_days: int | None = None) -> m.Memory:
    if category not in MEMORY_CATEGORIES:
        raise ValueError(f"unknown memory category: {category}")
    mem = m.Memory(user_id=user_id, category=category, content=content, source=source,
                   confidence=max(0.0, min(1.0, confidence)), importance=max(0.0, min(1.0, importance)),
                   tags=tags or [], embedding=embed(content))
    if category == "temporary":
        mem.expires_at = datetime.utcnow() + timedelta(days=ttl_days or 14)
    db.add(mem)
    db.flush()
    return mem


def list_memories(db: Session, user_id: int, category: str | None = None, limit: int = 100) -> list[m.Memory]:
    q = select(m.Memory).where(m.Memory.user_id == user_id)
    if category:
        q = q.where(m.Memory.category == category)
    q = q.where((m.Memory.expires_at.is_(None)) | (m.Memory.expires_at > datetime.utcnow()))
    return list(db.scalars(q.order_by(m.Memory.created_at.desc()).limit(limit)))


def search_memories(db: Session, user_id: int, query: str, limit: int = 5) -> list[m.Memory]:
    """Semantic search over the student's own memories (pgvector cosine distance)."""
    vec = embed(query)
    q = (select(m.Memory).where(m.Memory.user_id == user_id, m.Memory.embedding.is_not(None))
         .where((m.Memory.expires_at.is_(None)) | (m.Memory.expires_at > datetime.utcnow()))
         .order_by(m.Memory.embedding.cosine_distance(vec)).limit(limit))
    return list(db.scalars(q))


def purge_expired(db: Session, user_id: int | None = None) -> int:
    """Temporary memories are deleted once they have expired."""
    q = select(m.Memory).where(m.Memory.expires_at.is_not(None), m.Memory.expires_at <= datetime.utcnow())
    if user_id is not None:
        q = q.where(m.Memory.user_id == user_id)
    rows = db.scalars(q).all()
    for r in rows:
        db.delete(r)
    db.flush()
    return len(rows)

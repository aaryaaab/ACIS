from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import models as m
from app.database import get_db
from app.deps import current_user
from app.domain import MEMORY_CATEGORIES
from app.schemas import MemoryIn, MemoryUpdate
from app.services import memory_service
from app.services.embeddings import embed

router = APIRouter(prefix="/memory", tags=["memory"])


def memory_out(x: m.Memory) -> dict:
    return {"id": x.id, "category": x.category, "content": x.content, "source": x.source,
            "confidence": x.confidence, "importance": x.importance, "tags": x.tags,
            "created_at": x.created_at, "expires_at": x.expires_at}


def own_memory(db: Session, user: m.User, memory_id: int) -> m.Memory:
    mem = db.get(m.Memory, memory_id)
    if mem is None or mem.user_id != user.id:
        raise HTTPException(404, "Memory not found")
    return mem


@router.get("", summary="List my memories (optionally one category)")
def list_memories(category: str | None = None, limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
                  user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    if category and category not in MEMORY_CATEGORIES:
        raise HTTPException(422, f"category must be one of {MEMORY_CATEGORIES}")
    memory_service.purge_expired(db, user.id)
    q = select(m.Memory).where(m.Memory.user_id == user.id)
    if category:
        q = q.where(m.Memory.category == category)
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    rows = db.scalars(q.order_by(m.Memory.created_at.desc(), m.Memory.id.desc()).limit(limit).offset(offset)).all()
    db.commit()
    return {"total": total, "items": [memory_out(r) for r in rows]}


@router.get("/summary", summary="How many memories I have in each category")
def summary(user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    memory_service.purge_expired(db, user.id)
    counts = dict(db.execute(select(m.Memory.category, func.count()).where(m.Memory.user_id == user.id)
                             .group_by(m.Memory.category)).all())
    db.commit()
    return {c: counts.get(c, 0) for c in MEMORY_CATEGORIES}


@router.get("/search", summary="Semantic search over my memories")
def search(q: str = Query(min_length=1, max_length=300), limit: int = Query(5, ge=1, le=20),
           user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    return [memory_out(x) for x in memory_service.search_memories(db, user.id, q, limit)]


@router.post("", status_code=201, summary="Add a memory")
def create(data: MemoryIn, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    mem = memory_service.add_memory(db, user.id, data.category, data.content, data.source, data.confidence,
                                    data.importance, data.tags, data.ttl_days)
    db.commit()
    return memory_out(mem)


@router.get("/{memory_id}")
def get_one(memory_id: int, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    return memory_out(own_memory(db, user, memory_id))


@router.patch("/{memory_id}", summary="Edit a memory (the category cannot be changed)")
def update(memory_id: int, data: MemoryUpdate, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    mem = own_memory(db, user, memory_id)
    if data.content is not None:
        mem.content, mem.embedding = data.content.strip(), embed(data.content)
    if data.confidence is not None:
        mem.confidence = data.confidence
    if data.importance is not None:
        mem.importance = data.importance
    if data.tags is not None:
        mem.tags = data.tags
    db.commit()
    return memory_out(mem)


@router.delete("/{memory_id}", status_code=204)
def delete(memory_id: int, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(own_memory(db, user, memory_id))
    db.commit()

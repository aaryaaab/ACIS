from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import models as m
from app.config import settings
from app.database import get_db
from app.deps import current_user, get_profile
from app.schemas import MentorIn
from app.services import career_model, llm, mentor_service, orchestrator

router = APIRouter(prefix="/mentor", tags=["AI mentor"])


def message_out(x: m.MentorMessage) -> dict:
    return {"id": x.id, "role": x.role, "content": x.content, "intent": x.intent, "sources": x.sources,
            "llm_used": x.llm_used, "created_at": x.created_at}


def own_conversation(db: Session, user: m.User, conversation_id: int) -> m.MentorConversation:
    conv = db.get(m.MentorConversation, conversation_id)
    if conv is None or conv.user_id != user.id:
        raise HTTPException(404, "Conversation not found")
    return conv


@router.get("/status", summary="Is an LLM connected, or is the built-in rule-based mentor answering?")
def status(_: m.User = Depends(current_user)):
    on = llm.is_configured()
    return {"mode": "llm" if on else "rule_based", "provider": settings.llm_provider if on else None,
            "note": "" if on else "No LLM is configured. The mentor answers from your saved data using built-in rules."}


@router.post("/chat", summary="Send a message to the mentor")
def chat(data: MentorIn, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    profile = get_profile(user, db)
    conv = own_conversation(db, user, data.conversation_id) if data.conversation_id else None
    if conv is None:
        conv = m.MentorConversation(user_id=user.id, title=data.message[:60])
        db.add(conv)
        db.flush()
    history = list(conv.messages)
    portfolio = career_model.build_portfolio(db, user.id, orchestrator.explore_mode(profile))

    db.add(m.MentorMessage(conversation_id=conv.id, user_id=user.id, role="user", content=data.message))
    result = mentor_service.respond(db, user, profile, portfolio, data.message, history)
    reply = m.MentorMessage(conversation_id=conv.id, user_id=user.id, role="mentor", content=result["text"],
                            intent=result["intent"], sources=result["sources"], llm_used=result["llm_used"])
    db.add(reply)
    db.flush()
    orchestrator.log_run(db, user.id, "mentor", {"intent": result["intent"]},
                         {"llm_used": result["llm_used"], "fallback_reason": result["fallback_reason"]}, result["llm_used"])
    db.commit()
    return {"conversation_id": conv.id, "reply": message_out(reply), "mode": "llm" if result["llm_used"] else "rule_based",
            "fallback_reason": result["fallback_reason"]}


@router.get("/conversations", summary="My conversations")
def conversations(limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0),
                  user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    q = select(m.MentorConversation).where(m.MentorConversation.user_id == user.id)
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    rows = db.scalars(q.order_by(m.MentorConversation.id.desc()).limit(limit).offset(offset))
    return {"total": total, "items": [{"id": c.id, "title": c.title, "created_at": c.created_at} for c in rows]}


@router.get("/conversations/{conversation_id}", summary="All messages in one conversation")
def conversation(conversation_id: int, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    conv = own_conversation(db, user, conversation_id)
    return {"id": conv.id, "title": conv.title, "messages": [message_out(x) for x in conv.messages]}


@router.delete("/conversations/{conversation_id}", status_code=204)
def delete_conversation(conversation_id: int, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(own_conversation(db, user, conversation_id))
    db.commit()

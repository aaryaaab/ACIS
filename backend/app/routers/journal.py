from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import models as m
from app.database import get_db
from app.deps import current_user, get_profile
from app.schemas import JournalIn, ReflectionIn, VoiceTranscriptIn
from app.services import orchestrator, reflection_service, speech
from app.services.embeddings import embed

router = APIRouter(tags=["journal & reflections"])


def journal_out(e: m.JournalEntry, careers_touched: list[str] | None = None) -> dict:
    out = {"id": e.id, "text": e.text, "detected": {"fields": sorted(e.extracted.get("domains", {})),
                                                    "skills": e.extracted.get("skills", [])},
           "created_at": e.created_at}
    if careers_touched is not None:
        out["career_evidence_added_for"] = careers_touched
    return out


def reflection_out(r: m.Reflection) -> dict:
    return {"id": r.id, "enjoyed": r.enjoyed, "disliked": r.disliked, "surprised": r.surprised,
            "interests_changed": r.interests_changed, "related_careers": r.related_careers, "created_at": r.created_at}


# ------------------------------------------------------------------ journal
@router.post("/journal", status_code=201, summary="Write a journal entry")
def create_entry(data: JournalIn, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    profile = get_profile(user, db)
    entry, touched = orchestrator.journal_entry(db, user, profile, data.text)
    db.commit()
    return journal_out(entry, touched)


@router.get("/journal", summary="List my journal entries (private to me)")
def list_entries(limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0),
                 user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    q = select(m.JournalEntry).where(m.JournalEntry.user_id == user.id)
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    rows = db.scalars(q.order_by(m.JournalEntry.created_at.desc(), m.JournalEntry.id.desc()).limit(limit).offset(offset))
    return {"total": total, "items": [journal_out(e) for e in rows]}


@router.get("/journal/search", summary="Semantic search over my journal")
def search_entries(q: str = Query(min_length=1, max_length=300), limit: int = Query(5, ge=1, le=20),
                   user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(m.JournalEntry).where(m.JournalEntry.user_id == user.id, m.JournalEntry.embedding.is_not(None))
                      .order_by(m.JournalEntry.embedding.cosine_distance(embed(q))).limit(limit))
    return [journal_out(e) for e in rows]


def own_entry(db: Session, user: m.User, entry_id: int) -> m.JournalEntry:
    e = db.get(m.JournalEntry, entry_id)
    if e is None or e.user_id != user.id:
        raise HTTPException(404, "Journal entry not found")
    return e


@router.get("/journal/{entry_id}")
def get_entry(entry_id: int, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    return journal_out(own_entry(db, user, entry_id))


@router.delete("/journal/{entry_id}", status_code=204, summary="Delete an entry and the evidence/memory it created")
def delete_entry(entry_id: int, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    entry = own_entry(db, user, entry_id)
    orchestrator.delete_journal(db, user, get_profile(user, db), entry)
    db.commit()


# ------------------------------------------------------------------ voice
@router.get("/voice/status", tags=["voice"], summary="Is server-side speech-to-text available?")
def voice_status(_: m.User = Depends(current_user)):
    return {"speech_to_text": speech.is_configured(),
            "message": "" if speech.is_configured() else
            "Speech-to-text is not configured. Send a typed or browser-generated transcript instead."}


@router.post("/voice", status_code=201, tags=["voice"],
             summary="Voice journal: upload audio (if speech-to-text is configured) or send a transcript")
async def voice(audio: UploadFile | None = File(default=None), transcript: str | None = Form(default=None),
                user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    profile = get_profile(user, db)
    if (audio is None) == (transcript is None or not transcript.strip()):
        raise HTTPException(422, "Send either an audio file or a transcript, not both and not neither")
    if audio is not None:
        if not (audio.content_type or "").startswith(("audio/", "video/webm")):
            raise HTTPException(415, "Please upload an audio file")
        if not speech.is_configured():
            raise HTTPException(501, "Speech-to-text is not configured on this server. Send a transcript instead.")
        content = await audio.read(speech.MAX_AUDIO_BYTES + 1)
        if len(content) > speech.MAX_AUDIO_BYTES:
            raise HTTPException(413, "Recording is too large (10 MB maximum)")
        try:
            text = speech.transcribe(audio.filename or "recording", content, audio.content_type or "audio/webm")
        except speech.SpeechError as e:
            raise HTTPException(502, str(e))
    else:
        text = VoiceTranscriptIn(transcript=transcript).transcript
    voice_row, entry, touched = orchestrator.voice_entry(db, user, profile, text)
    db.commit()
    return {"voice_id": voice_row.id, "transcript": text, **journal_out(entry, touched), "audio_stored": False}


@router.get("/voice", tags=["voice"], summary="My voice entries (transcripts only; audio is never stored)")
def list_voice(limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0),
               user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.scalars(select(m.VoiceEntry).where(m.VoiceEntry.user_id == user.id)
                      .order_by(m.VoiceEntry.created_at.desc()).limit(limit).offset(offset))
    return [{"id": v.id, "transcript": v.transcript, "journal_entry_id": v.journal_entry_id, "created_at": v.created_at} for v in rows]


# ------------------------------------------------------------------ reflections
@router.get("/reflections/prompt", tags=["reflections"], summary="Is a reflection due? Prompts to show")
def prompt(user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    return reflection_service.prompt_status(db, user.id)


@router.post("/reflections", status_code=201, tags=["reflections"], summary="Submit a structured reflection")
def create_reflection(data: ReflectionIn, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    profile = get_profile(user, db)
    slugs = {r.slug for r in data.related_careers}
    careers = {c.slug: c for c in db.scalars(select(m.Career).where(m.Career.slug.in_(slugs)))} if slugs else {}
    unknown = slugs - set(careers)
    if unknown:
        raise HTTPException(422, f"Unknown career(s): {', '.join(sorted(unknown))}")
    ref, touched = orchestrator.reflection(db, user, profile, data, careers)
    db.commit()
    return {**reflection_out(ref), "career_evidence_added_for": touched,
            "note": "A single reflection only nudges your career picture slightly."}


@router.get("/reflections", tags=["reflections"], summary="My reflections")
def list_reflections(limit: int = Query(20, ge=1, le=100), offset: int = Query(0, ge=0),
                     user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    q = select(m.Reflection).where(m.Reflection.user_id == user.id)
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    rows = db.scalars(q.order_by(m.Reflection.created_at.desc(), m.Reflection.id.desc()).limit(limit).offset(offset))
    return {"total": total, "items": [reflection_out(r) for r in rows]}


@router.delete("/reflections/{reflection_id}", status_code=204, tags=["reflections"])
def delete_reflection(reflection_id: int, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    ref = db.get(m.Reflection, reflection_id)
    if ref is None or ref.user_id != user.id:
        raise HTTPException(404, "Reflection not found")
    orchestrator.delete_reflection(db, user, get_profile(user, db), ref)
    db.commit()

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models as m
from app.database import get_db
from app.deps import current_user, get_profile
from app.schemas import RoadmapGenerateIn, RoadmapItemUpdate
from app.services import orchestrator, roadmap_service

router = APIRouter(prefix="/roadmaps", tags=["learning roadmaps"])


def own_roadmap(db: Session, user: m.User, roadmap_id: int) -> m.Roadmap:
    road = db.get(m.Roadmap, roadmap_id)
    if road is None or road.user_id != user.id:
        raise HTTPException(404, "Roadmap not found")
    return road


def roadmap_out(db: Session, user: m.User, road: m.Roadmap, detail: bool = True) -> dict:
    items = [roadmap_service.item_details(db, user.id, i) for i in road.items]
    career = db.get(m.Career, road.career_id)
    out = {"id": road.id, "title": road.title, "career": {"slug": career.slug, "name": career.name},
           "active": road.active, "created_at": road.created_at, "progress": roadmap_service.progress(items)}
    if detail:
        out["items"] = items
    return out


@router.post("/generate", status_code=201, summary="Build a roadmap from my skill gaps for one career")
def generate(data: RoadmapGenerateIn, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    profile = get_profile(user, db)
    if orchestrator.explore_mode(profile):
        raise HTTPException(409, "Roadmaps start once you are past the Explore stage. For now, try small projects and "
                                 "write reflections to see what you enjoy.")
    career = db.scalars(select(m.Career).where(m.Career.slug == data.career_slug)).first()
    if career is None:
        raise HTTPException(404, "Unknown career")
    road, recs = orchestrator.generate_roadmap(db, user, profile, career, data.title)
    if road is None:
        raise HTTPException(409, f"You already meet every listed skill level for {career.name}, so there is nothing to plan.")
    db.commit()
    return {**roadmap_out(db, user, road), "recommendation_ids": recs}


@router.get("", summary="My roadmaps with progress")
def list_roadmaps(active_only: bool = False, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    q = select(m.Roadmap).where(m.Roadmap.user_id == user.id)
    if active_only:
        q = q.where(m.Roadmap.active.is_(True))
    return [roadmap_out(db, user, r, detail=False) for r in db.scalars(q.order_by(m.Roadmap.id.desc()))]


@router.get("/{roadmap_id}")
def get_roadmap(roadmap_id: int, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    return roadmap_out(db, user, own_roadmap(db, user, roadmap_id))


@router.patch("/{roadmap_id}/items/{item_id}", summary="Tick or untick a roadmap item")
def update_item(roadmap_id: int, item_id: int, data: RoadmapItemUpdate, user: m.User = Depends(current_user),
                db: Session = Depends(get_db)):
    road = own_roadmap(db, user, roadmap_id)
    item = db.get(m.RoadmapItem, item_id)
    if item is None or item.roadmap_id != road.id:
        raise HTTPException(404, "Roadmap item not found")
    orchestrator.roadmap_item_done(db, user, item, data.done)
    db.commit()
    return roadmap_out(db, user, road)


@router.delete("/{roadmap_id}", status_code=204)
def delete_roadmap(roadmap_id: int, user: m.User = Depends(current_user), db: Session = Depends(get_db)):
    db.delete(own_roadmap(db, user, roadmap_id))
    db.commit()

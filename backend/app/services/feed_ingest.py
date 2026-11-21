"""
Brings REAL market/career news into the database from RSS or Atom feeds you configure in
datasets/feeds.json. Nothing is invented: each saved item keeps the feed's own title, link and a short
excerpt, plus the source and the date it was retrieved. Only the excerpt is stored, never full articles.
"""
import re
from datetime import date

import httpx
from defusedxml import ElementTree as ET
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import models as m
from app.services.embeddings import embed

MAX_FEED_BYTES = 2 * 1024 * 1024
EXCERPT_CHARS = 400


class FeedError(Exception):
    pass


def _clean(text: str | None) -> str:
    text = re.sub(r"<[^>]+>", " ", text or "")
    text = re.sub(r"\s+", " ", text).strip()
    return text[:EXCERPT_CHARS]


def _local(tag: str) -> str:
    return tag.rsplit("}", 1)[-1]


def parse_feed(xml_text: str) -> list[dict]:
    try:
        root = ET.fromstring(xml_text)
    except Exception as e:                   # malformed or malicious XML
        raise FeedError(f"Could not read the feed: {type(e).__name__}") from e
    items = []
    for node in root.iter():
        if _local(node.tag) not in ("item", "entry"):
            continue
        fields = {_local(c.tag): c for c in node}
        title = _clean(fields["title"].text) if "title" in fields else ""
        link = ""
        if "link" in fields:
            link = (fields["link"].get("href") or fields["link"].text or "").strip()
        summary = ""
        for key in ("description", "summary", "content"):
            if key in fields:
                summary = _clean(fields[key].text)
                break
        if title and link.startswith(("http://", "https://")):
            items.append({"title": title[:240], "url": link[:500], "summary": summary})
    return items


def fetch_feed_text(url: str) -> str:
    try:
        with httpx.Client(timeout=20, follow_redirects=True) as client:
            r = client.get(url)
            r.raise_for_status()
            if len(r.content) > MAX_FEED_BYTES:
                raise FeedError("Feed is too large")
            return r.text
    except httpx.HTTPError as e:
        raise FeedError(f"Could not fetch {url}: {type(e).__name__}") from e


def ingest(db: Session, feed: dict, xml_text: str, today: date | None = None, max_items: int = 20) -> int:
    """feed = {"name", "url", "careers": [slugs], "licence", "attribution"}. Returns how many NEW items were saved."""
    today = today or date.today()
    src = db.scalars(select(m.Source).where(m.Source.name == feed["name"])).first() or m.Source(name=feed["name"])
    src.url, src.licence = feed.get("url", ""), feed.get("licence", "")
    src.attribution, src.last_verified = feed.get("attribution", feed["name"]), today
    db.add(src)
    db.flush()
    saved = 0
    for item in parse_feed(xml_text)[:max_items]:
        if db.scalars(select(m.MarketUpdate).where(m.MarketUpdate.url == item["url"])).first():
            continue
        db.add(m.MarketUpdate(title=item["title"], summary=item["summary"], url=item["url"], retrieved_on=today,
                              career_slugs=feed.get("careers", []), source_id=src.id,
                              embedding=embed(item["title"] + " " + item["summary"])))
        saved += 1
    db.flush()
    return saved

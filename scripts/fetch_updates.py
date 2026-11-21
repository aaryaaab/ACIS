"""Fetches the RSS/Atom feeds listed in datasets/feeds.json and saves new items (see datasets/README.md)."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.database import SessionLocal  # noqa: E402
from app.services import feed_ingest  # noqa: E402

FEEDS_FILE = Path(__file__).resolve().parents[1] / "datasets" / "feeds.json"

if __name__ == "__main__":
    feeds = json.loads(FEEDS_FILE.read_text(encoding="utf-8"))
    if not feeds:
        print("datasets/feeds.json is empty. Add feeds you have checked (see datasets/README.md).")
        sys.exit(0)
    with SessionLocal() as db:
        for feed in feeds:
            try:
                saved = feed_ingest.ingest(db, feed, feed_ingest.fetch_feed_text(feed["url"]))
                db.commit()
                print(f"{feed['name']}: {saved} new item(s)")
            except feed_ingest.FeedError as e:
                db.rollback()
                print(f"{feed['name']}: skipped ({e})")

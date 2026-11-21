import csv
import shutil
from datetime import date, timedelta
from pathlib import Path

import pytest
from sqlalchemy import select

from app import models as m
from app import seed as seed_module
from app.services import feed_ingest
from tests.helpers import ready_student, signup

TODAY = date.today()


def make_source(db, name="Fixture Source"):
    src = m.Source(name=name, url="https://example.org", licence="Test licence", attribution="Test attribution",
                   last_verified=TODAY)
    db.add(src)
    db.flush()
    return src


def make_update(db, src, title, slugs, days_old=1, url=None):
    u = m.MarketUpdate(title=title, summary="short", url=url or f"https://example.org/{title.replace(' ', '-')}",
                       career_slugs=slugs, retrieved_on=TODAY - timedelta(days=days_old), source_id=src.id)
    db.add(u)
    db.flush()
    return u


def make_opp(db, title, slugs, deadline="default", verified="default", kind="hackathon", src=None):
    o = m.Opportunity(title=title, kind=kind, provider="Fixture Provider", eligibility="Fixture eligibility",
                      deadline=TODAY + timedelta(days=20) if deadline == "default" else deadline,
                      url=f"https://example.org/{title.replace(' ', '-')}",
                      verified_on=TODAY if verified == "default" else verified, career_slugs=slugs,
                      source_id=src.id if src else None)
    db.add(o)
    db.flush()
    return o


# =============================================================== career intelligence
def test_empty_intelligence_is_honest_not_fabricated(client):
    h = ready_student(client)
    body = client.get("/intelligence", headers=h).json()
    assert body["items"] == [] and body["total"] == 0 and "never makes any up" in body["message"]


def test_intelligence_items_carry_source_and_retrieval_date(client, db):
    h = ready_student(client)
    src = make_source(db)
    make_update(db, src, "Fixture AI update", ["ai_ml_engineer"])
    item = client.get("/intelligence", headers=h).json()["items"][0]
    assert item["source"] == {"name": "Fixture Source", "url": "https://example.org", "licence": "Test licence",
                              "attribution": "Test attribution", "last_verified": TODAY.isoformat()}
    assert item["retrieved_on"] == (TODAY - timedelta(days=1)).isoformat() and item["url"] and item["why_shown"]


def test_intelligence_is_personalised_and_ordered_by_relevance(client, db):
    h = ready_student(client)
    primary = client.get("/careers/portfolio", headers=h).json()["primary"]["slug"]
    src = make_source(db)
    make_update(db, src, "General note", [], days_old=0)
    make_update(db, src, "Primary note", [primary], days_old=5)
    make_update(db, src, "Unrelated note", ["lawyer"] if primary != "lawyer" else ["doctor"], days_old=0)
    items = client.get("/intelligence", headers=h).json()["items"]
    titles = [i["title"] for i in items]
    assert titles[0] == "Primary note" and "General note" in titles and "Unrelated note" not in titles
    assert "primary" in items[0]["why_shown"]


def test_intelligence_career_filter_and_stale_flag_and_pagination(client, db):
    h = ready_student(client)
    src = make_source(db)
    make_update(db, src, "Old AI news", ["ai_ml_engineer"], days_old=120)
    make_update(db, src, "Fresh AI news", ["ai_ml_engineer"], days_old=2)
    make_update(db, src, "Law news", ["lawyer"])
    items = client.get("/intelligence?career=ai_ml_engineer", headers=h).json()["items"]
    assert {i["title"] for i in items} == {"Old AI news", "Fresh AI news"}
    assert {i["title"]: i["stale"] for i in items} == {"Old AI news": True, "Fresh AI news": False}
    assert len(client.get("/intelligence?career=ai_ml_engineer&limit=1", headers=h).json()["items"]) == 1
    assert client.get("/intelligence?limit=0", headers=h).status_code == 422


def test_intelligence_sources_list_shows_unverified_honestly(client):
    h = ready_student(client)
    sources = client.get("/intelligence/sources", headers=h).json()
    curated = next(s for s in sources if s["name"] == "ACIS curated sample")
    assert curated["last_verified"] is None and curated["licence"]
    assert client.get("/intelligence").status_code == 401


# =============================================================== feed ingestion (real feeds, no invention)
RSS = """<?xml version="1.0"?><rss version="2.0"><channel><title>Fixture feed</title>
<item><title>First &amp; item</title><link>https://example.org/1</link>
<description>&lt;p&gt;Hello &lt;b&gt;world&lt;/b&gt;.&lt;/p&gt;</description></item>
<item><title>Bad link item</title><link>javascript:alert(1)</link><description>x</description></item>
<item><title>Second</title><link>https://example.org/2</link><description>""" + ("long " * 300) + """</description></item>
</channel></rss>"""
ATOM = """<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>t</title>
<entry><title>Atom entry</title><link href="https://example.org/atom1"/><summary>An atom summary</summary></entry></feed>"""
FEED = {"name": "Fixture Feed (test)", "url": "https://example.org/feed", "careers": ["ai_ml_engineer"],
        "licence": "Test", "attribution": "Fixture"}


def test_rss_is_parsed_cleaned_and_truncated():
    items = feed_ingest.parse_feed(RSS)
    assert [i["title"] for i in items] == ["First & item", "Second"]          # the javascript: link is dropped
    assert items[0]["summary"] == "Hello world ." or items[0]["summary"] == "Hello world."
    assert "<" not in items[0]["summary"] and len(items[1]["summary"]) <= feed_ingest.EXCERPT_CHARS


def test_atom_is_parsed():
    items = feed_ingest.parse_feed(ATOM)
    assert items == [{"title": "Atom entry", "url": "https://example.org/atom1", "summary": "An atom summary"}]


def test_malicious_or_broken_xml_is_rejected():
    bomb = """<?xml version="1.0"?><!DOCTYPE lolz [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;&a;">]><rss><channel><item>
    <title>&b;</title><link>https://x.org</link></item></channel></rss>"""
    with pytest.raises(feed_ingest.FeedError):
        feed_ingest.parse_feed(bomb)
    with pytest.raises(feed_ingest.FeedError):
        feed_ingest.parse_feed("this is not xml")


def test_ingest_saves_with_source_and_date_and_skips_duplicates(db):
    assert feed_ingest.ingest(db, FEED, RSS, today=TODAY) == 2
    assert feed_ingest.ingest(db, FEED, RSS, today=TODAY) == 0                  # run again: nothing new
    rows = db.scalars(select(m.MarketUpdate).where(m.MarketUpdate.url.like("https://example.org/%"))).all()
    assert len(rows) == 2 and all(r.retrieved_on == TODAY and r.career_slugs == ["ai_ml_engineer"] for r in rows)
    src = db.scalars(select(m.Source).where(m.Source.name == FEED["name"])).one()
    assert src.last_verified == TODAY and src.licence == "Test"


def test_ingested_items_appear_in_the_api_with_attribution(client, db):
    h = ready_student(client)
    feed_ingest.ingest(db, FEED, ATOM, today=TODAY)
    item = client.get("/intelligence?career=ai_ml_engineer", headers=h).json()["items"][0]
    assert item["title"] == "Atom entry" and item["source"]["name"] == "Fixture Feed (test)"


def test_fetch_failure_raises_a_clean_error(monkeypatch):
    import httpx
    monkeypatch.setattr(httpx.Client, "get", lambda *a, **k: (_ for _ in ()).throw(httpx.ConnectError("down")))
    with pytest.raises(feed_ingest.FeedError):
        feed_ingest.fetch_feed_text("https://example.org/feed")


# =============================================================== opportunities
def test_no_opportunities_means_an_honest_empty_list(client):
    h = ready_student(client)
    body = client.get("/opportunities", headers=h).json()
    assert body["items"] == [] and "never invents" in body["message"]


def test_opportunity_fields_deadline_status_and_verification(client, db):
    h = ready_student(client)
    src = make_source(db, "Opp source")
    make_opp(db, "Open hack", ["software_engineer"], deadline=TODAY + timedelta(days=5), src=src)
    make_opp(db, "No deadline", ["software_engineer"], deadline=None)
    make_opp(db, "Old check", ["software_engineer"], verified=TODAY - timedelta(days=45))
    items = {i["title"]: i for i in client.get("/opportunities", headers=h).json()["items"]}
    o = items["Open hack"]
    assert o["status"] == "open" and o["days_left"] == 5 and o["provider"] == "Fixture Provider"
    assert o["eligibility"] and o["url"].startswith("https://") and o["verified_on"] == TODAY.isoformat()
    assert o["needs_reverification"] is False and o["source"]["name"] == "Opp source"
    assert items["No deadline"]["status"] == "no_deadline_listed" and items["No deadline"]["deadline"] is None
    assert items["Old check"]["needs_reverification"] is True and "45 day" in items["Old check"]["verification_note"]


def test_closed_and_unverified_are_hidden_unless_asked(client, db):
    h = ready_student(client)
    make_opp(db, "Closed one", ["software_engineer"], deadline=TODAY - timedelta(days=3))
    make_opp(db, "Unverified one", ["software_engineer"], verified=None)
    make_opp(db, "Fine one", ["software_engineer"])
    names = lambda q: {i["title"] for i in client.get("/opportunities" + q, headers=h).json()["items"]}
    assert names("") == {"Fine one"}
    assert "Closed one" in names("?include_closed=true")
    unv = {i["title"]: i for i in client.get("/opportunities?include_unverified=true", headers=h).json()["items"]}
    assert unv["Unverified one"]["verification_note"] == "Not verified yet" and unv["Unverified one"]["needs_reverification"]
    closed = {i["title"]: i for i in client.get("/opportunities?include_closed=true", headers=h).json()["items"]}
    assert closed["Closed one"]["status"] == "closed" and closed["Closed one"]["days_left"] == -3


def test_opportunities_are_ranked_by_relevance_then_deadline(client, db):
    h = ready_student(client)
    primary = client.get("/careers/portfolio", headers=h).json()["primary"]["slug"]
    other = "lawyer" if primary != "lawyer" else "doctor"
    make_opp(db, "Untagged soon", [], deadline=TODAY + timedelta(days=1))
    make_opp(db, "Mine later", [primary], deadline=TODAY + timedelta(days=30))
    make_opp(db, "Mine sooner", [primary], deadline=TODAY + timedelta(days=10))
    make_opp(db, "Other field", [other], deadline=TODAY + timedelta(days=2))
    order = [i["title"] for i in client.get("/opportunities", headers=h).json()["items"]]
    assert order.index("Mine sooner") < order.index("Mine later") < order.index("Untagged soon")


def test_opportunity_filters_pagination_and_detail(client, db):
    h = ready_student(client)
    make_opp(db, "An internship", ["software_engineer"], kind="internship")
    make_opp(db, "A scholarship", ["software_engineer"], kind="scholarship")
    got = client.get("/opportunities?kind=scholarship", headers=h).json()["items"]
    assert [i["title"] for i in got] == ["A scholarship"]
    assert client.get("/opportunities?kind=lottery", headers=h).status_code == 422
    assert [i["title"] for i in client.get("/opportunities?career=lawyer", headers=h).json()["items"]] == []
    assert len(client.get("/opportunities?limit=1", headers=h).json()["items"]) == 1
    oid = got[0]["id"]
    assert client.get(f"/opportunities/{oid}", headers=h).json()["title"] == "A scholarship"
    assert client.get("/opportunities/999999", headers=h).status_code == 404
    assert client.get("/opportunities").status_code == 401


# =============================================================== the seed loader refuses to load unverified opportunities
def test_seed_skips_opportunities_without_url_or_verification_date(db, monkeypatch, tmp_path):
    src_dir = Path(seed_module.DATA_DIR)
    data = tmp_path / "datasets"
    shutil.copytree(src_dir, data)
    with open(data / "opportunities.csv", "a", newline="") as f:
        w = csv.writer(f)
        w.writerow(["No URL", "hackathon", "P", "e", "", "", "2026-01-01", "software_engineer", "acis_curated"])
        w.writerow(["No date", "hackathon", "P", "e", "", "https://example.org/x", "", "software_engineer", "acis_curated"])
        w.writerow(["Complete row", "hackathon", "Real Provider", "Open to all", "2027-03-01", "https://example.org/ok",
                    "2026-11-10", "software_engineer", "acis_curated"])
    monkeypatch.setattr(seed_module, "DATA_DIR", data)
    result = seed_module.seed(db, data)
    assert result["opportunities"] == 1
    titles = {o.title for o in db.scalars(select(m.Opportunity))}
    assert "Complete row" in titles and "No URL" not in titles and "No date" not in titles


def test_seed_rejects_a_dataset_that_references_unknown_skills(db, monkeypatch, tmp_path):
    data = tmp_path / "d"
    shutil.copytree(Path(seed_module.DATA_DIR), data)
    text = (data / "project_ideas.csv").read_text().replace("python;sql", "python;made_up_skill", 1)
    (data / "project_ideas.csv").write_text(text)
    monkeypatch.setattr(seed_module, "DATA_DIR", data)
    with pytest.raises(ValueError, match="unknown skill"):
        seed_module.seed(db, data)

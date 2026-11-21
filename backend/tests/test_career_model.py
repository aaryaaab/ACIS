from datetime import datetime, timedelta, date

from sqlalchemy import select

from app import models as m
from app.services import career_model as cm
from tests.conftest import career_id


def score_of(db, uid, slug):
    return db.scalars(select(m.CareerScore).where(
        m.CareerScore.user_id == uid, m.CareerScore.career_id == career_id(db, slug))).one()


def test_scores_exist_for_every_career_and_match_the_student(db, student):
    cm.recompute_scores(db, student.id)
    rows = db.scalars(select(m.CareerScore).where(m.CareerScore.user_id == student.id)).all()
    assert len(rows) == db.query(m.Career).count()
    assert score_of(db, student.id, "ai_ml_engineer").score > score_of(db, student.id, "lawyer").score
    assert score_of(db, student.id, "software_engineer").score > score_of(db, student.id, "doctor").score


def test_assessment_only_never_gives_high_confidence(db, student):
    """No evidence over time yet -> at best Moderate. We do not fake precision."""
    cm.recompute_scores(db, student.id)
    p = cm.build_portfolio(db, student.id, explore_mode=False)
    assert p["primary"] is not None
    assert p["primary"]["confidence"] == "moderate"
    assert all(e["confidence"] != "high" for e in p["secondary"])


def test_high_confidence_needs_repeated_evidence_over_several_days(db, student):
    ai = career_id(db, "ai_ml_engineer")
    start = datetime.utcnow() - timedelta(days=40)
    cm.recompute_scores(db, student.id, today=start.date())
    for i, src in enumerate(["project", "competition", "reflection", "project"]):
        ev = cm.add_evidence(db, student.id, ai, src)
        ev.created_at = start + timedelta(days=i * 8)
    # step through time: the score may only move a little each day
    day = start.date()
    for _ in range(40):
        day += timedelta(days=1)
        cm.recompute_scores(db, student.id, today=day)
    s = score_of(db, student.id, "ai_ml_engineer")
    assert s.evidence_count == 4 and s.evidence_days == 4
    assert cm.confidence_level(s.score, s.evidence_count, s.evidence_days) == "high"


def test_single_interaction_cannot_swing_a_score(db, student):
    cm.recompute_scores(db, student.id)
    ux = career_id(db, "ux_designer")
    before = score_of(db, student.id, "ux_designer").score
    for _ in range(20):                                   # a flood of evidence on one day
        cm.add_evidence(db, student.id, ux, "project")
        cm.recompute_scores(db, student.id)
    after = score_of(db, student.id, "ux_designer").score
    assert after - before <= 0.05 + 1e-9          # the rule: at most 0.05 per day
    assert after > before                          # ...but it does move in the right direction


def test_score_moves_at_most_005_per_day_over_many_days(db, student):
    day = datetime.utcnow().date()
    cm.recompute_scores(db, student.id, today=day)
    ux = career_id(db, "ux_designer")
    prev = score_of(db, student.id, "ux_designer").score
    for i in range(10):
        day += timedelta(days=1)
        ev = cm.add_evidence(db, student.id, ux, "project")
        ev.created_at = datetime.combine(day, datetime.min.time())
        cm.recompute_scores(db, student.id, today=day)
        now_score = score_of(db, student.id, "ux_designer").score
        assert abs(now_score - prev) <= 0.05 + 1e-9
        prev = now_score


def test_one_design_video_creates_emerging_interest_not_a_new_primary(db, student):
    cm.recompute_scores(db, student.id)
    primary_before = cm.build_portfolio(db, student.id, False)["primary"]["slug"]
    cm.add_evidence(db, student.id, career_id(db, "ux_designer"), "click")
    cm.recompute_scores(db, student.id)
    portfolio = cm.build_portfolio(db, student.id, False)
    assert portfolio["primary"]["slug"] == primary_before
    ux = [e for e in portfolio["secondary"] if e["slug"] == "ux_designer"]
    assert not ux                                          # not promoted by a click


def test_same_day_clicks_are_capped(db, student):
    ux = career_id(db, "ux_designer")
    for _ in range(50):
        cm.add_evidence(db, student.id, ux, "click")
    db.flush()
    evs = db.scalars(select(m.CareerEvidence).where(m.CareerEvidence.user_id == student.id)).all()
    signal, n, days = cm.evidence_signal(evs)
    assert n == 50 and days == 1
    assert signal <= cm.EVIDENCE_WEIGHTS["click"] + 1e-9


def test_projects_count_far_more_than_clicks_and_journals(db, student):
    ux = career_id(db, "ux_designer")
    t0 = datetime.utcnow()
    def sig(kind):
        ev = m.CareerEvidence(user_id=student.id, career_id=ux, source_type=kind, direction=1,
                              strength=1.0, created_at=t0)
        return cm.evidence_signal([ev])[0]
    assert sig("project") > sig("reflection") > sig("journal") > sig("click")


def test_single_reflection_cannot_drastically_change_recommendations(db, student):
    cm.recompute_scores(db, student.id)
    before = score_of(db, student.id, "software_engineer").score
    cm.add_evidence(db, student.id, career_id(db, "software_engineer"), "reflection", direction=-1)
    cm.recompute_scores(db, student.id)
    after = score_of(db, student.id, "software_engineer").score
    assert abs(after - before) < 0.1
    p = cm.build_portfolio(db, student.id, False)
    assert p["primary"] is not None


def test_old_evidence_counts_less(db, student):
    ux = career_id(db, "ux_designer")
    old = m.CareerEvidence(user_id=student.id, career_id=ux, source_type="project", direction=1,
                           strength=1.0, created_at=datetime.utcnow() - timedelta(days=270))
    new = m.CareerEvidence(user_id=student.id, career_id=ux, source_type="project", direction=1,
                           strength=1.0, created_at=datetime.utcnow())
    assert cm.evidence_signal([old])[0] < cm.evidence_signal([new])[0] / 4


def test_explore_stage_gets_no_forced_recommendation(db, student):
    cm.recompute_scores(db, student.id)
    p = cm.build_portfolio(db, student.id, explore_mode=True)
    assert p["recommendation_allowed"] is False
    assert p["primary"] is None and p["secondary"] == []
    assert p["emerging"] and all(e["confidence"] == "emerging" for e in p["emerging"])


def test_primary_career_does_not_flip_on_a_tiny_lead(db, student):
    cm.recompute_scores(db, student.id)
    p1 = cm.build_portfolio(db, student.id, False)
    cm.record_history(db, student.id, p1)
    first = p1["primary"]["career_id"]
    runner_up = p1["secondary"][0]["career_id"] if p1["secondary"] else None
    assert runner_up
    # make the runner-up marginally better than the primary
    a = db.scalars(select(m.CareerScore).where(m.CareerScore.user_id == student.id,
                                               m.CareerScore.career_id == first)).one()
    b = db.scalars(select(m.CareerScore).where(m.CareerScore.user_id == student.id,
                                               m.CareerScore.career_id == runner_up)).one()
    b.score = a.score + 0.02
    db.flush()
    p2 = cm.build_portfolio(db, student.id, False)
    assert p2["primary"]["career_id"] == first


def test_history_records_changes_only(db, student):
    cm.recompute_scores(db, student.id)
    p = cm.build_portfolio(db, student.id, False)
    cm.record_history(db, student.id, p)
    n1 = db.query(m.CareerHistory).filter_by(user_id=student.id).count()
    cm.record_history(db, student.id, p)          # nothing changed
    assert db.query(m.CareerHistory).filter_by(user_id=student.id).count() == n1 > 0


def test_explanation_has_what_why_evidence_confidence_and_what_could_change(db, student):
    cm.recompute_scores(db, student.id)
    p = cm.build_portfolio(db, student.id, False)
    ex = cm.explain(db, student.id, p["primary"])
    assert set(ex) == {"what", "why", "evidence", "confidence", "what_could_change"}
    assert ex["evidence"] and ex["what_could_change"]
    assert "guarantee" not in ex["why"].lower()

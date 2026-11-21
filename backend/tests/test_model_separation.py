"""
The key architectural rule: Career, Learning and Growth models stay independent.

Worked example from the spec: a student loves AI but abandons a long, theoretical
AI course. Their AI career interest must stay put; only their learning
preferences should change.
"""
import ast
from pathlib import Path

from sqlalchemy import select

from app import models as m
from app.services import career_model, learning_model, growth_model
from tests.conftest import career_id

SERVICES = Path(__file__).resolve().parents[1] / "app" / "services"

CAREER_TABLES = {"CareerProfile", "CareerScore", "CareerEvidence", "CareerHistory"}
LEARNING_TABLES = {"LearningPreference", "ResourceFeedback"}
GROWTH_TABLES = {"StudentSkill", "Project", "Achievement"}


def snapshot_career(db, uid):
    scores = sorted((s.career_id, round(s.score, 6), s.evidence_count) for s in
                    db.scalars(select(m.CareerScore).where(m.CareerScore.user_id == uid)))
    evidence = db.query(m.CareerEvidence).filter_by(user_id=uid).count()
    history = db.query(m.CareerHistory).filter_by(user_id=uid).count()
    return scores, evidence, history


def theoretical_ai_course(db):
    return db.scalars(select(m.Resource).where(m.Resource.title.like("NPTEL: machine learning%"))).one()


# ---------------------------------------------------------------- behaviour
def test_abandoning_theoretical_ai_course_does_not_change_ai_career(db, student):
    career_model.recompute_scores(db, student.id)
    ai = career_id(db, "ai_ml_engineer")
    before = snapshot_career(db, student.id)
    prefs_before = learning_model.get_preferences(db, student.id)

    course = theoretical_ai_course(db)
    for _ in range(10):                       # ten bad sessions, as in the spec's example
        learning_model.record_feedback(db, student.id, course, "abandoned", rating=1,
                                       comment="too theoretical")
    career_model.recompute_scores(db, student.id)

    assert snapshot_career(db, student.id) == before          # career model untouched
    prefs_after = learning_model.get_preferences(db, student.id)
    assert prefs_after["theory"] < prefs_before["theory"]      # dislikes theory more
    assert prefs_after["video"] < prefs_before["video"]        # video format preference falls
    assert prefs_after["project"] > prefs_before["project"]     # project-based learning rises
    assert db.query(m.CareerEvidence).filter_by(user_id=student.id, career_id=ai).count() == 0


def test_next_resource_after_bad_theory_course_is_hands_on(db, student):
    course = theoretical_ai_course(db)
    for _ in range(6):
        learning_model.record_feedback(db, student.id, course, "abandoned", rating=1)
    prefs = learning_model.get_preferences(db, student.id)
    ml = db.scalars(select(m.Resource).where(m.Resource.title.like("Kaggle Learn: Intro to Machine%"))).one()
    assert learning_model.fit_score(prefs, ml) > learning_model.fit_score(prefs, course)


def test_growth_events_do_not_touch_learning_preferences(db, student):
    prefs_before = learning_model.get_preferences(db, student.id)
    python = db.scalars(select(m.Skill).where(m.Skill.slug == "python")).one()
    growth_model.set_skill_level(db, student.id, python, 3)
    p = growth_model.start_project(db, student.id, "Spam classifier", skill_slugs=["python"])
    growth_model.complete_project(db, student.id, p)
    growth_model.add_achievement(db, student.id, "competition", "College hackathon")
    assert learning_model.get_preferences(db, student.id) == prefs_before
    assert db.query(m.ResourceFeedback).filter_by(user_id=student.id).count() == 0


def test_growth_events_alone_do_not_change_career_scores(db, student):
    """The growth model itself never writes career data. (The orchestrator may
    pass evidence to the career model as an explicit, separate step.)"""
    career_model.recompute_scores(db, student.id)
    before = snapshot_career(db, student.id)
    p = growth_model.start_project(db, student.id, "Line follower", skill_slugs=["python"])
    growth_model.complete_project(db, student.id, p)
    assert snapshot_career(db, student.id) == before


# ---------------------------------------------------------------- structure
def imported_names(path: Path) -> set[str]:
    tree = ast.parse(path.read_text())
    names = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name) and node.value.id == "m":
            names.add(node.attr)                     # m.CareerScore -> CareerScore
        if isinstance(node, ast.ImportFrom) and node.module:
            names.add(node.module)
            names.update(a.name for a in node.names)
    return names


def test_learning_service_never_references_career_or_growth_tables():
    used = imported_names(SERVICES / "learning_model.py")
    assert not used & (CAREER_TABLES | GROWTH_TABLES)
    assert "career_model" not in used and "growth_model" not in used


def test_growth_service_never_references_career_or_learning_tables():
    used = imported_names(SERVICES / "growth_model.py")
    assert not used & (CAREER_TABLES | LEARNING_TABLES)
    assert "career_model" not in used and "learning_model" not in used


def test_career_service_never_references_learning_or_growth_tables():
    used = imported_names(SERVICES / "career_model.py")
    assert not used & (LEARNING_TABLES | GROWTH_TABLES)
    assert "learning_model" not in used and "growth_model" not in used


# Modules that only READ career tables (a timeline must show career history; an export must include it).
READ_ONLY_READERS = {"timeline_service.py", "research_service.py"}
CAREER_WRITERS = {"career_model.py", "orchestrator.py", "__init__.py"}
WRITE_CALLS = {"add", "add_all", "delete", "flush", "commit", "merge", "bulk_save_objects"}


def test_other_services_do_not_mention_career_tables_at_all():
    """Anything that is not the career model, the orchestrator or a declared reader stays away from them."""
    for path in SERVICES.glob("*.py"):
        if path.name in CAREER_WRITERS | READ_ONLY_READERS:
            continue
        used = imported_names(path)
        assert not used & CAREER_TABLES, path.name


def test_reader_modules_are_provably_read_only():
    for name in READ_ONLY_READERS:
        tree = ast.parse((SERVICES / name).read_text())
        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Attribute):
                assert node.func.attr not in WRITE_CALLS, f"{name} calls .{node.func.attr}()"
            if isinstance(node, (ast.Assign, ast.AugAssign)):
                targets = node.targets if isinstance(node, ast.Assign) else [node.target]
                assert not any(isinstance(t, ast.Attribute) for t in targets), f"{name} assigns to an attribute"
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                assert node.func.id not in {"update", "insert", "delete"}, f"{name} builds a write statement"


def test_career_writing_functions_are_only_called_from_the_orchestrator():
    """Even services that never touch the tables must not call the career model's write functions."""
    writers = {"add_evidence", "recompute_scores", "record_history", "remove_evidence_by_note", "refresh_career_profile"}
    for path in SERVICES.glob("*.py"):
        if path.name in {"career_model.py", "orchestrator.py"}:
            continue
        called = {n.func.attr if isinstance(n.func, ast.Attribute) else getattr(n.func, "id", "")
                  for n in ast.walk(ast.parse(path.read_text())) if isinstance(n, ast.Call)}
        assert not called & writers, f"{path.name} calls {called & writers}"


def test_mentor_roadmap_and_recommenders_never_write_learning_or_growth_data():
    """They may READ preferences, feedback and skills, but never create those rows or call the functions that do."""
    protected = LEARNING_TABLES | {"StudentSkill", "Achievement", "Project", "LearningPreference"}
    write_functions = {"record_feedback", "set_skill_level", "start_project", "complete_project", "add_achievement",
                       "resource_feedback"}
    for name in ["mentor_service.py", "recommenders.py", "roadmap_service.py"]:
        for node in ast.walk(ast.parse((SERVICES / name).read_text())):
            if not isinstance(node, ast.Call):
                continue
            f = node.func
            if isinstance(f, ast.Attribute) and isinstance(f.value, ast.Name) and f.value.id == "m":
                assert f.attr not in protected, f"{name} creates m.{f.attr}(...)"
            called = f.attr if isinstance(f, ast.Attribute) else getattr(f, "id", "")
            assert called not in write_functions, f"{name} calls {called}()"

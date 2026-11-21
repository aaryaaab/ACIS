import os
from datetime import datetime

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

TEST_URL = os.environ.get("TEST_DATABASE_URL", "postgresql+psycopg://acis:acis@localhost:5432/acis_test")
os.environ["DATABASE_URL"] = TEST_URL          # must be set before the app is imported

from app import models as m                     # noqa: E402
from app.database import Base                   # noqa: E402
from app.seed import seed                       # noqa: E402


@pytest.fixture(scope="session")
def engine():
    eng = create_engine(TEST_URL)
    with eng.begin() as c:
        c.exec_driver_sql("CREATE EXTENSION IF NOT EXISTS vector")
    Base.metadata.drop_all(eng)
    Base.metadata.create_all(eng)
    with Session(eng) as s:
        seed(s)
    yield eng
    eng.dispose()


@pytest.fixture()
def db(engine):
    """Each test runs inside a transaction that is rolled back afterwards."""
    conn = engine.connect()
    trans = conn.begin()
    session = Session(bind=conn, join_transaction_mode="create_savepoint", expire_on_commit=False)
    yield session
    session.close()
    trans.rollback()
    conn.close()


@pytest.fixture()
def student(db):
    """A student who loves technology and AI-ish things."""
    u = m.User(email=f"s{datetime.utcnow().timestamp()}@example.com", full_name="Test Student")
    db.add(u)
    db.flush()
    db.add(m.StudentProfile(user_id=u.id, stage="learn", education_level="btech_2"))
    for domain, lvl in {"technology": 0.95, "mathematics": 0.8, "science": 0.5, "engineering": 0.5,
                        "arts_design": 0.2, "business": 0.2, "healthcare": 0.1,
                        "social_impact": 0.2, "writing_media": 0.2, "law_governance": 0.1}.items():
        db.add(m.Interest(user_id=u.id, domain=domain, level=lvl))
    db.add(m.AptitudeResult(user_id=u.id, scores={"logical": 0.85, "numerical": 0.8, "verbal": 0.5,
                                                   "spatial": 0.5, "creative": 0.4}))
    db.add(m.PersonalityResult(user_id=u.id, scores={"openness": 0.7, "conscientiousness": 0.7,
                                                      "extraversion": 0.5, "agreeableness": 0.6,
                                                      "emotional_stability": 0.6}))
    db.flush()
    return u


def career_id(db, slug):
    return db.scalars(select(m.Career.id).where(m.Career.slug == slug)).one()


# ---- shared by the API test files -------------------------------------------------
from fastapi.testclient import TestClient   # noqa: E402


class StatelessClient(TestClient):
    """Behaves like an API client with no cookie jar. (Real browsers keep cookies; see the `browser` fixture.)
    Without this, a cookie set by sign-up would silently authenticate later requests that are meant to be anonymous."""

    def request(self, *args, **kwargs):
        try:
            return super().request(*args, **kwargs)
        finally:
            self.cookies.clear()


@pytest.fixture()
def client(db):
    from app.database import get_db
    from app.main import app
    app.dependency_overrides[get_db] = lambda: db
    yield StatelessClient(app)
    app.dependency_overrides.clear()


@pytest.fixture()
def browser(db):
    """A client that keeps cookies, like a browser does."""
    from app.database import get_db
    from app.main import app
    app.dependency_overrides[get_db] = lambda: db
    yield TestClient(app)
    app.dependency_overrides.clear()

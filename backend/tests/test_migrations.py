"""
The other tests build tables straight from the models. This one runs the REAL Alembic migrations on an empty database,
so a model change without a matching migration is caught here.
"""
import os
from pathlib import Path

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import create_engine, text
from sqlalchemy.engine import make_url

from app.config import settings
from app.database import Base

BACKEND = Path(__file__).resolve().parents[1]
TEST_URL = os.environ.get("TEST_DATABASE_URL", "postgresql+psycopg://acis:acis@localhost:5432/acis_test")
SCRATCH = "acis_migration_check"


@pytest.fixture()
def scratch_db(monkeypatch):
    """An empty throw-away database. Skipped if this database user may not create databases."""
    url = make_url(TEST_URL)
    admin = create_engine(url.set(database="postgres"), isolation_level="AUTOCOMMIT")
    def drop(c):
        c.execute(text("select pg_terminate_backend(pid) from pg_stat_activity where datname = :d and pid <> pg_backend_pid()"), {"d": SCRATCH})
        c.execute(text(f'DROP DATABASE IF EXISTS "{SCRATCH}"'))
    try:
        with admin.connect() as c:
            drop(c)
            c.execute(text(f'CREATE DATABASE "{SCRATCH}"'))
    except Exception as e:                                   # noqa: BLE001
        pytest.skip(f"cannot create a scratch database: {type(e).__name__}")
    scratch_url = url.set(database=SCRATCH)
    monkeypatch.setattr(settings, "database_url", scratch_url.render_as_string(hide_password=False))
    engine = create_engine(scratch_url)
    yield engine
    engine.dispose()
    with admin.connect() as c:
        drop(c)
    admin.dispose()


def config() -> Config:
    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND / "alembic"))
    return cfg


def tables(engine):
    with engine.connect() as c:
        return {r[0] for r in c.execute(text("select table_name from information_schema.tables where table_schema='public'"))}


def test_migrations_build_exactly_the_schema_the_models_describe(scratch_db):
    command.upgrade(config(), "head")
    head = ScriptDirectory.from_config(config()).get_current_head()
    with scratch_db.connect() as conn:
        assert conn.execute(text("select version_num from alembic_version")).scalar() == head
        assert compare_metadata(MigrationContext.configure(conn), Base.metadata) == []      # no difference at all
    assert tables(scratch_db) - {"alembic_version"} == set(Base.metadata.tables)
    assert len(Base.metadata.tables) == 38


def test_pgvector_is_enabled_and_embeddings_are_384_dimensions(scratch_db):
    command.upgrade(config(), "head")
    with scratch_db.connect() as c:
        assert c.execute(text("select count(*) from pg_extension where extname='vector'")).scalar() == 1
        kinds = {r[0] for r in c.execute(text(
            "select format_type(a.atttypid, a.atttypmod) from pg_attribute a join pg_class t on t.oid=a.attrelid "
            "where a.attname='embedding' and t.relkind='r'"))}
        assert kinds == {"vector(384)"}


def test_foreign_keys_cascade_so_deleting_a_user_deletes_their_data(scratch_db):
    command.upgrade(config(), "head")
    with scratch_db.begin() as c:
        c.execute(text("insert into users (email, full_name, created_at) values ('a@b.co','A', now())"))
        uid = c.execute(text("select id from users")).scalar()
        c.execute(text("insert into memories (user_id, category, content, source, confidence, importance, tags, created_at) "
                       "values (:u,'stable','x','test',0.5,0.5,'[]', now())"), {"u": uid})
        c.execute(text("delete from users"))
        assert c.execute(text("select count(*) from memories")).scalar() == 0


def test_every_migration_can_be_undone_and_redone(scratch_db):
    command.upgrade(config(), "head")
    command.downgrade(config(), "base")
    assert tables(scratch_db) == {"alembic_version"}
    command.upgrade(config(), "head")
    assert len(tables(scratch_db) - {"alembic_version"}) == 38


def test_upgrading_an_existing_database_keeps_its_data(scratch_db):
    """A deployment already running migration 0002 upgrades to the latest without losing users."""
    command.upgrade(config(), "0002")
    with scratch_db.begin() as c:
        c.execute(text("insert into users (email, full_name, created_at) values ('old@b.co','Old', now())"))
    command.upgrade(config(), "head")
    with scratch_db.connect() as c:
        row = c.execute(text("select email, session_epoch from users")).one()
        assert row == ("old@b.co", 0)

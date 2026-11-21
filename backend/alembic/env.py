from alembic import context
from sqlalchemy import create_engine

from app import models  # noqa: F401  (registers the tables)
from app.config import settings
from app.database import Base

target_metadata = Base.metadata


def run_migrations_online():
    engine = create_engine(settings.database_url)
    try:
        with engine.connect() as connection:
            context.configure(connection=connection, target_metadata=target_metadata)
            with context.begin_transaction():
                context.run_migrations()
    finally:
        engine.dispose()                      # do not leave a connection open after migrating


run_migrations_online()

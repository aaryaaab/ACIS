"""
Container start-up. Written in Python (not a shell script) so Windows line endings cannot break it.

1. wait until PostgreSQL accepts connections
2. apply database migrations
3. load the starter datasets (safe to repeat; set SEED_ON_START=false to skip)
4. start the API
"""
import os
import subprocess
import sys
import time

from sqlalchemy import create_engine, text

from app.config import check_production_settings, settings


def wait_for_database(attempts: int = 60, delay: float = 2.0) -> None:
    engine = create_engine(settings.database_url, pool_pre_ping=True)
    for i in range(1, attempts + 1):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            print(f"[acis] database is ready (attempt {i})", flush=True)
            return
        except Exception as e:                                        # noqa: BLE001 (any failure means "not ready yet")
            print(f"[acis] waiting for the database ({i}/{attempts}): {type(e).__name__}", flush=True)
            time.sleep(delay)
    sys.exit("[acis] the database never became ready. Check POSTGRES_PASSWORD and DATABASE_URL.")


def main() -> None:
    check_production_settings(settings)                              # fail early, with a clear message
    wait_for_database()
    print("[acis] applying migrations", flush=True)
    subprocess.run(["alembic", "upgrade", "head"], check=True)
    if os.environ.get("SEED_ON_START", "true").lower() != "false":
        from app.database import SessionLocal
        from app.seed import seed
        with SessionLocal() as db:
            print("[acis] seeded:", seed(db), flush=True)
    print("[acis] starting the API on port 8000", flush=True)
    # One worker on purpose: the login rate limiter lives in memory (see README).
    os.execvp("uvicorn", ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"])


if __name__ == "__main__":
    main()

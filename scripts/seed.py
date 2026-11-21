import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))

from app.database import SessionLocal  # noqa: E402
from app.seed import seed  # noqa: E402

if __name__ == "__main__":
    with SessionLocal() as db:
        print(seed(db))

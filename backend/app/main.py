from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import check_production_settings, settings
from app.routers import (auth, careers, growth, intelligence, journal, learning, memory, mentor, opportunities,
                         research, roadmaps, student, timeline)

DESCRIPTION = """
Adaptive Career Intelligence System.

* Every route except `/auth/register`, `/auth/login` and `/health` needs a login: the httpOnly session cookie (the website, plus an `X-CSRF-Token` header on changes) or `Authorization: Bearer <token>` (API clients, Swagger).
* Every student's data is private to them. Asking for someone else's record returns 404.
* Career, Learning and Growth are separate models. Only the career model writes career scores.
* Nothing is invented: opportunities, market updates and sources come from the database with their
  source and verification dates. Empty lists mean "nothing verified is saved", not "none exist".
"""

check_production_settings(settings)          # in production, unsafe settings stop the server here

app = FastAPI(title="ACIS API", version="1.0.0", description=DESCRIPTION)

app.add_middleware(CORSMiddleware, allow_origins=[o.strip() for o in settings.cors_origins.split(",") if o.strip()],
                   allow_credentials=True, allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
                   allow_headers=["Content-Type", "Authorization", "X-CSRF-Token"])


@app.middleware("http")
async def security_headers(request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    if not request.url.path.startswith(("/docs", "/redoc", "/openapi.json")):
        response.headers.setdefault("Cache-Control", "no-store")          # personal data must not be cached
    return response

for r in (auth.router, student.router, careers.router, learning.router, growth.router,
          memory.router, journal.router, timeline.router, mentor.router, intelligence.router,
          opportunities.router, roadmaps.router, research.router):
    app.include_router(r)


@app.get("/health", tags=["system"])
def health():
    return {"status": "ok"}

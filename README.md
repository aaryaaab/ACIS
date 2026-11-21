# ACIS: Adaptive Career Intelligence System

*Don't just choose a career. Build one.*

ACIS is an AI-assisted career mentoring platform for the Indian education ecosystem. Conventional career tools run one
quiz and give one fixed answer. ACIS keeps learning about the student over time and adapts its guidance as the student
grows, from Class 8 to a working professional.

> **Read the [Known limitations](#13-known-limitations) section before you demo or submit this project.**
> Some features are intentionally incomplete and the README says exactly which.

## Contents

1. [Research novelty](#1-research-novelty)
2. [Features](#2-features)
3. [Architecture](#3-architecture)
4. [Technology stack](#4-technology-stack)
5. [Database structure](#5-database-structure)
6. [Quick start with Docker (recommended)](#6-quick-start-with-docker-recommended)
7. [Run on Windows without Docker for the app (Docker for the database only)](#7-run-on-windows-database-in-docker-app-on-your-computer)
8. [Environment variables](#8-environment-variables)
9. [Authentication](#9-authentication)
10. [API documentation](#10-api-documentation)
11. [Running the tests](#11-running-the-tests)
12. [Deployment](#12-deployment)
13. [Known limitations](#13-known-limitations)
14. [Datasets and attribution](#14-datasets-and-attribution)
15. [Project layout](#15-project-layout)
16. [Troubleshooting](#16-troubleshooting)

---

## 1. Research novelty

ACIS keeps **three independent adaptive models**. They live in separate tables and separate code, and one model never
writes to another.

| Model | Tracks | Code |
|---|---|---|
| **Career Model** | interests, aptitude, academic strengths, career suitability | `backend/app/services/career_model.py` |
| **Learning Model** | learning preferences, resource ratings, course completion, preferred formats | `backend/app/services/learning_model.py` |
| **Growth Model** | actual skills, projects, certifications, achievements, progress | `backend/app/services/growth_model.py` |

Example: a student likes AI but keeps abandoning long theory-heavy AI videos and prefers practical projects.

- The Career Model **keeps** the AI interest.
- The Learning Model **moves** towards hands-on formats.
- The Growth Model **records** the projects completed and skills gained.

`backend/tests/test_model_separation.py` checks that one model's data cannot change another's.

Other research contributions:

- **Long-term adaptive memory** in four categories (`backend/app/services/memory_service.py`).
- **Stable recommendations**: a recommendation does not flip because of one click or one bad course
  (`backend/app/services/recommenders.py`, `backend/app/services/orchestrator.py`).
- **Explainable recommendations**: every suggestion shows why it appeared and what could change it. Confidence is shown
  as High / Moderate / Emerging, never as a made-up percentage.
- **Life-stage mentoring**: Explore (Class 8-10), Decide (Class 11-12), Learn (college), Build (projects and
  portfolios), Launch (final year and graduates), Grow (working professionals).
- **Personalised learning roadmaps and skill-gap analysis.**
- **Research logging and an anonymised export** for the evaluation chapter of your report (opt-in only).

## 2. Features

All 18 screens are built and call the real backend:

Landing, Signup, Login, Onboarding, Assessment, Career dashboard, Career directions, Career comparison, Career timeline,
Learning roadmap, Skills dashboard, Learning resources, Progress, AI Mentor, Career intelligence, Opportunities,
Reflections, Student profile and settings.

Backend: authentication and sessions, onboarding and assessments (including Rapid Decision Mode), the three models,
recommendations and comparisons, memory, journals and reflections, voice journal, AI Mentor with conversation history,
timeline, career intelligence, opportunities, roadmaps, skill-gap analysis, research logging/export, and account data
download/deletion. See [API documentation](#10-api-documentation) (73 endpoints including `/health`).

Everything core works with **no paid API and no API key**. The mentor uses a built-in rule-based answerer unless you
connect a language model (optional).

Safety: if a student writes about self-harm, the mentor does not give career advice. It shows Tele-MANAS (14416) and
112. **Re-check these numbers before any real launch.** Under-18 students need guardian consent.

## 3. Architecture

```
 Browser
   |   (only talks to the website's own address, e.g. http://localhost:3000)
   v
 Next.js frontend  (port 3000)
   |   /api/*  is forwarded by Next.js to the backend, so the login cookie is first-party
   v
 FastAPI backend   (port 8000)  ---->  PostgreSQL 16 + pgvector  (port 5432)
   |
   +--> optional: LLM (Ollama / OpenAI-compatible), optional speech-to-text
```

- The browser never holds an API key and never stores a login token in `localStorage`.
- The backend runs migrations and loads the starter datasets when it starts (`backend/entrypoint.py`).
- The backend runs **one** worker on purpose, because the login rate limiter is in memory (see limitations).

## 4. Technology stack

Exact versions are pinned in `backend/requirements.txt` and `frontend/package.json` (+ `package-lock.json`).

| Layer | Technology |
|---|---|
| Frontend | Next.js 15.5.29, React 19, TypeScript, Tailwind CSS 3, Recharts 2 |
| Backend | Python, FastAPI 0.163.1, Pydantic 2, SQLAlchemy 2.1, Alembic |
| Database | PostgreSQL 16 with the pgvector extension |
| Auth | httpOnly cookie sessions, CSRF header, bcrypt, PyJWT 2.15.1 |
| Tests | pytest (backend + end-to-end), Vitest + Testing Library (frontend) |
| Packaging | Docker and Docker Compose |

## 5. Database structure

38 tables, created by 3 Alembic migrations in `backend/alembic/versions/`. The pgvector extension is enabled by the
first migration. Groups:

| Group | Tables |
|---|---|
| Accounts | `users`, `student_profiles` |
| Career Model | `interests`, `aptitude_results`, `personality_results`, `academic_records`, `career_profiles`, `career_scores`, `career_evidence`, `career_history`, `careers`, `degrees`, `career_degrees`, `career_skills` |
| Learning Model | `learning_preferences`, `resources`, `resource_skills`, `resource_feedback` |
| Growth Model | `skills`, `student_skills`, `projects`, `project_ideas`, `achievements` |
| Recommendations and research | `recommendations`, `recommendation_feedback`, `agent_runs` |
| Memory and reflection | `memories`, `journal_entries`, `reflections`, `voice_entries` |
| Mentor | `mentor_conversations`, `mentor_messages` |
| Planning | `roadmaps`, `roadmap_items` |
| External data | `opportunities`, `market_updates`, `sources`, `notifications` |

(`alembic_version` is Alembic's own bookkeeping table.)

---

## 6. Quick start with Docker (recommended)

**Install first:** [Docker Desktop for Windows](https://www.docker.com/products/docker-desktop/) (turn on the WSL 2
option when it asks) and make sure it is running (whale icon in the system tray).

Open **PowerShell** in the project folder (the folder that contains `docker-compose.yml`).

**Step 1. Create your settings file**

```
copy .env.example .env
```

**Step 2. Fill in the two required values.** Open `.env` in Notepad. Replace the two placeholders:

- `POSTGRES_PASSWORD`: letters and digits only. To generate one:
  `py -c "import secrets,string;print(''.join(secrets.choice(string.ascii_letters+string.digits) for _ in range(32)))"`
- `SECRET_KEY`: at least 32 random characters. To generate one:
  `py -c "import secrets;print(secrets.token_urlsafe(48))"`

**Step 3. Build and start everything**

```
docker compose up --build
```

The first build takes several minutes. When you see `Uvicorn running on http://0.0.0.0:8000`, open:

- **http://localhost:3000**: the website. Sign up, finish onboarding, take the assessment.
- http://localhost:8000/docs: the interactive API documentation (Swagger).

Stop with `Ctrl+C`. Start again in the background with `docker compose up -d`. To erase the database as well:
`docker compose down -v`.

> **Verification status of this Docker setup.** The Compose file passes `docker compose config`, and the same start-up
> sequence the backend container runs (`backend/entrypoint.py`: wait for DB, migrate, seed, serve) and the same
> standalone frontend server the frontend container runs were executed and tested outside Docker. The images themselves
> **have not been built here** because the environment this was prepared in could not reach Docker Hub. The first
> `docker compose up --build` on your computer is the real test. If it fails, see [Troubleshooting](#16-troubleshooting).

## 7. Run on Windows: database in Docker, app on your computer

Use this when you want to edit code and see changes immediately. PostgreSQL with pgvector is hard to install natively on
Windows, so the database still runs in Docker. If you cannot use Docker, you need a PostgreSQL 16 server with the
pgvector extension installed by other means (not covered or tested here).

**Install first:** Python 3.12 (the version in the backend Docker image; 3.13 also passed the tests),
Node.js 22 LTS (also from nodejs.org), Docker Desktop. In the installer, tick **"Add Python to PATH"**.

**1. Settings and database** (PowerShell, in the project folder)

```
copy .env.example .env
```

Edit `.env` (set `POSTGRES_PASSWORD` and `SECRET_KEY` as in step 2 above), then:

```
docker compose up -d db
```

This creates the `acis` database and an empty `acis_test` database for the tests.

**2. Backend** (first terminal)

```
cd backend
py -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
```

Edit `backend\.env`: set `DATABASE_URL` to
`postgresql+psycopg://acis:YOUR_POSTGRES_PASSWORD@localhost:5432/acis` (the same password as in the root `.env`) and
`SECRET_KEY` to a random string. Then:

```
alembic upgrade head
python ..\scripts\seed.py
uvicorn app.main:app --reload --port 8000
```

The API is at http://localhost:8000 (docs at `/docs`).

**3. Frontend** (second terminal)

```
cd frontend
npm ci
copy .env.example .env.local
npm run dev
```

Open http://localhost:3000.

## 8. Environment variables

Real values go in `.env` files that are **never committed** (they are in `.gitignore` and `.dockerignore`). The
`.env.example` files hold placeholders only.

| Variable | Needed? | Meaning |
|---|---|---|
| `POSTGRES_PASSWORD` | **required (Docker)** | Database password |
| `SECRET_KEY` | **required** | Signs sessions. 32+ random characters |
| `DATABASE_URL` | manual setup only | Backend database address (Docker Compose builds it for you) |
| `ENVIRONMENT` | optional | `development` (default) or `production` (strict start-up checks) |
| `COOKIE_SECURE` | optional | `true` when served over HTTPS (required in production) |
| `CORS_ORIGINS` | optional | Exact website address(es) allowed to log in, comma separated. Default `http://localhost:3000` |
| `AUTH_MODE` | optional | `local` (default, working). `supabase` is **not** fully supported |
| `SUPABASE_JWT_SECRET` | optional | Only for the incomplete `supabase` mode |
| `LLM_PROVIDER`, `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` | optional | Mentor language model: `none`, `ollama` (free, local) or `openai_compatible`. Without it, the rule-based mentor answers |
| `STT_PROVIDER`, `STT_API_KEY`, `STT_BASE_URL`, `STT_MODEL` | optional | Server-side speech-to-text. Not required: browser dictation works without it |
| `RESEARCHER_EMAILS` | optional | Emails allowed to download the anonymised research export |
| `SEED_ON_START` | optional | `true` (default): load starter datasets on backend start |
| `FRONTEND_PORT`, `BACKEND_PORT`, `DB_PORT`, `POSTGRES_USER`, `POSTGRES_DB` | optional | Docker ports and names |
| `BACKEND_URL` (frontend) | optional | Where the frontend server finds the backend. Read at **build** time |
| `CSP_REPORT_ONLY` (frontend) | optional | `true` makes the Content-Security-Policy report-only. Read at **build** time |

To use a free local mentor model: install [Ollama](https://ollama.com), then set `LLM_PROVIDER=ollama` and
`LLM_MODEL=<model name>`. If the model is unreachable, the mentor falls back to its built-in answers.

## 9. Authentication

Local email/password authentication is the working mode (`AUTH_MODE=local`).

- Login sets an **httpOnly session cookie**; JavaScript cannot read it. No token is kept in `localStorage`.
- Every change request (POST/PUT/PATCH/DELETE) must carry an `X-CSRF-Token` header that matches the CSRF cookie.
- Login attempts are rate limited per email, and requests are origin-checked against `CORS_ORIGINS`.
- Signing out revokes **every** session of the account on the server (`/auth/logout`).
- Security headers are set by the frontend, and in `ENVIRONMENT=production` the backend refuses to start with a weak
  `SECRET_KEY`, `COOKIE_SECURE=false` or `CORS_ORIGINS=*`.
- API clients and Swagger can instead send `Authorization: Bearer <token>` with the token from `/auth/login`.

**Supabase sign-in is not finished** (there is backend JWT verification but no complete frontend flow). Do not set
`AUTH_MODE=supabase`.

## 10. API documentation

- Full table of all 73 endpoints (72 feature endpoints plus `/health`): [`docs/API.md`](docs/API.md).
- Interactive: start the backend and open http://localhost:8000/docs (Swagger) or `/redoc`.
- Regenerate `docs/API.md` from the code after you change the API: `python scripts/export_api_docs.py`.

## 11. Running the tests

**Backend** (needs the `acis_test` database, which `docker compose up -d db` creates). The tests default to user
`acis` / password `acis`, so tell them your real password:

```
cd backend
.venv\Scripts\activate
set TEST_DATABASE_URL=postgresql+psycopg://acis:YOUR_POSTGRES_PASSWORD@localhost:5432/acis_test
pytest
```

**Frontend**

```
cd frontend
npm test
npm run typecheck
npm run build
```

**End-to-end** (run against the *running* website; nothing is mocked). The backend must be started with
`RESEARCHER_EMAILS=e2e-researcher@example.com`.

```
set ACIS_E2E_URL=http://localhost:3000
set ACIS_E2E_RESEARCHER_EMAIL=e2e-researcher@example.com
cd backend
pytest ..\tests\e2e -v
```

**Frontend live-contract tests** (15 tests that are skipped unless pointed at a running stack):

```
cd frontend
set ACIS_LIVE_API=1
set NEXT_PUBLIC_API_BASE=http://localhost:3000/api
npx vitest run src/test/live
```

Results from the final verification run are in `VERIFICATION_REPORT.md`.

## 12. Deployment

1. Get a Linux server (or a cloud VM) with Docker, and a domain name with HTTPS in front (for example Caddy or Nginx with
   Let's Encrypt, forwarding to port 3000). The session cookie requires HTTPS in production.
2. Copy the project and create `.env` with:
   ```
   ENVIRONMENT=production
   COOKIE_SECURE=true
   CORS_ORIGINS=https://your-domain.example
   POSTGRES_PASSWORD=<long random letters and digits>
   SECRET_KEY=<48+ random characters>
   ```
3. `docker compose up -d --build`.
4. Only expose ports 80/443. The database and backend ports are already bound to `127.0.0.1`.
5. Back up the `acis_pgdata` Docker volume regularly.

Because the login rate limiter is per process, run a single backend worker (the default).

## 13. Known limitations

These are real and are not hidden:

1. **Supabase sign-in** has no complete frontend implementation. Local authentication is the working mode.
2. **Embedding API option is not implemented.** pgvector tables and a local hash-based embedding exist; an external
   embedding provider does not. Do not claim every embedding integration works.
3. **Rate limiting is per process**, not distributed. It does not work correctly with several backend workers or servers.
4. **Real opportunities have not been populated or verified.** `datasets/opportunities.csv` is empty on purpose.
5. **Career-intelligence/news feeds are empty.** `datasets/feeds.json` has no feed URLs yet; real, checked RSS/Atom URLs
   must be added.
6. **ESCO and O\*NET are not imported.** The 16 careers, 43 skills, 14 degrees and 23 resources are hand-curated
   starter data. Weights and annotations are the team's own, not published statistics.
7. **Speech-to-text has not been tested** against a real external endpoint. Browser dictation is available.
8. **Journal analysis is keyword based** and misses nuance, sarcasm and many phrasings.
9. **Recommendation weights are not validated** by a large real-world student study.
10. **Visual and accessibility review is incomplete.** A scripted headless-Chromium pass loaded every signed-in screen at
    desktop, tablet and mobile widths with no horizontal overflow or console errors, but nobody has reviewed the screens
    by eye on real devices. No formal accessibility audit (WCAG, screen readers) has been done.
11. **Notifications and real skill-demand statistics are not implemented.**
12. **Docker images were never built in the environment where this was prepared** (no access to Docker Hub). See
    section 6.
13. The test suites were run on Python 3.13 and PostgreSQL 16 with pgvector 0.6.0. The Docker images use Python 3.12 and
    the `pgvector/pgvector:pg16` image.

## 14. Datasets and attribution

Starter data is in `datasets/`; every source is listed in `datasets/sources.json` with licence, attribution and a
`last_verified` date (blank means "not checked yet", and the app shows "not verified"). See `datasets/README.md`.

- The careers/skills vocabulary follows the general categories used by **O\*NET** and **ESCO** but **no records were
  copied** from them.
- Learning resources link to provider sites (freeCodeCamp, NPTEL, SWAYAM, Harvard CS50 and others). Course pages were not
  individually verified. Check each link and licence before relying on it.
- Never add invented internships, salaries, deadlines or news. Rows without a source URL and verification date are
  refused by the opportunity loader.
- To add real data: put real rows in `datasets/opportunities.csv`, real feeds in `datasets/feeds.json`, then run
  `python scripts/seed.py` and `python scripts/fetch_updates.py`.

## 15. Project layout

```
backend/    FastAPI app (app/), Alembic migrations (alembic/), tests (tests/), entrypoint.py, Dockerfile
frontend/   Next.js app (src/), Vitest tests, Dockerfile
database/   init.sql (creates the empty test database on first Docker start)
datasets/   Starter data and sources
scripts/    seed.py, fetch_updates.py, export_api_docs.py
tests/e2e/  End-to-end tests against the running stack
docs/       API.md
docker-compose.yml, .env.example
```

## 16. Troubleshooting

| Problem | Fix |
|---|---|
| `required variable POSTGRES_PASSWORD is missing` | You did not create `.env`. Run `copy .env.example .env` and fill it in |
| Backend says `database never became ready` | Wrong `POSTGRES_PASSWORD`. If you changed it after the first start run `docker compose down -v`, then start again |
| Login works but you are bounced back to login | `CORS_ORIGINS` must exactly match the address in the browser bar (including `http` vs `https`, and port) |
| Port already in use | Set `FRONTEND_PORT`, `BACKEND_PORT` or `DB_PORT` in `.env` |
| Backend tests cannot connect | Set `TEST_DATABASE_URL` with your real password (section 11) |
| Frontend cannot reach the API after changing `BACKEND_URL` | It is read at build time: rebuild (`docker compose up --build`, or restart `npm run dev`) |
| `Docker` build fails while downloading images | Check internet access / Docker Desktop is running, then retry |

# ACIS final verification report

Run date: 2026-11-21. Environment: Linux cloud sandbox, Python 3.13, Node 22.23, npm 10.9 (lockfile also created with npm 11),
PostgreSQL 16.15 with pgvector 0.6.0 (Ubuntu package). Everything below was actually executed. Numbers are copied from the
real command output, not from the earlier hand-over.

## Results

| Check | Result |
|---|---|
| Backend tests (`pytest`, real PostgreSQL + pgvector) | **208 passed**, 0 failed (292 warnings: PyJWT notes that the short test key is under 32 bytes; test-only) |
| Frontend typecheck (`tsc --noEmit`) | **0 errors** |
| Frontend tests (Vitest 4.1.12) | **169 passed**, 15 skipped by design (live-contract tests) |
| Frontend live-contract tests, against the running stack | **15 passed** |
| Production build (`next build`, Next.js 15.5.29) | **Success** (standalone output) |
| End-to-end tests (20, through the website's `/api` proxy, real cookies) | **20 passed**, run AFTER the PyJWT / Next.js / npm upgrades |
| Migrations on a brand-new empty database | 0001 -> 0003 applied, **38 tables** (+ `alembic_version`), pgvector enabled by migration 0001 |
| Seed script | careers 16, skills 43, degrees 14, resources 23, opportunities 0, market_updates 0 |
| `npm audit` | **0 vulnerabilities** (was 5: 1 critical, 1 high, 2 moderate, listed below) |
| Browser smoke test (headless Chromium) | Signup through the real UI works; 14 signed-in screens x 3 sizes (1440, 820, 390 px) = 42 loads: no redirects, no console errors, no horizontal overflow |
| `docker compose config` | Valid; also fails with a clear message when `.env` is missing |
| **Docker image build / `docker compose up`** | **NOT VERIFIED. See below.** |

## Clean-room procedure (Phase D)

Final ZIP extracted into an empty folder; new Python venv, `pip install -r requirements.txt`; `npm ci`; new empty database;
`alembic upgrade head`; `scripts/seed.py`; backend tests; frontend typecheck/tests/build; backend + standalone frontend
server started the same way the containers start them (`entrypoint.py`, `node server.js`); 20 end-to-end and 15 live-contract
tests. All passed.

## Docker status (honest)

A Docker daemon could be started in the sandbox, but its network policy blocked Docker Hub
(`registry-1.docker.io`: Forbidden), so `pgvector/pgvector:pg16`, `python:3.12-slim` and `node:22-slim` could not be pulled.
Therefore **no image was built and `docker compose up` was never run**. Verified instead: compose file syntax; the same
migration/seed/start sequence and the same standalone Next.js server the containers use; migrations on an empty DB create the
vector extension themselves. **You must run `docker compose up --build` on your computer** (README section 6).

Fixed during this review: `frontend/public/` was an empty folder, which ZIP/git can drop, and the frontend Dockerfile copies
it (`COPY --from=build /app/public`). That would break the Docker build. A `.gitkeep` file now keeps it.

## Dependency / security audit (Phase B)

Before: 5 advisories (npm audit): `tinypool <=2.1.1` **critical** (prototype pollution -> RCE, test tooling only),
`postcss <=8.5.22` **high** (XSS in stringify; sourceMappingURL file read; bundled inside Next.js), `@vitest/mocker <=4.1.11`
and `vitest <=4.1.10` **moderate** (test tooling only).

Fix applied (no `npm audit fix --force`, Next.js stays 15.5.29):
- `vitest` 3.2.7 -> **4.1.12** (patched release of the same major used by the fix; npm 10 crashed resolving it, so the
  lockfile was generated with npm 11. `npm ci` with npm 10.9 installs it fine; verified).
- `postcss` ^8.5.33 as direct dependency plus `"overrides": {"postcss": "$postcss"}` so Next.js's bundled copy (8.4.31) is replaced.
- Result: 0 vulnerabilities; typecheck, 169 tests, build and 20 E2E tests pass again.

Caveat: the override makes Next.js use a newer postcss than it was tested with by its maintainers. The build and all tests
pass, but watch for CSS issues after future Next upgrades. Backend: PyJWT 2.15.1 pinned; no Python audit tool was run
(pip-audit needs network access to an advisory database), so Python dependencies are **not** audited here.
Run `pip install pip-audit && pip-audit -r backend/requirements.txt` on your computer.

## Inconsistencies found and corrected

- README was out of date (155 / 153 tests, "Docker for database only", 2 migrations, `NEXT_PUBLIC_API_URL`). Rewritten.
- `docs/API.md` and the OpenAPI description said login uses only a Bearer token; the website uses an httpOnly cookie +
  CSRF header. Fixed and regenerated. Endpoint count is **73** (72 feature endpoints + `/health`).
- `frontend/README.md` referenced `NEXT_PUBLIC_API_URL` and token handling; corrected.
- `datasets/sources.json` referred to a non-existent `scripts/import_esco.py`; corrected.
- Backend tests default to DB password `acis`; with Docker you must pass `TEST_DATABASE_URL` (documented).
- `PHASE5_STATUS.md` (a work-in-progress note) removed; this report replaces it.

## Features completed (verified by the tests above)

Auth (httpOnly cookie, CSRF, rate limit, origin check, security headers, sign-out everywhere, production start-up checks),
onboarding/assessment/rapid mode, the three independent models (separation tests pass), recommendations, comparison, stability,
explainability, memory, journals/reflections/voice (transcript), AI Mentor with fallback, timeline, intelligence, opportunities,
roadmaps, skill gaps, research logging/export, account export/delete, all 18 screens.

## Remaining limitations

See README section 13 (12 items). Summary: Supabase sign-in unfinished; embedding API not implemented; per-process rate limit;
no real opportunities or news feeds; ESCO/O*NET not imported; speech-to-text untested against a real endpoint; keyword
journal analysis; weights not validated by a study; no human visual review or formal accessibility audit; no notifications
or skill-demand statistics; Docker images unbuilt; Python audit not run.

## Not tested

Windows itself (all runs were on Linux; the Windows instructions are written but not executed), real LLM/Ollama,
real speech-to-text, real browsers other than headless Chromium, load/performance.

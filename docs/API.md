# ACIS API reference

Generated from the code by `python scripts/export_api_docs.py` (73 endpoints). Interactive version: run the backend and open `/docs` (Swagger) or `/redoc`.

`*` marks a required field. Login = the httpOnly session cookie set by `/auth/login` (the website also sends the `X-CSRF-Token` header on POST/PUT/PATCH/DELETE), or `Authorization: Bearer <token>` with the token from `/auth/login` for API clients and Swagger. A record that belongs to someone else always returns 404.

## AI mentor

| Method | Path | What it does | Login | Query parameters | Body |
|---|---|---|---|---|---|
| POST | `/mentor/chat` | Send a message to the mentor | yes |  | message*, conversation_id |
| GET | `/mentor/conversations` | My conversations | yes | limit, offset |  |
| DELETE | `/mentor/conversations/{conversation_id}` | Delete Conversation | yes |  |  |
| GET | `/mentor/conversations/{conversation_id}` | All messages in one conversation | yes |  |  |
| GET | `/mentor/status` | Is an LLM connected, or is the built-in rule-based mentor answering? | yes |  |  |

## auth

| Method | Path | What it does | Login | Query parameters | Body |
|---|---|---|---|---|---|
| POST | `/auth/login` | Login | no |  | email*, password* |
| POST | `/auth/logout` | Sign out everywhere (revokes every session of this account) | yes |  |  |
| GET | `/auth/me` | Me | yes |  |  |
| POST | `/auth/register` | Register | no |  | email*, password*, full_name |

## career intelligence

| Method | Path | What it does | Login | Query parameters | Body |
|---|---|---|---|---|---|
| GET | `/intelligence` | Saved market updates relevant to my career directions, with sources and dates | yes | career, limit, offset |  |
| GET | `/intelligence/sources` | Every source the knowledge base uses, with licence and last-verified date | yes |  |  |

## careers

| Method | Path | What it does | Login | Query parameters | Body |
|---|---|---|---|---|---|
| GET | `/careers` | List Careers | yes | q, limit, offset |  |
| GET | `/careers/compare` | Compare | yes | a, b |  |
| POST | `/careers/evidence` | Add Evidence | yes |  | career_slug*, source_type*, direction, strength, note |
| GET | `/careers/history` | History | yes | limit |  |
| GET | `/careers/portfolio` | Portfolio | yes |  |  |
| POST | `/careers/recommendations/refresh` | Refresh | yes |  |  |
| GET | `/careers/recommendations/{rec_id}` | Get Recommendation | yes |  |  |
| POST | `/careers/recommendations/{rec_id}/feedback` | Recommendation Feedback | yes |  | helpful*, relevance, comment |
| GET | `/careers/{slug}/skill-gap` | Career Skill Gap | yes |  |  |

## growth

| Method | Path | What it does | Login | Query parameters | Body |
|---|---|---|---|---|---|
| GET | `/growth/achievements` | Achievements | yes |  |  |
| POST | `/growth/achievements` | New Achievement | yes |  | kind*, title*, description, achieved_on, career_slug |
| GET | `/growth/progress` | Progress | yes |  |  |
| GET | `/growth/projects` | My Projects | yes |  |  |
| POST | `/growth/projects` | New Project | yes |  | title*, description, idea_id, skill_slugs, repo_url |
| GET | `/growth/projects/ideas` | Project Ideas | yes | career, max_difficulty |  |
| POST | `/growth/projects/{project_id}/complete` | Finish Project | yes |  |  |
| GET | `/growth/skills` | My Skills | yes |  |  |
| PUT | `/growth/skills` | Set Skill | yes |  | skill_slug*, level* |
| GET | `/growth/skills/catalogue` | Skill Catalogue | yes |  |  |

## journal & reflections

| Method | Path | What it does | Login | Query parameters | Body |
|---|---|---|---|---|---|
| GET | `/journal` | List my journal entries (private to me) | yes | limit, offset |  |
| POST | `/journal` | Write a journal entry | yes |  | text* |
| GET | `/journal/search` | Semantic search over my journal | yes | q, limit |  |
| DELETE | `/journal/{entry_id}` | Delete an entry and the evidence/memory it created | yes |  |  |
| GET | `/journal/{entry_id}` | Get Entry | yes |  |  |
| GET | `/reflections` | My reflections | yes | limit, offset |  |
| POST | `/reflections` | Submit a structured reflection | yes |  | enjoyed, disliked, surprised, interests_changed, related_careers |
| GET | `/reflections/prompt` | Is a reflection due? Prompts to show | yes |  |  |
| DELETE | `/reflections/{reflection_id}` | Delete Reflection | yes |  |  |
| GET | `/voice` | My voice entries (transcripts only; audio is never stored) | yes | limit, offset |  |
| POST | `/voice` | Voice journal: upload audio (if speech-to-text is configured) or send a transcript | yes |  | multipart: audio, transcript |
| GET | `/voice/status` | Is server-side speech-to-text available? | yes |  |  |

## learning

| Method | Path | What it does | Login | Query parameters | Body |
|---|---|---|---|---|---|
| GET | `/learning/preferences` | Preferences | yes |  |  |
| GET | `/learning/recommended` | Recommended | yes | career, limit |  |
| GET | `/learning/resources` | Resources | yes | skill, kind, limit, offset |  |
| POST | `/learning/resources/{resource_id}/feedback` | Feedback | yes |  | status*, rating, comment |

## learning roadmaps

| Method | Path | What it does | Login | Query parameters | Body |
|---|---|---|---|---|---|
| GET | `/roadmaps` | My roadmaps with progress | yes | active_only |  |
| POST | `/roadmaps/generate` | Build a roadmap from my skill gaps for one career | yes |  | career_slug*, title |
| DELETE | `/roadmaps/{roadmap_id}` | Delete Roadmap | yes |  |  |
| GET | `/roadmaps/{roadmap_id}` | Get Roadmap | yes |  |  |
| PATCH | `/roadmaps/{roadmap_id}/items/{item_id}` | Tick or untick a roadmap item | yes |  | done* |

## memory

| Method | Path | What it does | Login | Query parameters | Body |
|---|---|---|---|---|---|
| GET | `/memory` | List my memories (optionally one category) | yes | category, limit, offset |  |
| POST | `/memory` | Add a memory | yes |  | category*, content*, source, confidence, importance, tags, ttl_days |
| GET | `/memory/search` | Semantic search over my memories | yes | q, limit |  |
| GET | `/memory/summary` | How many memories I have in each category | yes |  |  |
| DELETE | `/memory/{memory_id}` | Delete | yes |  |  |
| GET | `/memory/{memory_id}` | Get One | yes |  |  |
| PATCH | `/memory/{memory_id}` | Edit a memory (the category cannot be changed) | yes |  | content, confidence, importance, tags |

## opportunities

| Method | Path | What it does | Login | Query parameters | Body |
|---|---|---|---|---|---|
| GET | `/opportunities` | Verified opportunities, most relevant to me first | yes | kind, career, include_closed, include_unverified, limit, offset |  |
| GET | `/opportunities/{opportunity_id}` | Get Opportunity | yes |  |  |

## research logging & export

| Method | Path | What it does | Login | Query parameters | Body |
|---|---|---|---|---|---|
| GET | `/research/consent` | Have I agreed to my anonymised data being used in research? | yes |  |  |
| PUT | `/research/consent` | Opt in or out of anonymised research use (default: out) | yes |  | consent* |
| GET | `/research/export` | Anonymised dataset for the academic evaluation (researchers only) | yes | dataset, format, limit, offset |  |
| GET | `/research/my-data` | Download everything ACIS stores about me (JSON) | yes |  |  |
| GET | `/research/my-log` | My own recommendation log: what was recommended, why, and my feedback | yes | limit, offset |  |

## student

| Method | Path | What it does | Login | Query parameters | Body |
|---|---|---|---|---|---|
| POST | `/assessment` | Submit Assessment | yes |  | interests*, aptitude_answers, creative, personality |
| GET | `/assessment/questions` | Questions | yes |  |  |
| POST | `/assessment/rapid` | Rapid Assessment | yes |  | interests*, aptitude_answers, creative, personality |
| POST | `/onboarding` | Onboarding | yes |  | date_of_birth*, guardian_consent, education_level*, institution, city, long_term_goal, lifestyle, financial_context, academics, stage |
| DELETE | `/profile` | Delete My Data | yes |  |  |
| GET | `/profile` | Get My Profile | yes |  |  |

## system

| Method | Path | What it does | Login | Query parameters | Body |
|---|---|---|---|---|---|
| GET | `/health` | Health | no |  |  |

## timeline

| Method | Path | What it does | Login | Query parameters | Body |
|---|---|---|---|---|---|
| GET | `/timeline` | My career evolution over time (newest first) | yes | types, from, to, group, limit, offset |  |

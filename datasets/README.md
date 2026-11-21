# Datasets

| File | What it holds |
|---|---|
| `sources.json` | Every source with licence, attribution and last-verified date |
| `careers.json` | 16 careers with interest/aptitude profiles, required skills and degrees |
| `skills.csv`, `degrees.csv` | Skill vocabulary and degree routes |
| `resources.csv` | 23 free learning resources (links go to each provider's main pages) |
| `project_ideas.csv` | 16 practical projects with difficulty levels |
| `opportunities.csv`, `market_updates.csv` | **Empty on purpose** (see below) |

## Please read

- This is **starter data written by the team**. It follows the general categories used by
  O*NET and ESCO but contains no records copied from them. The interest/aptitude weights,
  `theory_level` and `session_minutes` values are our own annotations.
- `last_verified` is blank everywhere because nothing has been checked against the live sites
  yet. The app shows "not verified" for those items. Fill the date in after you check each link.
- Opportunities and market updates are left empty because we will not invent internships,
  scholarships, deadlines or news. Add real rows to the two CSV files (with a source URL and
  the date you checked) and run `python scripts/seed.py`.
- A real ESCO/O*NET import is planned but **not written yet**. Until then the careers and skills
  above are the only knowledge base.

## Market updates (career intelligence)

`feeds.json` is an **empty list on purpose**. To get real updates, add RSS/Atom feeds you have checked yourself:

```json
[
  {"name": "Example Publisher", "url": "https://example.org/feed.xml",
   "careers": ["data_scientist", "ai_ml_engineer"],
   "licence": "see publisher's terms", "attribution": "Example Publisher"}
]
```

Then run `python scripts/fetch_updates.py`. Each item is saved with its title, link, a 400-character excerpt, the
source and today's date as the retrieval date. Run it again to refresh; duplicates are skipped. Full articles are never copied.

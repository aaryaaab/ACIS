# ACIS frontend

Next.js (App Router), React, TypeScript, Tailwind CSS 3, Recharts. Tests: Vitest and Testing Library.

```
npm install
copy .env.example .env.local     (set BACKEND_URL if the backend is not on localhost:8000)
npm run dev                      http://localhost:3000
npm test                         unit and screen tests
npm run build                    production build
```

## Where things are

| Folder | What it holds |
|---|---|
| `src/app/page.tsx` | Landing page |
| `src/app/(auth)` | Log in, sign up |
| `src/app/(flow)` | Onboarding and assessment (focused pages, no sidebar) |
| `src/app/(app)` | The other 14 screens, inside the sidebar layout |
| `src/lib/api.ts` | The only code that calls the backend. Sends the session cookie and CSRF header, handles errors and 401s |
| `src/lib/endpoints.ts` | One typed function per backend endpoint |
| `src/lib/types.ts` | Response types, matching `docs/API.md` |
| `src/components` | UI kit (`ui.tsx`), ACIS-specific parts (`domain.tsx`), shared panels |
| `src/test` | Test helpers, plus `live.contract.test.ts` (runs against a real backend) |

## Design rules that the tests protect

- Confidence is a word (High, Moderate, Emerging) with three dots, never a number or percentage.
- Explore-stage students are shown "worth exploring" directions, never a primary career.
- Career, Learning and Growth each have their own colour and their own place on screen.
- Empty states for opportunities and market updates say that nothing verified is saved. Nothing is made up.
- Only `http(s)` links are made clickable, and all external links use `rel="noopener noreferrer"`.

## Known limits

- Login now uses an httpOnly session cookie plus a CSRF header (no token in the browser's storage). The frontend calls `/api`, which Next.js forwards to the backend.
- Recharts 2 is no longer actively maintained upstream. It works, but plan to move to v3.
- The screens have not yet been checked in real browsers on phone and tablet sizes.

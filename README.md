# MU-Capstone-Application

Application for the capstone project "Mobile Application for Exercise Posture Checking and Accurate Guidance using Artificial Intelligence" at Mahidol University, built as a web app: live form correction and rep counting for Squat, Push-up, Lunge, and Bicep curl, with motion similarity scoring and AI coaching feedback after each set.

## Status

Phases 1 and 2 of the build plan are complete: project skeleton, database foundation,
sign-in, PDPA consent, profile, the app shell, the exercise catalogue as data, and the
workout setup and guide screens. There is no camera or live session yet.

- `REQUIREMENTS.md`: what the system must do.
- `BUILD_PLAN.md`: the seven build phases, one session each.
- `CONTEXT.md`: the vocabulary.
- `docs/adr/`: the decisions made in Phase 0, amended as phases settle open items.
- `CLAUDE.md`: working rules and invariants for coding sessions.
- `docs/sessions/`: one log per session.

## What exists

- Next.js 16 App Router with TypeScript and Tailwind, talking to Supabase through
  `@supabase/ssr`. The session is refreshed in `proxy.ts`; signed-out users go to `/login`.
- `supabase/migrations/`: pgvector, `profiles`, `consents`, `exercises`, `expert_motions`,
  row-level security, and least-privilege grants. `supabase/tests/` proves per-user
  isolation and that the catalogue is read-only through the API.
- `exercises` holds the four exercises as rows: guide text, media URLs (null until the
  media exists), the research repo's engine key, and `rule_based_logic` with the state
  machine thresholds and one entry per rule (check name, threshold, priority, scope,
  debounce, message per locale, highlight joints). A check constraint enforces the shape.
  Adding an exercise built from existing checks is an insert; see ADR-0006. The seeded
  numbers were typed by hand from the research repo and are marked as such in the
  migration.
- `expert_motions` is empty, 1:1 with exercises, and unreachable through the API; it is
  filled by the similarity component over a direct database connection.
- Register, sign in, sign out. Email confirmation is off; there is no password reset
  (ADR-0001). A tester who forgets a password asks the team.
- PDPA consent in three parts, each recorded with version and time (`lib/consent.ts`).
- Profile setup before the first workout and editing in Settings.
- App shell: Home, History, Settings tabs. History is an empty placeholder until Phase 5.
- Home lists the catalogue as cards. `/workout/[exercise]/setup` asks reps per set,
  number of sets, and rest seconds (default 60); `/workout/[exercise]/guide` shows the
  guide text, the demonstration video or a placeholder, and the rules the coach checks.
  The Open camera button is disabled until Phase 3. Thumbnails and guide videos do not
  exist yet.

## Running it

Needs Node 22 and Docker Desktop. The Supabase CLI is a devDependency, so `npx supabase`
works without a global install.

```bash
npm install
npx supabase start
```

Copy `.env.example` to `.env.local` and paste the publishable key printed by
`npx supabase status -o env`. Then:

```bash
npm run dev
```

The app is on http://localhost:3000 and Supabase Studio on http://localhost:54323.

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` | production build |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | type check |
| `npm run db:reset` | replay all migrations from scratch on the local stack |
| `npm run test:db` | run the pgTAP tests in `supabase/tests/` |
| `npm run db:types` | regenerate `lib/supabase/database.types.ts` after a migration |
| `npx supabase migration new <name>` | create a new migration file |
| `npx supabase stop` | stop the stack, data kept in the Docker volume |

For the evaluation the same stack runs on a team machine and is reached through
Tailscale Funnel: the app on port 443 and the Supabase API on 8443 (ADR-0001).

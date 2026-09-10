# MU-Capstone-Application

Application for the capstone project "Mobile Application for Exercise Posture Checking and Accurate Guidance using Artificial Intelligence" at Mahidol University, built as a web app: live form correction and rep counting for Squat, Push-up, Lunge, and Bicep curl, with motion similarity scoring and AI coaching feedback after each set.

## Status

Phase 1 of the build plan is complete: project skeleton, database foundation, sign-in,
PDPA consent, profile, and the app shell. There is no exercise functionality yet.

- `REQUIREMENTS.md`: what the system must do.
- `BUILD_PLAN.md`: the seven build phases, one session each.
- `CONTEXT.md`: the vocabulary.
- `docs/adr/`: the decisions made in Phase 0, amended as phases settle open items.
- `CLAUDE.md`: working rules and invariants for coding sessions.
- `docs/sessions/`: one log per session.

## What exists

- Next.js 16 App Router with TypeScript and Tailwind, talking to Supabase through
  `@supabase/ssr`. The session is refreshed in `proxy.ts`; signed-out users go to `/login`.
- `supabase/migrations/`: pgvector, `profiles`, `consents`, row-level security, and
  least-privilege grants. `supabase/tests/rls.test.sql` proves per-user isolation.
- Register, sign in, sign out. Email confirmation is off; there is no password reset
  (ADR-0001). A tester who forgets a password asks the team.
- PDPA consent in three parts, each recorded with version and time (`lib/consent.ts`).
- Profile setup before the first workout and editing in Settings.
- App shell: Home, History, Settings tabs. History is an empty placeholder until Phase 5.

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

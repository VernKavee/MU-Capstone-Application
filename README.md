# MU-Capstone-Application

Application for the capstone project "Mobile Application for Exercise Posture Checking and Accurate Guidance using Artificial Intelligence" at Mahidol University, built as a web app: live form correction and rep counting for Squat, Push-up, Lunge, and Bicep curl, with motion similarity scoring and AI coaching feedback after each set.

## Status

Phases 1 to 4 of the build plan are complete: project skeleton, database foundation,
sign-in, PDPA consent, profile, the app shell, the exercise catalogue as data, the workout
setup and guide screens, the live session screen with the camera, the pose model, and a
stub engine, and the completion flow that saves every set with its video and keypoint
file, then writes similarity and feedback from stubs. History is Phase 5.

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
  `workouts`, `sets`, the private `sets` storage bucket, row-level security, and
  least-privilege grants down to the column. `supabase/tests/` proves per-user isolation,
  that the catalogue is read-only through the API, and that each user's files sit in
  their own folder.
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
  Thumbnails and guide videos do not exist yet.
- `/workout/[exercise]/live` is the live session: camera permission with recoverable
  denied and no-camera states, MediaPipe's pose landmarker running in the browser (full
  model, lite as a manual fallback), the skeleton drawn over the mirrored video, the
  placement cues and the ready pose, the three second countdown, the correct rep counter
  with attempts and the engine state beside it, one warning at a time with the joints it
  names lit up, a beep per correct rep and the warning spoken with a mute, an End set
  button, and an attempt cap of twice the target. From the end of the countdown the set
  is recorded and every frame's 33 landmarks are captured. One visit runs the whole
  workout: every set, the repair sets, and the rest between them.
- The engine seam of ADR-0002 is `lib/engine/types.ts`; `lib/engine/stub.ts` is the stub
  that Vern's port replaces. It reads the row's `rule_based_logic`, judges placement and
  the ready pose from the real landmarks, then scripts attempts with random outcomes.
  `lib/live/session.ts` is the frame loop, outside React.
- When a set ends it is saved at once: a `workouts` row with the first set, then a `sets`
  row with the totals, one record per attempt (ADR-0003), and the engine's report
  verbatim. The video and the gzipped keypoint file (ADR-0005) go from the browser
  straight to the private `sets` bucket through signed upload URLs. Then similarity and
  feedback are written to the set by the stubs in `lib/analysis/`, behind the contracts of
  ADR-0007; the feedback stub quotes the medical history back. The server side is
  `lib/save-and-analyse.ts`.
- The set-complete screen shows the counts and the violations, then similarity and
  feedback as they arrive, with a retry. It then offers one repair set after any
  violation (a skip is recorded), runs the rest timer, or finishes the workout.
- `/workout/[exercise]/done/[workout]` is the finished summary, read back from the
  database: each set with its counts, similarity, and feedback.

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

The app is on http://localhost:3000 and Supabase Studio on http://localhost:54323. The
camera works on localhost without https; any other origin needs https. The pose model and
its wasm are fetched from Google's storage and jsdelivr on first use, about 10 MB.

| Command | What it does |
|---|---|
| `npm run dev` | Next.js dev server |
| `npm run build` | production build |
| `npm run lint` | ESLint |
| `npx tsc --noEmit` | type check |
| `npm run db:reset` | replay all migrations from scratch on the local stack |
| `npm run test:db` | run the pgTAP tests in `supabase/tests/` |
| `npm run test:unit` | run the unit tests under `lib/` with Node's test runner |
| `npm run db:types` | regenerate `lib/supabase/database.types.ts` after a migration |
| `npx supabase migration new <name>` | create a new migration file |
| `npx supabase stop` | stop the stack, data kept in the Docker volume |

For the evaluation the same stack runs on a team machine and is reached through
Tailscale Funnel: the app on port 443 and the Supabase API on 8443 (ADR-0001).

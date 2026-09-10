# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

Phase 0 and Phase 1 are done. The repo holds the planning documents, the vocabulary, the
decision records, and the Phase 1 code: scaffolding, the foundation migration, auth,
consent, profile, and the app shell. Nothing about exercise exists yet.

- `REQUIREMENTS.md` is the contract. It says WHAT the system must do, not HOW. Read it at the start of every session.
- `BUILD_PLAN.md` is the phase sequence: seven phases, one session each. Do not run more than one phase per session.
- `CONTEXT.md` is the vocabulary. Use its terms in code, UI, and docs, and challenge any term that conflicts with it.
- `docs/adr/` holds the seven decision records from Phase 0. Read the ones a phase depends on before starting it, and update them rather than deciding silently.
- `docs/sessions/` holds one log per session.

The project is a web app for checking exercise posture with AI, covering exactly four
bodyweight exercises: Squat, Push-up, Lunge, Bicep curl. The requirements were written
for React Native plus FastAPI; the team switched to web. Behaviour, screens, data, and
rules still hold. The stack is decided in ADR-0001: Next.js App Router against the
Supabase API, run from Supabase's Docker stack on a team machine for the evaluation.

## Build, lint, and test commands

Needs Node 22 and Docker Desktop. The Supabase CLI is pinned as a devDependency.

- `npm run dev`, `npm run build`, `npm run lint`, `npx tsc --noEmit`
- `npx supabase start` / `npx supabase stop`: the local stack (Postgres 17, Auth, Storage,
  Studio on 54323, API on 54321). `.env.local` comes from `.env.example` plus the
  publishable key from `npx supabase status -o env`.
- `npx supabase migration new <name>`, then `npm run db:reset` to replay every migration,
  then `npm run db:types` to regenerate `lib/supabase/database.types.ts`.
- `npm run test:db`: pgTAP tests in `supabase/tests/`. Every table with row-level
  security gets its isolation proven there.
- `npx supabase db advisors` after any schema change.
- No unit or end-to-end tests yet; Phase 6 adds them.

Conventions the code follows, because the docs changed since the plan was written:

- Next.js 16: the request hook is `proxy.ts`, not `middleware.ts`. Route types come from
  `next typegen` (`PageProps<"/path">`, `LayoutProps<"/">`). Search params are a Promise.
- Sessions are checked with `supabase.auth.getClaims()`, never `getSession()`.
- Server actions in `actions.ts` files next to the pages; errors travel back as an
  `?error=` query string, no client state.
- `lib/supabase/server.ts` for server components and actions, `lib/supabase/client.ts`
  for the browser. Both are typed with the generated `Database`.
- Supabase's default grants give `anon` and `authenticated` everything on a new public
  table. Every migration revokes those and grants only what the app uses, so a missing
  policy fails with a privilege error rather than silently touching zero rows.

## The three-part AI structure

Three AI components are owned by specific people and **none of them is implemented in
this repo**. Each stays behind an explicit interface with a stub that returns believable
fake data, so one person can replace one file.

| Component | Owner | Lives where |
|---|---|---|
| Rule-based form checking plus FSM rep counting | Kavee (Vern) | already built in the research repo, see below |
| Motion similarity, six numbers per rep | Punnapat | their own component |
| LLM coaching plus RAG retrieval | Sujira | their own component |

Do not write similarity math, an LLM call, RAG, or vector search here. The rule engine
port is Vern's separate work behind the seam in ADR-0002, not a phase of this build. The
similarity and feedback contracts are in ADR-0007.

## Invariants that are easy to violate

- **Client-side processing (NFR1).** Landmark extraction, angle math, and rule checking
  run on the user's device. No per-frame server round trip.
- **Per-user access control (NFR2).** Enforced at the database layer from the first
  migration, not added later. A user can only ever reach their own data.
- **Signed uploads (NFR3).** Both files of a set, the video and the keypoint file, go
  client to storage directly via a short-lived signed URL, never proxied through the
  application server.
- **PDPA consent (NFR4).** Three separate consents, recorded with version and time:
  camera access with on-device processing, storing video and landmarks, storing the
  profile including medical history. Built in Phase 1, not bolted on.
- **Strict counting.** The counter is correct reps. Attempts are shown beside it. An
  incorrect or abandoned attempt never increments it.
- **Show one, record all.** Display the single highest priority violation to the user
  while recording every violation in the attempt record.
- **The engine seam is the research repo's contract (ADR-0002).** `process(keypoints,
  timestampMs)` returns the FrameResult fields and `getSessionReport()` returns the
  schema version 4 report. The UI never re-derives counters, states, or warnings. The
  stub and the future port both satisfy it.
- **Adding an exercise built from existing checks is a data change (ADR-0006).**
  Exercise rows carry thresholds, messages per locale, priorities, scope, debounce,
  state names, highlight joints, an engine key, and the name of each check. A new check
  is one registered function. If you write `if (exercise === 'squat')`, the design is
  wrong.
- **Save first, then analyse (ADR-0007).** A set is persisted the moment it ends.
  Similarity and feedback are written to it afterwards and may be empty.
- **The engine's report is stored verbatim (ADR-0003)** next to the merged attempt
  records. Never reconstruct it.
- **Medical history is a real field**, not profile trivia. Required before the first
  workout, "none" allowed, editable in Settings. It feeds the LLM so advice is safe.
  Stubs should visibly receive it.

## Decided in Phase 0

Every decision has a record in `docs/adr/`. Do not re-open one silently; if a phase finds
a decision wrong, say so and update the ADR.

- ADR-0001: web app, Next.js against the Supabase API, self-hosted Docker stack on a team
  machine for the evaluation, no SMTP, evaluation through direct database and file access.
- ADR-0002: rule engine client-side in TypeScript, ported by Vern later, behind the
  research repo's contract; MediaPipe full model everywhere.
- ADR-0003: one merged record per attempt plus the engine's report verbatim.
- ADR-0004: workouts own sets; the repair set is a set of kind repair, offered once per
  set, can be declined; rest timer; feedback after every set.
- ADR-0005: full raw video plus a keypoint file per set, skeleton drawn at playback;
  consent in three parts; data kept until the project ends.
- ADR-0006: exercise configuration is data with a check registry.
- ADR-0007: similarity and feedback behind JSON contracts and stubs, subject to change;
  the knowledge base and expert motions live in this Postgres.

Smaller decisions without an ADR, so no phase re-decides them:

- The setup screen asks reps per set, number of sets, and rest seconds (default 60).
- The attempt cap defaults to twice the target; an end-set button exists.
- Live screen: a beep per correct rep and the warning spoken through the browser speech
  API, with a mute toggle.
- The profile must be complete before the first workout; medical history may be "none".
- Weekly chart: mean similarity per day over that day's sets; week starts Monday in the
  browser's time zone. History level 3 lists workouts, not sets.
- English UI; every user-facing message in exercise data is keyed by locale.
- Laptops and phones are both first-class.
- Skills: adopt `supabase/agent-skills@supabase` and
  `supabase/agent-skills@supabase-postgres-best-practices` at the start of Phase 1 and a
  Playwright skill at Phase 6. Nothing else in the ecosystem was worth adopting.

Decided in Phase 1, recorded in ADR-0001 and the Phase 1 session log:

- Tunnel: Tailscale Funnel. App on 443, Supabase API on 8443, no domain needed.
- Local and evaluation stack are both `npx supabase start`; the separate self-hosted
  compose file is not used.
- The profile row is created when the user submits the profile form, not by a trigger at
  signup, so every profile column is NOT NULL and "row exists" means "profile complete".
- Consent is one screen, three checkboxes, all required; declining signs out. Each is a
  row in `consents` with kind, version, and time. `CONSENT_VERSION` in `lib/consent.ts`
  is bumped when any text changes, which forces re-consent.
- Gate order after sign-in: consent, then profile, then Home. Enforced in
  `app/(app)/layout.tsx`; every gated page lives under `app/(app)/`.

Still open, to be settled in the phase named:

- Keypoint file format, Phase 4.
- The bound on past workouts in the feedback input, Phase 4.
- Embedding model and column dimension, at integration with Sujira's component.
- Whether the evaluation is supervised sessions or unsupervised use; decides self-hosted
  versus the Pro plan.
- Guide videos and thumbnails for the four exercises do not exist yet.

Vocabulary is in `CONTEXT.md`. In particular: attempt, completed rep, correct rep,
abandoned attempt, workout, set, repair set, and the engine state names Idle, Concentric,
Inflection, Eccentric.

## Research repo, reference only

`~/Documents/SeniorProject` is the Python research project, not a dependency of this repo.
Relevant for cross-checking behaviour:

- `src/rule_based/` and `src/fsm_counter/` - the existing rule and state machine logic
- `src/pipeline/session_report.py` - emits the versioned report at `SCHEMA_VERSION = 4`
- `src/pipeline/frame_processor.py` - the FrameResult contract the engine seam mirrors
- `scratch_output/live_webcam/` - live recordings with angles and joint scores per frame
  but no landmarks; the parity harness needs a landmark dump added there

## Working rules

- Work in steps within a phase, and pause between them to report what was done.
- Ask immediately when uncertain. Do not assume silently. If a requirement is wrong or
  impossible, say so and propose the alternative rather than quietly working around it.
- No em dashes in any output, including files written here.
- Small team of three working directly on `main`. Never create branches. Never suggest
  opening a PR.
- Write a session log to `docs/sessions/YYYY-MM-DD.md` at the end of each phase.
- Keep `README.md` current with what actually exists.

# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A web app that checks exercise posture with AI for exactly four bodyweight exercises: Squat,
Push-up, Lunge, Bicep curl. Next.js App Router against the Supabase API (ADR-0001). The
requirements were written for React Native plus FastAPI; the team switched to web, and
behaviour, screens, data, and rules still hold. All seven build phases, 0 to 6, are done. Work
now is outside the plan: the feedback prompt and display, the expert's similarity reference,
the deploy, and running the evaluation.

## Docs

- `REQUIREMENTS.md` is the contract: WHAT the system must do, not HOW.
- `CONTEXT.md` is the vocabulary. Use its terms in code, UI, and docs (attempt, completed rep,
  correct rep, abandoned attempt, workout, set, repair set, and the engine states Idle,
  Concentric, Inflection, Eccentric), and challenge any term that conflicts with it.
- `docs/adr/` holds the seven decision records. A decision found wrong is said out loud and
  its ADR updated.
- `docs/DECISIONS.md` holds every dated decision and the "Still open" list. Read the matching
  section before changing the engine, rule rows, live screen, completion flow, History,
  feedback display, or design, and read "Still open" before a live test, phone run, or deploy.
- `docs/HANDOVER.md`: what each owner replaces, the interfaces, and the evaluation tasks.
- `docs/DEPLOY.md`: the Google Cloud VM plan, not rehearsed. `docs/FEEDBACK_SETUP.md`: running
  Sujira's feedback service. `docs/sessions/`: one log per session.

## Build, lint, and test commands

Needs Node 22 and Docker Desktop. The Supabase CLI is pinned as a devDependency.

- `npm run dev`, `npm run build` (fetches Barlow from Google, so needs the network),
  `npm run lint`, `npx tsc --noEmit`
- `npx supabase start` / `npx supabase stop`: the local stack (Postgres 17, Auth, Storage,
  Studio on 54323, API on 54321). `.env.local` comes from `.env.example` plus the
  publishable key from `npx supabase status -o env`.
- `npx supabase migration new <name>`, then `npm run db:reset` to replay every migration,
  then `npm run db:types` to regenerate `lib/supabase/database.types.ts`. `db:reset` empties
  the two knowledge base tables; reload them with RAG_SYSTEM's `tools/copy_kb.py`.
- `npm run test:db`: pgTAP tests in `supabase/tests/`. Every table with row-level
  security gets its isolation proven there.
- `npm run test:unit`: every `lib/**/*.test.ts`, Node's own runner with type stripping.
  Files those tests reach import each other with `.ts` extensions for this reason.
- `npx next typegen` before `npx tsc --noEmit` after adding a route.
- `npx supabase db advisors` after any schema change.
- `npm run test:e2e`: Playwright on the installed Chrome, one worker, with the stack up; it
  reuses a running dev server or starts one. `e2e/workout.spec.ts` skips itself without
  `e2e/fixtures/t-pose.y4m`, which is not in git (`e2e/fixtures/README.md`).
  `e2e/isolation.spec.ts` has user B fail to reach user A's data.
  `e2e/retry-feedback.spec.ts` passes whether `FEEDBACK_URL` answers or not.

## Conventions

The docs changed since the plan was written, so the code follows these:

- Next.js 16: the request hook is `proxy.ts`, not `middleware.ts`. Route types come from
  `next typegen` (`PageProps<"/path">`, `LayoutProps<"/">`). Search params are a Promise.
- Sessions are checked with `supabase.auth.getClaims()`, never `getSession()`.
- Server actions in `actions.ts` files next to the pages; errors travel back as an
  `?error=` query string, no client state. The completion flow's actions are called from
  the live screen, not from forms, and return errors as values.
- A "use server" file may export only async functions; constants live in `lib/`.
- `lib/supabase/server.ts` for server components and actions, `lib/supabase/client.ts`
  for the browser, both typed with the generated `Database`. `lib/supabase/admin.ts` is the
  service-role client that writes similarity, feedback, and attempts.
- Supabase's default grants give `anon` and `authenticated` everything on a new public
  table. Every migration revokes those and grants only what the app uses, so a missing
  policy fails with a privilege error rather than silently touching zero rows.
- The live session: `lib/engine/types.ts` is the seam, `lib/engine/engine.ts` the engine,
  `lib/live/pose.ts` the MediaPipe adapter, `lib/live/sound.ts` the beep and speech,
  `lib/live/session.ts` the frame loop outside React, and
  `app/(app)/workout/[exercise]/live/live-screen.tsx` the client component that only
  renders snapshots. The loop, not React, owns the camera, the engine, the overlay, the
  recorder, and the keypoint capture; the landmarker is the screen's, loaded once per visit
  and lent to each set's loop. The overlay canvas draws the camera frame under the
  skeleton, because iOS Safari drops `object-fit` on the video once MediaRecorder starts;
  the `<video>` stays under it as the source.
- The completion flow: `lib/save-and-analyse.ts` is the server logic with the Supabase
  client passed in, `live/actions.ts` wraps it as server actions, `lib/set-job.ts` runs
  save, uploads, and analyse for one set with that API passed in (`live/pipeline.ts`
  passes the real one), and `live/set-complete.tsx` renders it. `lib/set.ts` builds the
  attempt records and the keypoint file, and its `afterSet` decides repair, rest, or
  finish. The similarity and feedback clients are `lib/analysis/similarity.ts` and
  `lib/analysis/feedback.ts` behind `lib/analysis/contracts.ts`; each posts to its service
  when `SIMILARITY_URL` or `FEEDBACK_URL` is set and falls back to its stub otherwise.
- Feedback text: `lib/feedback-text.ts` parses prompt v16's labelled lines (`readFeedback`)
  and `app/(app)/set-feedback.tsx` shows them. RAG_SYSTEM's `test_app_input.py` checks the
  same labels, so change both together.
- History: `lib/history.ts` is the plain-data part (local days, the seven days, means,
  frame lookup), Node-tested. The browser's time zone arrives in the `tz` cookie from
  `app/(app)/time-zone.tsx` and `lib/time-zone.ts` reads it; every date rendered on the
  server passes that zone. `lib/live/skeleton.ts` draws the skeleton for live and replay.
  The replay, `history/[exercise]/[workout]/replay.tsx`, fetches the video and the
  keypoint file from storage in the browser when Play is pressed.
- JSX built in a server component and passed as a prop to a client component that renders
  it beside its own children gets a `key`.
- Server queries end in `.throwOnError()`, so a failure reaches `app/error.tsx` and its
  retry instead of rendering as no data. An id from the address goes through `isUuid`
  (`lib/history.ts`) first, so a malformed one is not found rather than a database error.
- A page renders beside the (app) layout's gate, not after it, so no page may assume the
  gate ran: Home and Settings read the profile with `maybeSingle()`. Gate order: consent,
  then profile, then Home (`app/(app)/layout.tsx`).
- Next shows only the loading file of the folder whose child segment a navigation
  changes, so every folder whose pages link to each other has a `loading.tsx` that
  re-exports `app/(app)/loading.tsx`.
- Design (Daylight): light pages and a dark stage, from Radix Colors scales, with no
  `dark:` variants. Page tokens in `app/globals.css`: `background`, `surface`, `surface-2`,
  `line`, `foreground`, `muted`, `accent` (indigo, the main action and progress), `ok`
  (correct reps). Over video: `ink`, `tape`, `tape-ink`, `live` (the count). Tape amber
  marks only a warning, on the page too. Shared classes: `.btn`, `.btn-quiet`, `.field`,
  `.card`, `.alert` (the tape band), and `.outlined` for text over video; over video, `pill`
  and `round` from `set-complete.tsx`. Every `h1` and `font-display` number is Barlow
  Condensed 700, text is Barlow (both via `next/font`). The focus ring is the accent,
  off-white inside `.stage` (the live screen and the replay player) and the accent again
  inside its `.on-page` (the set-complete page). Muted text uses `text-muted`, never
  opacity. Icons are inline SVG in `app/(app)/icons.tsx`; every page under a tab opens with
  `BackLink` (`app/(app)/back-link.tsx`). On the live screen the user's body stays as large
  as possible, with nothing solid in front of it.
- Layout: the (app) column is `max-w-5xl` on every page and each page sets its own
  measure inside it, left aligned. The tab bar is one `nav` named Primary, at the bottom
  on a phone and at the top from `md` up.

## The three-part AI structure

Three AI components are owned by specific people. Each stays behind an explicit interface,
so one person can replace one file. Contracts are in ADR-0007; both stubs remain for when
their URL is unset.

| Component | Owner | Lives where |
|---|---|---|
| Rule-based form checking plus FSM rep counting | Kavee (Vern) | ported from the research repo into `lib/engine/` (angles, fsm, rules, evaluator, gates, engine) |
| Motion similarity, a 0 to 100 score per rep and per body part | Punnapat | `services/similarity/`, called over HTTP by `lib/analysis/similarity.ts` |
| LLM coaching plus RAG retrieval | Sujira | the RAG_SYSTEM repo, cloned as `../RAG_SYSTEM` and run as `python -m service`, called over HTTP by `lib/analysis/feedback.ts`; its knowledge base is in this Postgres |

Similarity math, LLM calls, RAG, and vector search belong to their owners' services, not here.

## Invariants that are easy to violate

- **Client-side processing (NFR1).** Landmark extraction, angle math, and rule checking
  run on the user's device. No per-frame server round trip.
- **Per-user access control (NFR2).** Enforced at the database layer from the first
  migration, not added later. A user can only ever reach their own data.
- **Signed uploads (NFR3).** Both files of a set, the video and the keypoint file, go
  client to storage directly via a short-lived signed URL, never proxied through the
  application server.
- **Consent (NFR4).** Two separate consents, recorded with version and time: camera
  access with on-device processing, and storing video and landmarks. Bump
  `CONSENT_VERSION` in `lib/consent.ts` when any consent text changes, which forces
  re-consent. The PDPA work and the profile consent were dropped on 2026-11-11.
- **Strict counting.** The counter is correct reps. Attempts are shown beside it. An
  incorrect or abandoned attempt never increments it.
- **Show one, record all.** Display the single highest priority violation to the user
  while recording every violation in the attempt record.
- **The engine seam is the research repo's contract (ADR-0002).** `process(keypoints,
  timestampMs, frameSize?)` returns the FrameResult fields and `getSessionReport()` returns the
  schema version 4 report. The UI never re-derives counters, states, or warnings. The
  port satisfies it, and `lib/engine/parity.test.ts` holds it equal to the Python.
- **Engine and rule changes go Python first.** Change SeniorProject, then re-run its
  `scratch/export_web_logic.py` into a new `rule_logic_<commit>` migration, then port.
  The rule rows are only ever that export, never hand-edited; `ENGINE_VERSION` equals the
  rows' `source`. Parity stays green.
- **Adding an exercise built from existing checks is a data change (ADR-0006).**
  Exercise rows carry thresholds, messages per locale, priorities, scope, debounce,
  state names, highlight joints, an engine key, and the name of each check. A new check
  is one registered function. Code reads row data (`ready_pose`, `chooses_side`,
  `landscape`, `camera_hint`), so `if (exercise === 'squat')` means the design is wrong. A
  new exercise also needs its app columns `landscape` and `camera_hint`. The catalogue is
  changed through the database (psql or Studio); the API is read-only for it.
- **Save first, then analyse (ADR-0007).** A set is persisted the moment it ends.
  Similarity and feedback are written to it afterwards and may be empty.
- **The engine's report is stored verbatim (ADR-0003)** next to the merged attempt
  records. Never reconstruct it.
- **No medical history (2026-11-11).** PDPA approval for health data could not be had in
  time, so the app does not collect one: no profile field, no column, nothing in
  `FeedbackInput`. Do not add one back without that approval (docs/DECISIONS.md).

## Live tests

- Agree the pass bar before a live test, and judge the result against it rather than
  re-tuning after each run.
- Phone tests use two Cloudflare quick tunnels (`cloudflared tunnel --url`): the API on
  54321 first, then `npm run build` and `npm start` with `NEXT_PUBLIC_SUPABASE_URL` set to
  its address, then the app on 3000. Close all of them afterwards.

## Research repo, reference only

`~/Documents/SeniorProject` is the Python research project, not a dependency of this repo.
Relevant for cross-checking behaviour:

- `src/rule_based/` and `src/fsm_counter/` - the existing rule and state machine logic
- `src/pipeline/session_report.py` - emits the versioned report at `SCHEMA_VERSION = 4`
- `src/pipeline/frame_processor.py` - the FrameResult contract the engine seam mirrors
- `scratch_output/` - live recordings with angles, joint scores, and `kp3d` (3D world
  landmarks with scores, 16 joints, logged since 2026-07-24, the ankle since 2026-09-19); the
  exam sitting at its top level is the parity harness's input

## Working rules

- Work in steps, and pause between them to report what was done.
- Ask immediately when uncertain. Do not assume silently. If a requirement is wrong or
  impossible, say so and propose the alternative rather than quietly working around it.
- No em dashes in any output, including files written here.
- Small team of three working directly on `main`. Never create branches. Never suggest
  opening a PR.
- Write a session log to `docs/sessions/YYYY-MM-DD.md` at the end of each session's work.
- Record a new decision as a dated section in `docs/DECISIONS.md` (and its ADR), not here.
- Keep `README.md` current with what actually exists.
- Vern starts `npm run dev` and `npx supabase start` himself. Only start them when he says
  so, or when a change needs browser verification, and stop both (`npx supabase stop`)
  before the final report. Never leave either running at the end of a turn.

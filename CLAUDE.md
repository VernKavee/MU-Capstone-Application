# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

Phases 0 to 5 are done. The repo holds the planning documents, the vocabulary, the
decision records, and the code so far: scaffolding, the foundation migration, auth,
consent, profile, the app shell, the exercise catalogue as data, the workout setup and
guide screens, the live session screen with the camera, MediaPipe, and the stub engine,
the completion flow: every set saved with its attempt records, engine report, video,
and keypoint file, similarity and feedback from stubs, the repair set, the rest timer,
and the finished summary, and History: the weekly chart on Home, active days, each
exercise's workouts, and the workout deep-dive with the replay. Phase 6 is hardening and
handover.

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
- `npm run test:unit`: every `lib/**/*.test.ts`, Node's own runner with type stripping.
  Files those tests reach import each other with `.ts` extensions for this reason.
- `npx next typegen` before `npx tsc --noEmit` after adding a route.
- `npx supabase db advisors` after any schema change.
- No end-to-end tests yet; Phase 6 adds them.

Conventions the code follows, because the docs changed since the plan was written:

- Next.js 16: the request hook is `proxy.ts`, not `middleware.ts`. Route types come from
  `next typegen` (`PageProps<"/path">`, `LayoutProps<"/">`). Search params are a Promise.
- Sessions are checked with `supabase.auth.getClaims()`, never `getSession()`.
- Server actions in `actions.ts` files next to the pages; errors travel back as an
  `?error=` query string, no client state. The completion flow's actions are called from
  the live screen, not from forms, and return errors as values.
- A "use server" file may export only async functions; constants live in `lib/`.
- `lib/supabase/server.ts` for server components and actions, `lib/supabase/client.ts`
  for the browser. Both are typed with the generated `Database`.
- Supabase's default grants give `anon` and `authenticated` everything on a new public
  table. Every migration revokes those and grants only what the app uses, so a missing
  policy fails with a privilege error rather than silently touching zero rows.
- The live session: `lib/engine/types.ts` is the seam, `lib/engine/stub.ts` the stub,
  `lib/live/pose.ts` the MediaPipe adapter, `lib/live/sound.ts` the beep and speech,
  `lib/live/session.ts` the frame loop outside React, and
  `app/(app)/workout/[exercise]/live/live-screen.tsx` the client component that only
  renders snapshots. The loop, not React, owns the camera, the landmarker, the engine,
  the overlay, the recorder, and the keypoint capture.
- The completion flow: `lib/save-and-analyse.ts` is the server logic with the Supabase
  client passed in, `live/actions.ts` wraps it as server actions, `live/pipeline.ts` runs
  save, uploads, and analyse for one set in the browser, and `live/set-complete.tsx`
  renders it. `lib/set.ts` builds the attempt records and the keypoint file. The
  similarity and feedback stubs are `lib/analysis/similarity.ts` and
  `lib/analysis/feedback.ts` behind `lib/analysis/contracts.ts`; each owner replaces one
  file.
- History: `lib/history.ts` is the plain-data part (local days, the seven days, means,
  frame lookup), Node-tested. The browser's time zone arrives in the `tz` cookie from
  `app/(app)/time-zone.tsx` and `lib/time-zone.ts` reads it; every date rendered on the
  server passes that zone. `lib/live/skeleton.ts` draws the skeleton for live and replay.
  The replay, `history/[exercise]/[workout]/replay.tsx`, fetches the video and the
  keypoint file from storage in the browser when Play is pressed.
- JSX built in a server component and passed as a prop to a client component that renders
  it beside its own children gets a `key`.

## The three-part AI structure

Three AI components are owned by specific people and **none of them is implemented in
this repo**. Each stays behind an explicit interface with a stub that returns believable
fake data, so one person can replace one file.

| Component | Owner | Lives where |
|---|---|---|
| Rule-based form checking plus FSM rep counting | Kavee (Vern) | already built in the research repo, see below; `lib/engine/stub.ts` stands in for it |
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
- Weekly chart: mean similarity per day over that day's sets; the last seven days ending
  today in the browser's time zone (Phase 5 replaced Monday to Sunday at Vern's request).
  History level 3 lists workouts, not sets.
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

Decided in Phase 2, recorded in the Phase 2 session log:

- `exercises.id` is the URL slug (`squat`, `push-up`, `lunge`, `bicep-curl`), a text
  primary key. `engine_key` is the research repo's registry name.
- `rule_based_logic` shape, enforced by the `exercise_logic_valid()` check constraint:
  `source`, `state_machine` (`states`, `thresholds` keyed by the Python FSM attribute
  names, `arming` or null), and `rules[]` each with `name`, `check`, `priority`, `scope`
  (`frame` or `rep`), `debounce_frames`, `threshold` (keys named per check), `messages`
  keyed by locale, `highlight_joints`. `lib/exercise.ts` holds the TypeScript type.
- Rule name and check name are separate fields, so a new exercise can reuse a check under
  its own rule name. Reads of the catalogue never branch on the exercise name.
- The seed is typed by hand from the research repo at c5fc57c and marked as such in the
  migration; the export script of ADR-0002 replaces it. Messages are verbatim from the
  Python. Guide text is a draft, not yet reviewed by the physiotherapy experts.
- `name` and `guide_text` are plain text; only rule messages are keyed by locale.
- Setup defaults 10 reps, 3 sets, 60 s rest; limits 1 to 100, 1 to 10, 0 to 600. The
  three numbers travel in the query string; a workout row exists only once its first set
  is saved (ADR-0004).
- `thumbnail_url` and `guide_video_url` are null until the media exists; the UI shows a
  labelled placeholder for null.
- `expert_motions`: no app role has any privilege; Punnapat's component writes it directly.
- Data changes to the catalogue are made through the database (psql or Studio), never
  through the API, which is read-only for it.

Decided in Phase 3, recorded in the Phase 3 session log:

- The live URL carries reps, sets, and rest. Since Phase 4 one visit runs the whole
  workout.
- Enum names from the Python are lower case strings; `state` is one of the row's
  `state_machine.states`.
- The stub judges placement and the ready pose (T pose, arms out) from the real landmarks
  and scripts attempts on a clock with random outcomes drawn from the row's rules. Holds
  are eight frames as in the research repo.
- Recording is a MediaRecorder Blob (webm where supported, else mp4); the keypoint capture
  is one object per frame with `t` since the recording started, the engine state, the
  event, and the keypoints. Both start on the first active frame. Phase 4 added the rules
  violated on each frame and decided the file format below.
- MediaPipe wasm from jsdelivr pinned to the installed version, the model from Google's
  storage, GPU with CPU fallback; the two URLs are constants in `lib/live/pose.ts`.
- Lite model: a manual choice on the preflight screen or a "Lagging?" button under fifteen
  frames per second, remembered in localStorage.
- The stage is mirrored, the recording is not. Sound is unlocked in the Start camera click.
- The skeleton highlight follows the held warning list, so lit joints last as long as the
  text.
- End of set: target reached, End set, or attempts at twice the target, checked only while
  active.
- Design: over video, off-white ink, tape yellow as the only accent, Big Shoulders Display
  800 (self-hosted, OFL) for the counter and the countdown only, text buttons in pills.

Decided in Phase 4, recorded in ADR-0003, 0004, 0005, 0007 and the Phase 4 session log:

- Keypoint file: JSON, gzipped in the browser, `<user_id>/<set_id>/keypoints.json.gz` in
  the private `sets` bucket beside `video.webm` or `video.mp4`: `joints`, `fields`, `fps`,
  and per frame `t`, `state`, `event`, and one flat row of 231 numbers.
- `keypoints_url` and `video_url` hold object paths, not URLs; null when an upload failed.
- Feedback context: the workout's earlier sets plus the last five other workouts of the
  exercise (`HISTORY_WORKOUTS`), as set summaries without attempt records.
- After a set: save the row, upload both files, then analyse. A retry redoes only what is
  missing. Each set's save waits for the previous one so all sets share one workout row.
- The repair set follows an initial set with any violation, abandoned attempts included,
  starts without rest, and keeps the set number. Skipping writes `repair_declined` on the
  initial set, even when the skip comes before the save lands.
- The rest timer starts the next set on its own at zero; Start now skips it.
- Finish workout writes `ended_at` and opens the finished summary, which reads from the
  database and has no retry; the retry lives on the set-complete screen.
- Column grants limit API updates to `workouts.ended_at` and, on `sets`, the decline, the
  file paths, similarity, feedback, and attempts. Nothing is deleted.
- Every attempt record carries `schema_version` 1; `threshold` is the rule's threshold
  object; `value` is `rep_stats[rule name]` or null.

Decided in Phase 5, recorded in ADR-0004, 0005 and the Phase 5 session log:

- The Home chart covers the last seven days ending today in the browser's time zone, today
  on the right, at Vern's request; each day is the mean over all its sets, workouts left
  part way included.
- An active day needs a finished workout, dated by its start, over the same seven days.
  Level 3 lists finished workouts only, so a workout left part way shows on the chart and
  nowhere else in History.
- Level 4 lists every set of the workout and shows the one in `?set=` in full; only that
  set's attempts, feedback, and file paths are fetched. The feedback detail screen is per
  set.
- Replay: the browser fetches the two files on Play; the video is not mirrored; timing
  comes from the keypoint file's `t`, never the video's duration; an attempt's violations
  light their joints for the whole attempt; a set missing a file is not replayed.
- The chart sits on the live screen's dark ground because tape yellow on white fails
  contrast. Big Shoulders also sets the deep-dive's similarity number.
- The deep-dive widens the (app) column through `data-wide`; other pages keep the phone
  column until Phase 6.
- No migration: the Phase 4 policies cover every read.

Still open, to be settled in the phase named:

- Video comes out at about 75 MB per minute (10 Mbit/s in Chrome); `videoBitsPerSecond` on
  the recorder would cut it. The keypoint file follows the device's frame rate, 60 fps on
  Vern's Mac, about 1.7 MB per minute.
- A workout left part way cannot be opened in History; Level 3 has no paging; a set
  missing one file is not replayed.
- A failed first save, or a reload mid-workout, gives the next set a new workout row.
- Signed upload URLs last two hours; an upload retried after that fails and is not re-signed.
- `sets.attempts` keeps an update grant so the analyse step can merge similarity into it,
  so a user can rewrite their own attempt records. Narrowing it needs a database function.
- A real camera run on a phone and iOS Safari (the laptop run happened in Phase 5), and a
  look at the live overlay since its drawing moved to `lib/live/skeleton.ts`.
- Embedding model and column dimension, at integration with Sujira's component.
- Whether the evaluation is supervised sessions or unsupervised use; decides self-hosted
  versus the Pro plan.
- Guide videos and thumbnails for the four exercises do not exist yet, and the guide text
  is a draft awaiting review.
- Whether `exercises.name` and `guide_text` should be locale-keyed like rule messages.

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
- Vern starts `npm run dev` and `npx supabase start` himself. Only start them when he says
  so, or when a change needs browser verification, and stop both (`npx supabase stop`)
  before the final report. Never leave either running at the end of a turn.

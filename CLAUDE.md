# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

All seven phases, 0 to 6, are done. The repo holds the planning documents, the
vocabulary, the decision records, and the code: scaffolding, the foundation migration,
auth, consent, profile, the app shell, the exercise catalogue as data, the workout setup
and guide screens, the live session screen with the camera, MediaPipe, and the engine
(the stub until 2026-10-04, now Vern's port), the completion flow: every set saved with its attempt records, engine report,
video, and keypoint file, similarity and feedback from stubs, the repair set, the rest
timer, and the finished summary, History: the weekly chart on Home, active days, each
exercise's workouts, and the workout deep-dive with the replay, and Phase 6's hardening:
unit, database, and end-to-end tests, loading, empty, and error states, the design pass,
`knowledge_base`, and `docs/HANDOVER.md`. Work from here is outside the plan: the
similarity and feedback owners replacing their stubs, and running the evaluation. The rule
engine port is in (2026-10-04, see "Decided at the engine port").

- `REQUIREMENTS.md` is the contract. It says WHAT the system must do, not HOW. Read it at the start of every session.
- `BUILD_PLAN.md` is the phase sequence: seven phases, one session each. Do not run more than one phase per session.
- `CONTEXT.md` is the vocabulary. Use its terms in code, UI, and docs, and challenge any term that conflicts with it.
- `docs/adr/` holds the seven decision records from Phase 0. Read the ones a phase depends on before starting it, and update them rather than deciding silently.
- `docs/sessions/` holds one log per session.
- `docs/HANDOVER.md` is the handover: which stub each owner replaces, the interface it
  must satisfy, what it returns today, and the evaluation tasks.
- `docs/DEPLOY.md` is the deployment plan: a Google Cloud VM, decided on 2026-10-01
  after the professor required a published site, and not rehearsed.

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
- `npm run test:e2e`: Playwright on the installed Chrome, one worker, with the stack up; it
  reuses a running dev server or starts one. `e2e/workout.spec.ts` runs a whole workout
  through Chrome's fake camera and skips itself without `e2e/fixtures/t-pose.y4m`, which is
  not in git (`e2e/fixtures/README.md`). `e2e/isolation.spec.ts` has user B fail to reach
  user A's workout, set, and files.

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
- The live session: `lib/engine/types.ts` is the seam, `lib/engine/engine.ts` the engine,
  `lib/live/pose.ts` the MediaPipe adapter, `lib/live/sound.ts` the beep and speech,
  `lib/live/session.ts` the frame loop outside React, and
  `app/(app)/workout/[exercise]/live/live-screen.tsx` the client component that only
  renders snapshots. The loop, not React, owns the camera, the landmarker, the engine,
  the overlay, the recorder, and the keypoint capture. The overlay canvas draws the camera
  frame under the skeleton, because iOS Safari drops `object-fit` on the video once
  MediaRecorder starts; the `<video>` stays under it as the source.
- The completion flow: `lib/save-and-analyse.ts` is the server logic with the Supabase
  client passed in, `live/actions.ts` wraps it as server actions, `lib/set-job.ts` runs
  save, uploads, and analyse for one set with that API passed in (`live/pipeline.ts`
  passes the real one), and `live/set-complete.tsx` renders it. `lib/set.ts` builds the
  attempt records and the keypoint file, and its `afterSet` decides repair, rest, or
  finish. The
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
- Server queries end in `.throwOnError()`, so a failure reaches `app/error.tsx` and its
  retry instead of rendering as no data. An id from the address goes through `isUuid`
  (`lib/history.ts`) first, so a malformed one is not found rather than a database error.
- A page renders beside the (app) layout's gate, not after it, so no page may assume the
  gate ran: Home and Settings read the profile with `maybeSingle()`.
- Next shows only the loading file of the folder whose child segment a navigation
  changes, so every folder whose pages link to each other has a `loading.tsx` that
  re-exports `app/(app)/loading.tsx`.
- Design (Phase 6): one dark theme, with no light palette and no `dark:` variants. Tokens
  in `app/globals.css`: `ink`, `tape`, `tape-ink`, with `background` and `foreground`
  naming the page's ground and text. Shared classes: `.btn` for the one main action,
  `.btn-quiet`, `.field`, and `.alert`, the tape band for anything to fix; over video, the
  live screen's `pill`. Every `h1` is Big Shoulders through a base rule, and the tape
  focus ring is global. Tape yellow marks only what needs attention.
- Layout: the (app) column is `max-w-5xl` on every page and each page sets its own
  measure inside it, left aligned. The tab bar is one `nav` named Primary, at the bottom
  on a phone and at the top from `md` up.

## The three-part AI structure

Three AI components are owned by specific people. Each stays behind an explicit interface,
so one person can replace one file. The rule engine is ported (2026-10-04); similarity and
feedback are still stubs that return believable fake data.

| Component | Owner | Lives where |
|---|---|---|
| Rule-based form checking plus FSM rep counting | Kavee (Vern) | ported from the research repo into `lib/engine/` (angles, fsm, rules, evaluator, gates, engine) |
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
  timestampMs, frameSize?)` returns the FrameResult fields and `getSessionReport()` returns the
  schema version 4 report. The UI never re-derives counters, states, or warnings. The
  port satisfies it, and `lib/engine/parity.test.ts` holds it equal to the Python.
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
  Amended 2026-10-01: the published site runs on a Google Cloud VM (`docs/DEPLOY.md`).
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
  compose file is not used. Since 2026-10-01 both this and the tunnel above hold for
  development only: the published site is a Google Cloud VM, see "Still open".
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
  800 (self-hosted, OFL) for the counter and the countdown, text buttons in pills. Phase 6
  carried it to every page.

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
  light their joints for the whole attempt; a set missing a file, or whose keypoint file
  holds fewer than two frames, is not replayed.
- The chart sits on a dark ground because tape yellow on white fails contrast; since
  Phase 6 every page does. Big Shoulders also sets the deep-dive's similarity number.
- No migration: the Phase 4 policies cover every read.

Decided in Phase 6, recorded in ADR-0001, 0002, 0004, 0005, 0007, `docs/HANDOVER.md`, and
the Phase 6 session log:

- `knowledge_base` exists, empty, with an untyped `extensions.vector` embedding and no API
  privilege, like `expert_motions`. pgTAP proves both, and that user A cannot read user B's
  workout, sets, or files even by id.
- End-to-end tests run on the installed Chrome with a fake camera fed a still T pose, with
  `--disable-ipv6` and `--disable-quic` for this network. The workout spec narrows
  `Math.random` after load so every attempt is incorrect; pinning it before load silently
  stops hydration. A not-found page streams inside a 200, so tests check the page.
- Every screen has loading, empty, and error states, checked at 375 and 1280 px.
- One dark theme on every page, and Big Shoulders for every page title and big number,
  both Vern's choices; the system light/dark switch and `data-wide` are gone. The guide
  shows each rule as its warning band, in priority order.
- Password resets are one SQL statement in Studio's SQL editor; backups are a data-only
  `db dump` plus `docker cp` of the storage volume. All three were run on the local stack.
- The evaluation tasks in the handover have their owners left blank, as Vern chose.

Decided at the engine port (2026-10-04), recorded in ADR-0002, 0003, 0006 and the
2026-10-04 session log:

- `lib/engine/` is a TypeScript port of SeniorProject `2695984` following its
  `docs/rule_based/WEB_APP_PORT.md`, brought to `32168a5` for the chosen arm;
  `ENGINE_VERSION` is the latest commit and equals the rows' `source`. The rows are the
  export of `scratch/export_web_logic.py` in the latest `rule_logic_<commit>` migration;
  never hand-edit them, re-run the export into a new migration.
- Gate order: the T pose (or A pose) facing the camera starts the 3 s countdown, placement
  checks the exercise's angle during it, and the countdown holds at 0 until placed (since
  2026-10-10 the pose counts only once the stand check passes, below). The
  live screen drives its centre text from `ready_phase` and shows the turn cue during the
  countdown, hiding the number at 0. A T pose held 30 frames ends the set.
- The row carries `state_machine.confidence_joints` and `placement` beyond the Phase 2
  shape; `exercise_logic_valid()` does not require them yet. Records carry `active_side`.
- Each rule's measured number is also written into `rep_stats` under the rule's name.
- Parity: `scratch/eval/eval_web_parity.py` in SeniorProject writes golden output for
  the 25 exam recordings; recordings made without the ready gate replay unarmed (Vern).
  `lib/engine/fixtures/` holds one trimmed recording per exercise; `PARITY_DIR` runs all.
- The stub and its test are deleted; the workout e2e is skipped until the real clip exists.

Decided 2026-10-04 (later), the chosen curl arm, recorded in ADR-0002, 0006 and the
2026-10-04 session log:

- The user chooses the arm once per workout on the setup screen (Left or Right, no
  default), shown only when the row's `state_machine.chooses_side` is true (the curl).
  `parseSetup(params, logic)` requires `side` there and refuses it elsewhere;
  `setupQuery` carries it with reps, sets, and rest; `workouts.side` stores it, fixed
  once saved. Every set and repair set of the workout uses it.
- `createEngine(..., { side })`: only that arm can open an attempt, and placement wants
  that arm toward the camera (left -45, right +45, one band only). Python first:
  SeniorProject `32168a5` (`forced_side`, `near_side`, `CHOOSES_SIDE`), then the export,
  then the port. `lib/engine/fixtures/dumbbell_biceps_curls_left.json.gz` is the forced
  golden.
- An exercise's active side is never guessed from the more-bent elbow when reading saved
  sets: it is in `engine_report` per rep.

Decided 2026-10-05, the curl elbow rebuild, recorded in ADR-0002 and the 2026-10-05
session log:

- SeniorProject `858b203`: migration `rule_logic_858b203` (curl `thr_inflection` and
  `partial_curl.flex_target` 40, `hysteresis_buffer` 30) and `CurlArmRebuild` in
  `lib/engine/angles.ts`, after the angles and before the session, curl only. The push-up
  `FloorBar` moved beside it (Vern).
- The frame size is the optional third argument of `process`, `[videoWidth, videoHeight]`
  from `lib/live/session.ts` every frame (Vern). Without it the raw angle is judged; a new
  size restarts the rebuild's calibration. Raw values stay in `angles` as `*_raw` keys.
- The curl parity fixtures carry image x, y and `frame_size`; `parity.test.ts` passes it.
- Five iPhone curl clips replayed offline through both engines with the gates on matched
  on every frame (`docs/sessions/2026-10-05.md`).
- Vern's Mac is also used for a corporate internship that forbids VPNs and tunnels, so it
  never runs Funnel or any other tunnel (ADR-0001). Superseded 2026-10-10: his manager
  allowed it.

Decided 2026-10-05, the similarity request, recorded in ADR-0007 and the 2026-10-05
session log:

- `SimilarityInput` is the layout Punnapat agreed, SeniorProject's
  `scratch/export_similarity.py`: `source` (the set id), `side` (the workout's arm or
  null), `totals`, attempts with `rep_number`, rule-name `violations`, and the engine's
  `side`, and each keypoint frame labelled with `attempt` and `rep` by `labelFrames`.
  `rep_count` per frame is not sent (Vern). `frame_size` in the keypoint file (schema
  version 2) and the request was waiting for the curl update, which is now in; it is not
  done yet (Vern: not now, during the curl update).

Decided 2026-10-10, the first phone run, recorded in ADR-0001, 0002 and the 2026-10-10
session log:

- Vern's manager allowed tunnels on the Mac. Phone tests use two Cloudflare quick tunnels
  (`cloudflared tunnel --url`, no account, no domain): the API on 54321 first, then
  `npm run build` and `npm start` with `NEXT_PUBLIC_SUPABASE_URL` set to its address on
  the command line, then the app on 3000. New addresses every run; all closed afterwards.
- SeniorProject `9a377cd`, migration `rule_logic_9a377cd`, `ENGINE_VERSION` `9a377cd`:
  while the ready gate waits, placement's `standCheck` (framing, distance, centring, never
  facing) must pass for the T pose to count, and its cue replaces the T-pose text. Guide
  step 1 says so. Gates-off parity unchanged.
- The live picture is drawn into the overlay canvas (iOS Safari drops `object-fit` on the
  video when MediaRecorder starts).
- Sound respects the phone's silent switch (Vern): no `navigator.audioSession` change.
  `sound.unlock()` speaks one silent utterance in the Start camera tap, because iOS Safari
  speaks nothing until a `speak()` runs inside a tap.

Decided 2026-10-17, the push-up body alignment, recorded in ADR-0002 and the 2026-10-17
session log:

- SeniorProject `5eccc55`: `hip_sag_or_pike` and `min_body_alignment` read the
  shoulder-hip-ankle angle of the trusted side (the higher of each side's lowest shoulder,
  hip, and ankle score; a tie goes to left), not the mean of both. The bar stays 160.
  Migration `rule_logic_5eccc55`, `ENGINE_VERSION` `5eccc55`, parity 96 of 96.
- SeniorProject `d6053af`: the ready pose also needs an upright trunk (mid-hip below the
  mid-shoulder by 0.7 of the trunk length), because a push-up plank passed as a T pose and
  ended sets. `ENGINE_VERSION` `d6053af`, migration `rule_logic_d6053af`.
- Speech: one phrase at a time (a new one waits, only the latest), rate 0.95, no repeat
  within 3 s, a warning wins over a placement cue on the same frame.
- MediaPipe's world z is fitted from synthetic data per the BlazePose GHUM model card, not
  measured, so rules that lean on depth are the least trustworthy.
- The push-up camera moves to a 90 degree side view (Vern, after two live sets at 90):
  SeniorProject `5a7e835`, placement 82 +/- 12 (was 45 +/- 25), guide text "side-on ...
  about 90 degrees", migration `rule_logic_5a7e835`, `ENGINE_VERSION` `5a7e835`. Every rule
  is unchanged: the body line agrees in every measure at 90, and the floor bar stays (one
  false shallow in 22 good reps there, from the bent arm's length under-reading). The
  near elbow in the picture separated better at 90 and is the fallback if false shallow
  warnings recur; changing to it needs the expert again. The no-z body line is stashed in
  SeniorProject, not shipped.

Decided 2026-10-21, the squat knee direction, recorded in ADR-0002 and the 2026-10-21
session log:

- SeniorProject `eddf6f1`, migration `rule_logic_eddf6f1`, `ENGINE_VERSION` `eddf6f1`:
  `knee_valgus` and `knee_varus` keep the 3D shin angle (bars 11, 8) and now also need the
  direction past `converge_min` 0.028 m, read with each knee given its ankle's z (x only).
  The angle keeps z because on the mirrored 45 degree side the error moves into x. Vern's 11
  false "Push knees out" in 31 good reps go to 0; exam unchanged; turned-in feet 5/5 to 2/5.
- Lowered to 0.020 the same evening (Vern): SeniorProject `50e4692`, migration
  `rule_logic_50e4692`, `ENGINE_VERSION` `50e4692`. On his labelled live workout (88 attempts)
  0.020 warned 0 of 31 good reps and caught 21 of 29 knees in and 8 of 11 knees out with no wrong
  cue; 0.028 caught 17 and 6; the old rule warned 2 good reps and gave 2 wrong cues.
- Camera angles stay (90 lunge and push-up, 45 curl and squat): changing them complicates
  explaining the stand (Vern), but they may change if the evidence is strong enough.
- Revert steps are in the session log.

Decided 2026-10-21, push-up landscape, recorded in ADR-0006 and the 2026-10-21 session log:

- The push-up is filmed with the phone sideways (Vern): a side-on plank does not fit a portrait
  frame. `exercises.landscape` (migration `push_up_landscape`), true only for the push-up, an app
  column outside the export. Guide text says to turn the phone sideways; the preflight says so too.
- `LiveSession` takes `landscape`; before the set is active, a portrait picture (`videoHeight >
  videoWidth`) is not fed to the engine, the engine is reset once, the picture is drawn without
  the skeleton, and `TURN_CUE` is shown and spoken. Never held once active, so `t` still indexes
  the video. A laptop camera is landscape and passes straight through.
- The standing T pose could not work sideways (Vern's phone run): a landscape frame cannot hold a
  standing body at plank distance. Replaced by the plank start below.

Decided 2026-10-21 (later), the push-up plank start, recorded in ADR-0002, 0006 and the
2026-10-21 session log:

- SeniorProject `7420788` and `0cb8485`, migrations `rule_logic_7420788` and `rule_logic_0cb8485`,
  `ENGINE_VERSION` `0cb8485`. `state_machine.ready_pose` (`t_pose` or `plank`, from the FSM's
  `READY_POSE`) chooses the start; only the push-up is `plank`. The live screen's waiting text
  is keyed by it, never by exercise.
- The plank start: on the trusted side (the higher lowest score of shoulder, elbow, wrist, hip,
  knee, ankle) all six at 0.5, elbow and knee 150 or more, trunk at the row's arming tilt (60)
  or more from vertical, held 8 frames. Evidence: SeniorProject
  `scratch/eval/eval_plank_gate.py`, 10 recordings at 90 degrees, the hold 0.7 to 6.4 s before
  the first rep, never standing.
- While waiting for a plank, placement runs in full (facing included) with the lying framing:
  plank width 0.40 to 0.95 of the frame, nothing within 0.03 of an edge, cue "Move back --
  your whole body must be in frame". Until the trunk lies it gives no cue, so a standing user
  sees "Get into a plank at the top...". The countdown is a plain 3 s hold.
- The set ends on getting up: the trunk under `thresholds.left_tilt_max` (30) held 30 frames,
  after 3 s. A rest on hands and knees does not end it; a T pose does, being standing.
- Parity: `lib/engine/fixtures/pushup_plank_gate.json.gz`, the cam90 good set with the ready gate
  on (placement off), matches the Python's `ready_phase` frame by frame.

Decided 2026-10-22, the push-up sag bar, recorded in ADR-0002 and the 2026-10-22 session log:

- Vern's live set warned 0 of 5 sags and 4 of 4 pikes (confirmed in the replay): good form reads
  up to 20 degrees on the pike side, so one bar at 160 needed about 30 degrees of sag.
- SeniorProject `ded29a2`, migration `rule_logic_ded29a2`, `ENGINE_VERSION` `ded29a2`:
  `hip_sag_or_pike` warns under `sag_align_min` 170 when the trusted side's hip is below its
  shoulder-ankle line (world y), under `align_min` 160 otherwise. One message, "Body not
  straight" (Vern). That set now: sags 4 of 5, pikes 4 of 4, no good rep. Exam good 2 of 10.

Still open, outside the build plan:

- The squat knee rules: the live check at 0.020 (2026-10-21) was right on the usual side but caught
  2 of 6 knees-in on the mirrored side (right side toward the camera). Not the yaw's size: good form
  reads about 6 degrees lower there and the 11 bar is fixed (SeniorProject RULES_AND_FSM 5.16; at 45
  degrees MediaPipe pulls the frontal part 6 to 15 toward "in" and adds a false sagittal part).
  Trying live: the knees-in bar lowered 11 to 8 (SeniorProject `c3a9129`), then the direction bar
  0.020 to 0.015 (`bfaa3dc`), then knees in judged from the signed frontal part over 7, knees out
  unchanged (`00437d1`, `ENGINE_VERSION` `00437d1`), revert steps in the session log.
  The good-rep check at 0.015 gave 18 of 56 false "Keep knees in line", 16 of them on the
  mirrored side, from a false sagittal part in the angle; the signed frontal part alone clears
  them but loses knees out.
  The frontal-part trial failed live too (11 of 20 good reps warned on the mirrored side).
  Stopped 2026-10-22: the error at 45 degrees is as large as the signal. Undecided: hide the knee
  cues and run one front-camera test with an agreed pass bar, or revert to `50e4692` and document
  (session log 2026-10-21, last two sections). Vern, 2026-10-22: the check exists so the knee
  travels the same way as the toes; the shin-to-shin vector may be the wrong idea (see the note
  there and RULES_AND_FSM 5.7 and 5.8). Each knee against its own foot, both legs summed, was
  measured offline on 2026-10-22 and fails (5.17): the thigh fails the side gate, the shank does
  not separate knees in from good, and a 30 degree turn moves the foot further into depth. Being tried (5.18): from the front, a
  vertical toe line per leg, read at the rep's deepest frame; a labelled calibration sitting,
  then a test sitting with its bar agreed (session log 2026-10-22). Still to choose: a per-person, per-side starting point, one camera side, the front
  camera for the knees, or the signed frontal part. An angle MediaPipe reads too low is still missed
  (LabMoCap kavee-squats-03: Vicon 12.7, read 7.1). Ask the physiotherapists whether a moderate
  knees-out (9 to 13 degrees) is a fault. Other people are not tested.

- The curl's depth error at the top: fixed by hysteresis 30 and the elbow rebuild
  (`858b203`). Remaining caution: a forearm pointing straight at the camera can read as a
  full bend. `docs/bicep-curl-depth-error.md` is a copy of SeniorProject's
  `docs/rule_based/BICEP_CURL_DEPTH_ERROR.md`, which is the one to work from. A set that
  never straightens the arm (the iPhone clip 8693) is one long attempt, and the rebuild
  needs ten straight-arm frames in the set before it acts; both as in the Python.

- Video is recorded at 2.5 Mbit/s (`VIDEO_BITS_PER_SECOND` in `lib/live/session.ts`,
  2026-10-01, Vern's choice by eye), about 19 MB per minute instead of 75; the size on a
  real camera through the app is not measured yet. The keypoint file follows the device's
  frame rate, 60 fps on Vern's Mac, about 1.7 MB per minute. Storage refuses a file over
  500 MiB, about 25 minutes of video.
- A workout left part way cannot be opened in History; Level 3 has no paging; a set
  missing one file is not replayed.
- Replay out of step (Vern, 2026-10-22): workout `44bd485d`, set 1's repair set (59 s, 1,639
  frames at 28 fps) plays with the skeleton out of step with the video; set 1 (26 s) did not.
  Not investigated (session log 2026-10-21, last section).
- A failed first save, or a reload mid-workout, gives the next set a new workout row.
- Signed upload URLs last two hours; an upload retried after that fails and is not re-signed.
- `sets.attempts` keeps an update grant so the analyse step can merge similarity into it,
  so a user can rewrite their own attempt records. Narrowing it needs a database function.
- The phone run (2026-10-10, iPhone, iOS Safari, quick tunnels on the Mac). Run 1 found
  the shrinking video, the T pose from too far, and no sound on silent. Run 2 found no
  speech, fixed by a silent utterance in the Start camera tap. After that Vern reported it
  working, with all sound. iOS records webm VP9; run 2 held 35 fps in every set (run 1 fell
  to 8-27 fps from set 2, cause unknown). Not confirmed item by item: the full-screen
  picture, the T pose from too far and too close (the narrow band of 0.45 to about 0.57 of
  the frame height on a portrait phone, in the session log), and History replay. Android
  Chrome is not tested.
- Similarity and feedback replacing their stubs (`docs/HANDOVER.md`). The workout e2e is
  skipped until a clip of real reps at the exercise's angle is its camera, with the T pose
  facing the camera first.
- After the port (WEB_APP_PORT.md section 15, item 7): film the e2e clip. `MODEL_URL` is
  pinned to `float16/1`, byte for byte the research repo's model, and real keypoint files
  carry real visibility scores (both 2026-10-04).
- Push-up at 90 degrees: checked on two live sets of one sitting only. Not measured yet: a
  calibration sitting (both sides, good, shallow, sag, pike), and whether the placement band
  holds while getting into the plank. The floor bar's ruler shrinks when the arm bends
  (up to 27% on the left arm), the likely cause of any false "Lower your chest".
- Push-up landscape and plank start (2026-10-21): on the phone the plank start and the countdown
  work (Vern, 2026-10-22). To fix later (Vern): the push-up's waiting instruction should suit a
  push-up and be spoken, not only shown (today `READY_TEXT.plank` in `live-screen.tsx` is screen
  text, and the voice says only placement cues). Proposed wording, short enough to hear from the
  floor: "Get into the push-up start position, arms straight, side-on to the camera", spoken
  once when the wait begins and again if it lasts. Not confirmed yet: the lying framing band
  (scaled from portrait sets); getting up ends the set and a rest on the knees does not; with
  the rotation lock on, whether the stream stays portrait; set-complete and rest sideways.
- Push-up sag bar (2026-10-22, above): not tested live yet. Pass bar agreed: one sitting at 90
  degrees, phone sideways, both sides, 10 good, 5 sag, 5 pike per side; pass = sag 4 of 5, pike
  5 of 5, at most 1 of 10 good warned. A small sag where good form reads near straight is still
  missed. Ask the physiotherapists whether 10 degrees of sag is the right line.
- The workout is slow to start on the phone (Vern, 2026-10-17). Not measured yet: which part
  (loading the MediaPipe wasm and the full model from jsdelivr and Google storage, starting
  the camera, the GPU delegate, or the page over the quick tunnel). `docs/HANDOVER.md`
  section 1 describes the port.
- The evaluation tasks in `docs/HANDOVER.md`. A restore and a deletion on request are not
  rehearsed, and a deleted tester's files stay until removed by hand.
- Similarity is a Python service over JSON (ADR-0007, 2026-09-29), and Python must be
  installed on the evaluation machine. Its request is agreed (above); `frame_size` can now join it
  and the keypoint file, not done yet.
- Embedding model and column dimension, at integration with Sujira's component.
- Whether the evaluation is supervised sessions or unsupervised use; it no longer decides
  the hosting.
- The deploy (`docs/DEPLOY.md`, ADR-0001, 2026-10-01): the professor requires a published
  site on AWS or a cloud, paid from the project budget. Decided: a Google Cloud VM running
  Supabase's self-hosted Docker Compose with generated secrets, Caddy, and the two Python
  services. `npx supabase start` uses published demo secrets, so it never faces the
  internet with real testers' data; Funnel on a team machine is for supervised sessions.
  Feedback is a Python service like similarity (ADR-0007). Bitrate cut done; the phone
  test is under way (above), then a rehearsal deploy, then the real one. Not rehearsed.
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
- `scratch_output/` - live recordings with angles, joint scores, and `kp3d` (3D world
  landmarks with scores, 16 joints, logged since 2026-07-24, the ankle since 2026-09-19); the
  exam sitting at its top level is the parity harness's input

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

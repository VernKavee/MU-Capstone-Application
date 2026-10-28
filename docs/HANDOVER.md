# Handover

The app is complete around three AI components, each behind an interface so its owner
replaces one file. The rule engine is ported (section 1); similarity and feedback are still
stubs that return believable fake output. This page is enough to work on any of them
without reading the rest of the codebase: where it lives or what to replace, the interface
to satisfy, what it returns today, and what else changes. The last section lists the tasks
for running the evaluation.

| Component | Owner | Replace | Interface | Called from | Runs |
|---|---|---|---|---|---|
| Rule-based form checking and rep counting | Kavee (Vern) | ported: `lib/engine/` | `Engine` in `lib/engine/types.ts` | `app/(app)/workout/[exercise]/live/live-screen.tsx` | in the browser, every camera frame |
| Motion similarity, a score per rep and per body part | Punnapat | real: `services/similarity/`, called by `lib/analysis/similarity.ts` | `SimilarityInput` to `SimilarityOutput` in `lib/analysis/contracts.ts` | `analyseSet` in `lib/save-and-analyse.ts` | on the Next.js server, once per set |
| Coaching feedback with retrieval | Sujira | `lib/analysis/feedback.ts` | `FeedbackInput` to `FeedbackOutput` in `lib/analysis/contracts.ts` | `analyseSet` in `lib/save-and-analyse.ts` | on the Next.js server, once per set, after similarity |

Rules for all three:

- Keep the caller and the types as they are. If a contract has to change, change the
  types file and its decision record (ADR-0002 for the engine, ADR-0007 for the other two)
  and tell the other two owners.
- Files under `lib/` import each other with `.ts` extensions, because the unit tests run
  on Node's own type stripping. Keep that in anything you add there.
- Before pushing: `npm run lint`, `npx tsc --noEmit`, `npm run test:unit`, and
  `npm run test:e2e` (see [Trying a replacement](#trying-a-replacement)).
- The team works on `main`, no branches.

## 1. Rule engine: Vern

Ported on 2026-10-04: the research repo's rules and state machines in TypeScript, in the
browser on every camera frame (NFR1), behind the research repo's own contract (ADR-0002).
The plan it followed is `~/Documents/SeniorProject/docs/rule_based/WEB_APP_PORT.md`; where
that plan and the Python disagree, the Python in `~/Documents/SeniorProject/src` wins.

### Where it lives

| File | Ported from | What it does |
|---|---|---|
| `lib/engine/engine.ts` | `frame_processor.py`, `session_report.py` | `createEngine(logic, engineKey, {placement, ready, armed, side})`, the per-frame order, the warning hold, the report; `ENGINE_VERSION` |
| `lib/engine/gates.ts` | `ready_pose.py`, `placement_guide.py` | the T or A pose, the ready gate, framing, distance, centring, facing |
| `lib/engine/evaluator.ts` | `form_evaluator.py`, `exercise_session.py` | debounce streaks, show one and record all, the attempt records, the session that steps both |
| `lib/engine/rules.ts` | `form_rules.py` | the check registry, one function per check name, and the per-rep statistics per engine key |
| `lib/engine/fsm.ts` | `base_fsm.py`, `exercise_fsms.py` | the state machine and its four variants, chosen by engine key |
| `lib/engine/angles.ts` | `angles.py`, `exercise_session.py` | the 3D geometry, the push-up floor bar, and the curl elbow rebuild (`CurlArmRebuild`) |

The live screen is the only caller: `createEngine(exercise.logic, exercise.engineKey, { side })`
in `live-screen.tsx`, with both gates on and the state machine unarmed until the countdown
ends. `side` is the arm the user chose on the setup screen, for a row with
`state_machine.chooses_side` (the curl), else null. The frame loop in `lib/live/session.ts`
calls `process` with the video's `videoWidth` and `videoHeight` as the frame size. `ENGINE_VERSION`
is `5a7e835`, the SeniorProject commit of the latest export (the port was made from
`2695984`), and is stored on every set as `engine_version`.

### Where each number lives

- **The bars Vern tunes are in the row**, `exercises.rule_based_logic`: the state machine
  thresholds and gate bars, the arming joints and tilt band, `confidence_joints`,
  `placement` (`yaw_center`, `yaw_tol`, in the engine's units, not camera degrees),
  `chooses_side`, and per
  rule the check name, threshold, priority, scope, debounce, message, and highlight
  joints. The rows are the output of `scratch/export_web_logic.py` in the latest
  `rule_logic_<commit>` migration (`rule_logic_5a7e835`).
- **The numbers that define a measurement are constants** in the TypeScript files
  (WEB_APP_PORT.md 5.2): confidence bars, the profile ratio, the knee band, the lunge
  bottom window, arming frames, the ready pose angles and holds, the placement box, the
  one second warning hold.
- **To change a bar**: change the Python, commit, run the export, and paste it into a new
  migration (`npx supabase migration new rule_logic_<sha>`), bump `ENGINE_VERSION` to
  that commit, and rewrite the fixtures (below): `parity.test.ts` fails until the rows,
  the fixtures, and `ENGINE_VERSION` name the same commit. A quick try in Studio works too, but the export is the source and the
  couplings of WEB_APP_PORT.md 5.1 must hold: `partial_pushup.floor_bar_max` equals the
  push-up `thr_inflection`, `shallow_lunge.front_shallow_max` and
  `straight_back_leg.front_target` equal the lunge `thr_inflection`,
  `partial_curl.flex_target` equals the curl `thr_inflection`. `exercise_logic_valid()`
  does not check `confidence_joints` or `placement`, so a row missing them saves and then
  breaks the live screen.
- **To change what a rule measures**: change the Python and port the same change, then
  regenerate the parity golden (below). A new check is one entry in `CHECKS` in
  `rules.ts`; a rep-scope check works only on an engine key whose statistics it reads
  (ADR-0006).

### Proving it still equals the Python

`lib/engine/parity.test.ts` replays recordings through the engine with both gates off and
compares every frame's state, event, counters, and rule names, and the report within
1e-9, against what the Python engine produced from the same file. The rows come from the
latest `rule_logic` migration, so the test runs on what the database holds.

- `npm run test:unit` runs the five trimmed recordings in `lib/engine/fixtures/`, one per
  exercise plus the curl with the left arm chosen. The curl ones carry image x, y and
  `frame_size`, so the replay passes the frame size and the elbow rebuild is under test.
- All 25 exam recordings: in SeniorProject,
  `.venv/bin/python3 -m scratch.eval.eval_web_parity` writes them to
  `scratch_output/web_parity/`, then here
  `PARITY_DIR=~/Documents/SeniorProject/scratch_output/web_parity npm run test:unit`.
  Adding `--fixtures ~/Documents/MU-Capstone-Application/lib/engine/fixtures` also
  rewrites the fixtures. The curl goldens come from `scratch_output/rebuild_rerun/`, the
  exam curl videos re-run with image x, y and `frame_size`.
  Recordings made without the ready gate (the four push-up phone files) replay unarmed.
- Parity compares with today's Python replay, which matches `eval_live_rules` on every
  exam recording. If the two ever differ, report it; do not tune a number to hide it.

Placement and the ready gate have no recording-based check, because the keypoint file
starts at the first active frame. Their unit tests in `lib/engine/gates.test.ts` are ported
from the research repo's synthetic cases; a live run is their real check.

### The interface, `lib/engine/types.ts`

- `process(keypoints, timestampMs, frameSize?): FrameResult`, once per camera frame.
  `keypoints` holds the 33 MediaPipe landmarks by the research repo's names, each with
  `x`, `y`, `z` (image-normalised), `x_3d`, `y_3d`, `z_3d` (world metres), and `score`
  (MediaPipe's visibility). `timestampMs` is `performance.now()`. The image is not
  mirrored; only the stage the user sees is.
- `frameSize` is `[width, height]` in pixels of the video MediaPipe saw (since `858b203`).
  Only the curl reads it: near the top of the curl the elbow and shoulder angles are
  re-read from the image x, y, because MediaPipe's world depth under-folds the elbow there
  (WEB_APP_PORT.md section 9b, `docs/bicep-curl-depth-error.md`). The rebuild learns the
  upper arm's image length from straight-arm frames during the set and needs ten before it
  acts. Without a frame size, or before it has learnt, the raw angle is judged against the
  same bars. A new frame size starts the learning over. The raw values stay in `angles`
  as `left_elbow_raw`, `right_shoulder_angle_raw`, and so on; nothing reads them.
- `getSessionReport(): SessionReport`, the research repo's schema version 4 report,
  read when the set ends and stored verbatim on the set (ADR-0003).
- `reset()`, called once the camera and the pose model are up, before the first frame.
  The live screen also builds a new engine for every set, for every "Try again" after a
  camera or model failure, and when the pose model is switched, so construction must be
  cheap and must not fetch anything. It is.

### What the app relies on

The UI never counts, judges, or re-derives anything. It reads these fields:

- `correct_rep_count` is the counter, `attempt_count` is shown beside it. The set ends
  when `correct_rep_count` reaches the target, when `attempt_count` reaches twice the
  target, or when `ready_phase` becomes `ended` (recorded as the user ending the set).
  All three are checked only while `ready_phase` is `active`.
- `warning_display[0]` is the one correction shown and spoken. `warning_display_rules`
  names the rules whose `highlight_joints` light up on the skeleton.
- `warnings_all[].name` is recorded on every frame of the keypoint file, so an attempt
  record can say which state a rule first fired in.
- `event`: `rep_started` opens an attempt, and `rep_completed` or `rep_abandoned` closes
  it. Attempt frame ranges come from these, and they are matched in order to the
  report's `reps` and `abandoned_attempts`. Every attempt closed by an event has its
  entry in the report, in the same order.
- Every rule name in `warnings_all`, in `warning_display_rules`, and in the report's
  `violations` is a `name` from the row's `rules`; the message shown comes from the row.
  `rep_stats` keyed by rule name gives each violation its measured value.
- `state` is one of the row's `state_machine.states`.
- Before the set, the centre text follows `ready_phase`: `waiting` asks for the ready
  pose facing the camera and `ready_pose` says it is held; `countdown` shows `countdown_s`
  with `placement_cues[0]` under it while `placement_phase` is `guiding`, and hides the
  number at 0, where the countdown waits for placement. While active, `low_confidence`
  shows "Step back into view". The frame loop speaks each new placement cue.

### What the engine returns

- **The start**: a T pose (arms out) or an A pose (arms down and away from the body), both
  arms straight, the whole body at a score of 0.5, held 8 frames facing the camera while
  the stand check passes, starts a 3 second countdown. The stand check (since `9a377cd`)
  is the whole body in frame, the height in frame (45% to 95%), and centring; while
  waiting placement reports `guiding` with its cues, such as "Move closer to the camera",
  and never a turn cue. During the countdown it checks all of them again and the turn: `body_yaw_deg` must sit in the
  row's band (squat, push-up, curl 45, lunge 75), and the cue says "Turn to your left" or
  "Turn to your right", the side picked once from the first reading. The countdown holds
  at 0 until 8 placed frames in a row; then the set is `active` and the state machine is
  armed. Placement then stays placed for the set.
- **During the set**: `low_confidence` while neither side has all of the row's
  `confidence_joints` at 0.3, or there is no world 3D; nothing advances on such a frame.
  Otherwise real angles drive the state machine and the rules. A still frame makes no
  attempt.
- **The end**: a T pose held 30 frames, at least 3 seconds into the set, makes
  `ready_phase` `ended`. The A pose never ends a set.
- **The push-up** (row `ready_pose` `plank`, since SeniorProject `7420788`): the start is the
  plank top held side-on (trusted side, elbow and knee 150 or more, trunk 60 or more from
  vertical), 8 frames, while placement passes in full, facing included, judged for a body lying
  across the frame (width 0.40 to 0.95, nothing at an edge); no cue until the trunk lies. The
  countdown is a plain 3 s hold. The end is getting up: the trunk under 30 degrees for 30
  frames. The phone is held sideways; the live screen waits while the picture is portrait.
- **The report**: `reps` and `abandoned_attempts` with `active_side` (the curl's working
  arm, else null) and `rep_stats`: the Python's statistics under their own names, an
  unseen one as null, plus each rule's compared number under the rule's name (ADR-0003),
  null for `elbow_flare`, which records none. `ready_gate.phase` is upper case and
  `exercise_name` is the engine key, as the Python writes them.
- **Deliberate differences from the Python** (WEB_APP_PORT.md section 9): no world 3D is
  low confidence rather than an error, there is no 2D fallback, and the centring cue is
  mirrored for the mirrored stage.

### Still to do

- `MODEL_URL` in `lib/live/pose.ts` is pinned to version 1, byte for byte the model the
  thresholds were tuned on, and real keypoint files carry real visibility scores (both
  checked 2026-10-04).
- Push-up `hip_sag_or_pike` warns on near-straight reps at 45 degrees, because the hidden
  far ankle is guessed and the rule averages both sides. Evidence and options:
  `docs/sessions/2026-10-04.md`.
- A live run on the laptop with real turns and real reps for all four exercises, then the
  phone. The curl's turn direction in its guide text is geometry, unconfirmed. Five
  iPhone curl clips (2026-10-05, `docs/sessions/2026-10-05.md`) were replayed offline
  through both engines, gates on: equal on every frame, and the rebuild counts both good
  sets in full where the raw angle counts none. The app on the phone itself is not run.
- The saved keypoint file does not carry the frame size yet, so a saved curl set replays
  through the rebuild only with the size read from its video.
- `e2e/workout.spec.ts` is skipped: the still T pose of `e2e/fixtures/` faces the camera,
  so it never passes placement and makes no reps. It needs a clip of real reps filmed at
  the exercise's angle, the T pose facing the camera first, and new expected counts.
- The frame rules wait 0.15 s, a time (since 2026-10-23). The other debounces and holds count
  frames, tuned at about 44 fps; a 60 fps laptop shortens them and a 30 fps phone lengthens them
  (WEB_APP_PORT.md section 12, open item 14).

## 2. Similarity: Punnapat

Compares each completed rep's motion with a reference rep of the same exercise and returns a
0 to 100 score per rep and per body part (ADR-0007, decided 2026-10-27). Real since
2026-10-27: Punnapat's Python service, SeniorProject `src/similarity/` (service 0.11.0, model
`bpe_v3_seed2026`), is copied into `services/similarity/` (`SOURCE.md` names the commit and how
to copy again). The app does no similarity math.

### How it runs

- `services/similarity/server.py` loads the model once and answers `POST /score` with the
  service's output, on 127.0.0.1, port `SIMILARITY_PORT` (default 8765). `GET /health` names
  the model. It needs Python 3.10 with `services/similarity/requirements.txt` (CPU torch).
- `lib/analysis/similarity.ts`: `scoreSimilarity` posts the input to `SIMILARITY_URL` and
  maps the answer with `fromService`. While `SIMILARITY_URL` is unset (development, the
  end-to-end tests) a stub answers in the same shape: no motion is read, a correct rep draws
  80 to 95 and an incorrect one 45 to 70 on the exercise's parts, and the set's `model` is
  `stub`.
- To change the service, change it in SeniorProject, copy it again, and run the checks below.

### Input

- `exercise_key`: the engine key, not the app's exercise id.

  | App id (`exercises.id`) | `exercise_key` (`exercises.engine_key`) |
  |---|---|
  | `squat` | `squat` |
  | `push-up` | `pushup` |
  | `lunge` | `lunge` |
  | `bicep-curl` | `dumbbell_biceps_curls` |

- `source`: the set's id, for logs. `side`: the workout's chosen arm for the curl, else null.
- `totals`: the set's `attempts`, `completed_reps`, `correct_reps`, `abandoned_attempts`.
- `attempts`, in order: `attempt_no`, `outcome`, `rep_number` (null when abandoned),
  `frame_start` and `frame_end` (inclusive indexes into `landmarks.frames`, null when a
  low-confidence pause swallowed the attempt's events), `violations` (rule names), `side`
  (the engine's `active_side`, or null).
- `landmarks`: the set's keypoint file as stored (ADR-0005) with `attempt` and `rep` added to
  each frame; the service cuts each rep by `attempt`. It reads the 2D image `x`, `y` and the
  visibility `score`, and needs `frame_size` (`[width, height]` in pixels), which keypoint
  files carry since 2026-10-27. A file saved before has none, so the service refuses it and
  that set stays unscored.

### Output, as the app keeps it

- Per attempt, except abandoned ones (ADR-0003): `score` (one decimal, or null when the
  service could not score the rep), `body_parts` (only the parts the rep is scored on: squat
  and lunge `torso`, `left_leg`, `right_leg`; push-up `torso` and the arms it saw; curl the
  working arm), `skipped_reason`, `warnings`, `tracking_confidence`.
- Per set: `mean_score` over the scored reps, `mean_score_correct` and
  `mean_score_incorrect` (the same mean split by the rule engine's verdict, null when a set
  has none of that kind), `body_parts` over the same parts, `weakest_body_part`, `model`,
  `service_version`, `tracking_confidence` (the mean over the scored reps, the stand-in for
  the camera setup), and `reference` (`kind` `builtin` or `package`, and its `source`), since
  scores from different models, references, or camera setups do not compare. Sets scored
  before 2026-10-28 have only `mean_score`, `body_parts`, `weakest_body_part`, and `model`.
- A service answer with `status` `error` throws: the set stays saved without similarity,
  feedback is still written without it, and the set-complete screen shows "Similarity
  failed:" and the message, with a Retry. A retry skips similarity once the set has it, and
  keeps the feedback already written unless it scored similarity this time.

The numbers land in `sets.similarity` and in each attempt record in `sets.attempts`, and
feed the Home chart, History, the set-complete screen, and the feedback input. How to read a
score (typical ranges, camera angle, tracking) is SeniorProject
`docs/similarity/SCORE_INTERPRETATION.md`.

### The reference motion

The service's built-in reference reps (`services/similarity/references/`, Punnapat's lab
recordings at the app's camera angles, cut by the rule engine) are used. `expert_motions`
stays empty; a coach's recorded set could later be sent as the service's `reference` package.

### Checking a change

- `npm run test:unit`: `lib/analysis/stubs.test.ts` maps a recorded service answer
  (`lib/analysis/fixtures/similarity-output-squat.json`, from SeniorProject's tests) and
  checks the stub.
- Start the server and POST a real set's request; `status` must be `ok` or `partial`.
- SeniorProject's `tests/test_similarity_service.py` is the service's own test.

## 3. Coaching feedback: Sujira

Retrieves biomechanical knowledge for the set's errors and asks a language model for
coaching text that is safe for this user (REQUIREMENTS FR3).

### What to replace

`lib/analysis/feedback.ts`, one function:

```ts
export async function writeFeedback(input: FeedbackInput): Promise<FeedbackOutput>
```

The stub's second parameter, `delayMs`, only exercises the loading state. `analyseSet`
calls this on the server after similarity, so the input carries similarity when it
succeeded and null when it did not. As with similarity, the file can be the component in
TypeScript or a call to your own service. The model's API key lives with whichever
process calls the model: in `.env.local` without `NEXT_PUBLIC_` if this file calls it.

### Input

`docs/feedback-input-structure.json` gives every field's type, and
`docs/feedback-input-example.json` is a real one: set 3 of a squat workout on 2026-10-27, written
by `feedbackInput` in `lib/save-and-analyse.ts`, the function `analyseSet` calls, rescored on
2026-10-28 so its similarity has every field. Its past workouts predate `frame_size`, so their
similarity is null, as it is for any set saved before 2026-10-27.

- `profile`: `display_name`, `age`, `gender`, `weight_kg`, `height_cm`, and
  `medical_history`, free text, required, possibly "none". The medical history is the
  safety input: the advice must respect it (REQUIREMENTS FR1, a previously broken leg is
  the report's example).
- `exercise`: `id` (the app id, the same as `knowledge_base.exercise_id`), `name`, and
  `rules`, the row's rules with `name`, `priority`, `scope`, `threshold`, and `messages.en`.
- `workout`: `target_reps`, `target_sets`, `rest_seconds`, and `earlier_sets`, this
  workout's sets before this one.
- `set`: this set, with its `attempts` in full: each attempt's `outcome`,
  `state_durations_s`, `rep_stats`, `similarity`, and `violations`, each with the rule,
  its message, priority, scope, the state it fired in, the measured value, and the
  threshold.
- `history`: up to five (`HISTORY_WORKOUTS`) other workouts of the same exercise, newest
  first, finished or left part way, with their sets but without attempt records.

Sets outside the current one travel as summaries: `set_no`, `kind`, `ended_by`, `totals`,
`similarity`, and `feedback`.

Reading similarity beside the rules (SeniorProject `docs/similarity/SCORE_INTERPRETATION.md`):
the rule violations say what to fix; similarity says how close the motion was to the
reference. A single score means little on its own: compare it with the set's
`mean_score_correct` and `mean_score_incorrect`, the means over the reps the rules judged
correct (no warning) and incorrect (a warning). `weakest_body_part` points at the torso even
on good reps, because the torso reads 6 to 9 points below the legs (section 4), so it is a
hint, not the thing to fix. A repair set has `kind` `repair`, and the initial set it
repairs is in `earlier_sets` with the same `set_no`, so the advice can say what went
wrong the first time (REQUIREMENTS section 4.5).

### Output

- `{ feedback }`, plain English text, a few short paragraphs. It is written to
  `sets.llm_feedback` and shown on the set-complete screen, the finished summary, History
  (the first four lines), and the feedback detail page. Markdown is not rendered, and
  line breaks show only on the detail page. The column is plain text with no length
  limit, so keeping it short is up to the component.
- The user waits on the set-complete screen while it runs. If the rest timer starts the
  next set first, the text still lands on the set and shows in the summary and History.
- On failure, throw an `Error` with a readable message. The set stays saved, the
  set-complete screen shows "Feedback failed:" and the message, and Retry runs feedback
  again without re-scoring similarity.

### The knowledge base

`knowledge_base` has `id` (uuid), `exercise_id` (the app id), `content` (text),
`embedding` (pgvector, nullable), and `created_at`, with an index on `exercise_id` for
retrieval scoped to one exercise. It is empty, and like `expert_motions` it is reached
only over a direct database connection. `embedding` is an untyped `vector` because the
model is not chosen. Once it is, add a migration (`npx supabase migration new <name>`)
that sets the column to `extensions.vector(<dimension>)` and creates an hnsw index with
the operator class for your distance, then run `npm run db:reset`, `npm run db:types`,
and `npm run test:db`.

### What the stub returns today

After 1.5 seconds, one paragraph built from the input: the set's counts; the most
frequent violation and how many attempts it hit, or that no rule fired; the mean
similarity score and the weakest body part; how many earlier attempts in the workout did not
count; how many past workouts are in the context; the medical history quoted back; and
"(Stub feedback: no language model was called.)". No retrieval, no model.

### What else changes

- The feedback test in `lib/analysis/stubs.test.ts` checks the stub's wording; replace it.
- `e2e/workout.spec.ts` ends by expecting the medical history, word for word, on the
  feedback detail page. A model will not quote it verbatim, so change that step to
  something your component does guarantee.

## Trying a replacement

With Node 22 and Docker Desktop, following the README:

```bash
npm install
npx supabase start
npm run dev
```

`.env.local` comes from `.env.example` plus the publishable key printed by
`npx supabase status -o env`. At http://localhost:3000, register, accept the three
consents, fill in the profile, pick an exercise, and open the camera. Stand back facing the
camera with your whole body in view, where the screen stops asking you to move, and hold
your arms straight out until the countdown,
turn as the cue says, then do real reps; a T pose held for about a second ends the set. For
the push-up, hold the phone sideways, get into the top of a plank side-on, follow the cues, hold
through the countdown, and get up to end the set. When the set ends, the set-complete screen shows similarity and
feedback as they arrive. Supabase Studio at http://localhost:54323 shows the set's row
(`attempts`, `similarity`, `llm_feedback`) and its two files in the `sets` bucket. The
keypoint file there, once gunzipped, is the `landmarks` value similarity receives, less
the per-frame `attempt` and `rep` the app adds from the set's `attempts`, so one real set gives a test fixture for the components that run after it.

`npm run test:e2e` runs the isolation test. The whole-workout test is skipped until a clip
of real reps replaces its still camera frame (`e2e/fixtures/README.md`).

## Evaluation-time tasks

The evaluation runs on a team machine (ADR-0001). Owners are for the team to fill in.

Decided on 2026-10-01, after the professor required a published site: the final deploy
is a Google Cloud VM, and the rows below apply with the changes in
[DEPLOY.md](DEPLOY.md). The local stack uses Supabase's published demo secrets, so a team
machine behind Funnel is for supervised sessions with the tunnel closed afterwards.

| Task | Owner | Notes |
|---|---|---|
| Tunnel | | Install Tailscale on the team machine and open Funnel: the app on 443, the Supabase API on 8443. `NEXT_PUBLIC_SUPABASE_URL` must be the 8443 address, because browsers upload straight to storage (NFR3). The camera needs https, which Funnel gives. Or, as for the 2026-10-10 phone test: two Cloudflare quick tunnels, `cloudflared tunnel --url http://127.0.0.1:54321` then the build with `NEXT_PUBLIC_SUPABASE_URL` set to its address, then `cloudflared tunnel --url http://127.0.0.1:3000` (ADR-0001). |
| Run the app | | `npm run build`, then `npm run start` rather than the dev server. Keep the machine awake and the stack up for the whole evaluation. Testers' devices need the internet: the pose model and its wasm come from Google's storage and jsdelivr. |
| Supervised or unsupervised | | Not decided, and no longer decides the hosting: the Google Cloud VM of [DEPLOY.md](DEPLOY.md) stays up either way (ADR-0001). |
| Before the evaluation | | A camera run on a real phone and on iOS Safari has not happened yet. Guide videos and thumbnails do not exist (the UI labels the gap) and the guide text awaits the physiotherapy experts' review; both are data changes in Studio. |
| Database backup | | `npx supabase db dump --local --data-only -f backup-<date>.sql` covers accounts, consents, profiles, workouts, sets, and storage's records of the files. The schema is the migrations in git. |
| File backup | | `docker cp supabase_storage_MU-Capstone-Application:/mnt files-<date>` while the stack runs copies every video and keypoint file. Storage keeps them under its own folder layout, so restore by copying back into the volume, from the same moment as the database backup. A restore has not been rehearsed. |
| Disk | | Video is about 19 MB per minute of set, recorded at 2.5 Mbit/s since 2026-10-01 (75 MB before). Storage refuses a file over 500 MiB (`supabase/config.toml`), about 25 minutes of video. |
| Password resets | | There is no email, so no self-service reset. In Studio's SQL editor: `update auth.users set encrypted_password = extensions.crypt('<new password>', extensions.gen_salt('bf')) where email = '<email>';` The password needs at least 8 characters. Tell the tester privately. Studio is only on the team machine, http://localhost:54323. |
| Deletion on request | | The consent text promises deletion earlier than the project's end if a tester asks. Deleting the user in Studio's Authentication page cascades to their profile, consents, workouts, and sets. Their files do not cascade: delete their folder, named after their user id, in the `sets` bucket. Not rehearsed. |
| Reading the results | | The team reads everyone's data directly: the database as `postgres`, and the files. There is no admin screen and no export (ADR-0001). |

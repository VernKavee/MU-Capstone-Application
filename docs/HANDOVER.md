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
| Motion similarity, six numbers per rep | Punnapat | `lib/analysis/similarity.ts` | `SimilarityInput` to `SimilarityOutput` in `lib/analysis/contracts.ts` | `analyseSet` in `lib/save-and-analyse.ts` | on the Next.js server, once per set |
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
| `lib/engine/engine.ts` | `frame_processor.py`, `session_report.py` | `createEngine(logic, engineKey, {placement, ready, armed})`, the per-frame order, the warning hold, the report; `ENGINE_VERSION` |
| `lib/engine/gates.ts` | `ready_pose.py`, `placement_guide.py` | the T or A pose, the ready gate, framing, distance, centring, facing |
| `lib/engine/evaluator.ts` | `form_evaluator.py`, `exercise_session.py` | debounce streaks, show one and record all, the attempt records, the push-up floor bar |
| `lib/engine/rules.ts` | `form_rules.py` | the check registry, one function per check name, and the per-rep statistics per engine key |
| `lib/engine/fsm.ts` | `base_fsm.py`, `exercise_fsms.py` | the state machine and its four variants, chosen by engine key |
| `lib/engine/angles.ts` | `angles.py` | the 3D geometry |

The live screen is the only caller: `createEngine(exercise.logic, exercise.engineKey)` in
`live-screen.tsx`, with both gates on and the state machine unarmed until the countdown
ends. `ENGINE_VERSION` is `2695984`, the SeniorProject commit the port was made from, and
is stored on every set as `engine_version`.

### Where each number lives

- **The bars Vern tunes are in the row**, `exercises.rule_based_logic`: the state machine
  thresholds and gate bars, the arming joints and tilt band, `confidence_joints`,
  `placement` (`yaw_center`, `yaw_tol`, in the engine's units, not camera degrees), and per
  rule the check name, threshold, priority, scope, debounce, message, and highlight
  joints. The rows are the output of `scratch/export_web_logic.py` in the migration
  `rule_logic_2695984`.
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

- `npm run test:unit` runs the four trimmed recordings in `lib/engine/fixtures/`.
- All 25 exam recordings: in SeniorProject,
  `.venv/bin/python3 -m scratch.eval.eval_web_parity` writes them to
  `scratch_output/web_parity/`, then here
  `PARITY_DIR=~/Documents/SeniorProject/scratch_output/web_parity npm run test:unit`.
  Adding `--fixtures ~/Documents/MU-Capstone-Application/lib/engine/fixtures` also
  rewrites the four fixtures.
  Recordings made without the ready gate (the four push-up phone files) replay unarmed.
- Parity compares with today's Python replay, which matches `eval_live_rules` on every
  exam recording. If the two ever differ, report it; do not tune a number to hide it.

Placement and the ready gate have no recording-based check, because the keypoint file
starts at the first active frame. Their unit tests in `lib/engine/gates.test.ts` are ported
from the research repo's synthetic cases; a live run is their real check.

### The interface, `lib/engine/types.ts`

- `process(keypoints, timestampMs): FrameResult`, once per camera frame.
  `keypoints` holds the 33 MediaPipe landmarks by the research repo's names, each with
  `x`, `y`, `z` (image-normalised), `x_3d`, `y_3d`, `z_3d` (world metres), and `score`
  (MediaPipe's visibility). `timestampMs` is `performance.now()`. The image is not
  mirrored; only the stage the user sees is.
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
  arms straight, the whole body at a score of 0.5, held 8 frames facing the camera,
  starts a 3 second countdown. Placement is not checked while waiting, so it reports
  `guiding` with no cues. During the countdown it checks the whole body in frame, the
  height in frame (45% to 95%), centring, and the turn: `body_yaw_deg` must sit in the
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
- **The report**: `reps` and `abandoned_attempts` with `active_side` (the curl's working
  arm, else null) and `rep_stats`: the Python's statistics under their own names, an
  unseen one as null, plus each rule's compared number under the rule's name (ADR-0003),
  null for `elbow_flare`, which records none. `ready_gate.phase` is upper case and
  `exercise_name` is the engine key, as the Python writes them.
- **Deliberate differences from the Python** (WEB_APP_PORT.md section 9): no world 3D is
  low confidence rather than an error, there is no 2D fallback, and the centring cue is
  mirrored for the mirrored stage.

### Still to do

- Pin `MODEL_URL` in `lib/live/pose.ts` to the model file the thresholds were tuned on
  (WEB_APP_PORT.md section 12), and gunzip one real keypoint file from storage to check
  the scores are real visibilities, not all 1.
- A live run on the laptop with real turns and real reps for all four exercises, then the
  phone. The curl's turn direction in its guide text is geometry, unconfirmed.
- `e2e/workout.spec.ts` is skipped: the still T pose of `e2e/fixtures/` faces the camera,
  so it never passes placement and makes no reps. It needs a clip of real reps filmed at
  the exercise's angle, the T pose facing the camera first, and new expected counts.
- Every debounce counts frames, tuned at about 44 fps; a 60 fps laptop shortens them and a
  30 fps phone lengthens them (WEB_APP_PORT.md section 12, open item 14).

## 2. Similarity: Punnapat

Compares the user's motion with the expert's and returns six numbers per rep: `overall`,
`head_neck`, `back_core`, `hips_pelvis`, `knees`, `ankles_feet` (REQUIREMENTS section 7).

Punnapat writes it in Python as a service the app calls with JSON over HTTP (ADR-0007,
2026-09-29). The exact fields are still to be agreed; open questions for him:

- Which 15 joints, by MediaPipe index. They must cover the head and neck and the ankles
  and feet, since those are regions of the output.
- Image-normalised x, y, z (fields 0 to 2) or MediaPipe's world coordinates in metres
  (fields 3 to 5).
- Whether an attempt's frame range, from leaving Idle to returning to it, is trimmed
  enough or needs more trimming.
- One expert rep per exercise, since `expert_motions` holds one `motion_data` each.
- The frame rate differs between sets, 60 fps on a Mac and perhaps 30 on a phone.
- Python has to be installed on the evaluation machine.

### What to replace

`lib/analysis/similarity.ts`, one function:

```ts
export async function scoreSimilarity(input: SimilarityInput): Promise<SimilarityOutput>
```

The stub's second parameter, `random`, is only for its test. `analyseSet` calls this on
the server after the set is saved and its keypoint file uploaded, reading the file back
from storage as the signed-in user. The function can be the component itself in
TypeScript, or a call to your own service (ADR-0007), for example:

```ts
export async function scoreSimilarity(input: SimilarityInput): Promise<SimilarityOutput> {
  const res = await fetch(process.env.SIMILARITY_URL!, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`the similarity service answered ${res.status}`);
  return (await res.json()) as SimilarityOutput;
}
```

A server-only setting like that goes in `.env.local` and `.env.example`, without the
`NEXT_PUBLIC_` prefix.

### Input

- `exercise_key`: the engine key, not the app's exercise id.

  | App id (`exercises.id`) | `exercise_key` (`exercises.engine_key`) |
  |---|---|
  | `squat` | `squat` |
  | `push-up` | `pushup` |
  | `lunge` | `lunge` |
  | `bicep-curl` | `dumbbell_biceps_curls` |

- `landmarks`: the set's keypoint file as stored (ADR-0005), already decompressed.
  `joints` is the 33 landmark names in MediaPipe's order, `fields` is
  `["x", "y", "z", "x_3d", "y_3d", "z_3d", "score"]`, and `fps` is the rate the device
  managed, so it differs between sets. Each entry in `frames` has `t` (milliseconds since the recording
  started), `state`, `event`, and `points`, one flat row of 231 numbers: field `f` of
  joint `j` is `points[j * 7 + f]`. Not mirrored.
- `attempts`: `attempt_no`, `outcome` (`correct`, `incorrect`, or `abandoned`), and
  `frame_start` and `frame_end`, both inclusive indexes into `frames`. Both are null when
  a low-confidence pause swallowed the attempt's events.

### Output

- `attempts`: one `{ attempt_no, similarity }` per attempt you score. Leave out abandoned
  attempts (ADR-0003) and any you cannot score; they keep a null similarity.
- `set`: the six numbers for the whole set. The stub uses the mean over completed reps.
- Integers from 0 to 100; the UI shows them as percentages. The database only checks
  that `similarity` is a JSON object, so a missing key or a fraction is not caught at
  the write: it shows up as a broken number on screen.
- On failure, throw an `Error` with a readable message. The set stays saved without
  similarity, and the set-complete screen shows "Similarity failed:" and the message,
  with a Retry. A retry skips similarity once the set has it.

The numbers land in `sets.similarity` and in each attempt record in `sets.attempts`, and
feed the Home chart, History, the set-complete screen, and the feedback input.

### The expert motion

`expert_motions` has `exercise_id` (the app id, text, primary key), `motion_data`
(bytea, meant for a `.npy` file's contents), and `updated_at`. It is empty. No API role can
reach it: read and write it over a direct database connection, locally
`postgresql://postgres:postgres@127.0.0.1:54322/postgres` (printed by
`npx supabase status`). Join the input's key through `exercises.engine_key`.

### What the stub returns today

No motion is read. For every completed attempt it draws a base score, 86 to 97 for a
correct rep and 66 to 84 for an incorrect one, sets each region to the base plus or minus
7, and `overall` to the regions' mean. `set` is each number's mean over the scored
attempts, or zeros when there are none.

### What else changes

- The similarity test in `lib/analysis/stubs.test.ts` checks the stub, including "a
  correct rep scores above an incorrect one", which a real component need not promise.
  Replace it with a test on a motion whose answer you know.
- `e2e/workout.spec.ts` expects every set of its workout to be scored, through the Home
  chart's description ("today: N% over 3 sets").

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
`similarity`, and `feedback`. A repair set has `kind` `repair`, and the initial set it
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
frequent violation and how many attempts it hit, or that no rule fired; the overall
similarity and the lowest region; how many earlier attempts in the workout did not
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
camera with your whole body in view and hold your arms straight out until the countdown,
turn as the cue says, then do real reps; a T pose held for about a second ends the set. When the set ends, the set-complete screen shows similarity and
feedback as they arrive. Supabase Studio at http://localhost:54323 shows the set's row
(`attempts`, `similarity`, `llm_feedback`) and its two files in the `sets` bucket. The
keypoint file there, once gunzipped, is exactly the `landmarks` value similarity receives,
so one real set gives a test fixture for the components that run after it.

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
| Tunnel | | Install Tailscale on the team machine and open Funnel: the app on 443, the Supabase API on 8443. `NEXT_PUBLIC_SUPABASE_URL` must be the 8443 address, because browsers upload straight to storage (NFR3). The camera needs https, which Funnel gives. |
| Run the app | | `npm run build`, then `npm run start` rather than the dev server. Keep the machine awake and the stack up for the whole evaluation. Testers' devices need the internet: the pose model and its wasm come from Google's storage and jsdelivr. |
| Supervised or unsupervised | | Not decided, and no longer decides the hosting: the Google Cloud VM of [DEPLOY.md](DEPLOY.md) stays up either way (ADR-0001). |
| Before the evaluation | | A camera run on a real phone and on iOS Safari has not happened yet. Guide videos and thumbnails do not exist (the UI labels the gap) and the guide text awaits the physiotherapy experts' review; both are data changes in Studio. |
| Database backup | | `npx supabase db dump --local --data-only -f backup-<date>.sql` covers accounts, consents, profiles, workouts, sets, and storage's records of the files. The schema is the migrations in git. |
| File backup | | `docker cp supabase_storage_MU-Capstone-Application:/mnt files-<date>` while the stack runs copies every video and keypoint file. Storage keeps them under its own folder layout, so restore by copying back into the volume, from the same moment as the database backup. A restore has not been rehearsed. |
| Disk | | Video is about 19 MB per minute of set, recorded at 2.5 Mbit/s since 2026-10-01 (75 MB before). Storage refuses a file over 500 MiB (`supabase/config.toml`), about 25 minutes of video. |
| Password resets | | There is no email, so no self-service reset. In Studio's SQL editor: `update auth.users set encrypted_password = extensions.crypt('<new password>', extensions.gen_salt('bf')) where email = '<email>';` The password needs at least 8 characters. Tell the tester privately. Studio is only on the team machine, http://localhost:54323. |
| Deletion on request | | The consent text promises deletion earlier than the project's end if a tester asks. Deleting the user in Studio's Authentication page cascades to their profile, consents, workouts, and sets. Their files do not cascade: delete their folder, named after their user id, in the `sets` bucket. Not rehearsed. |
| Reading the results | | The team reads everyone's data directly: the database as `postgres`, and the files. There is no admin screen and no export (ADR-0001). |

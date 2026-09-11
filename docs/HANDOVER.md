# Handover

The app is complete around three AI components that are not built here. Each is a stub
that returns believable fake output, and each owner replaces one file. This page is
enough to do that without reading the rest of the codebase: what to replace, the
interface to satisfy, what the stub returns today, and what else changes when you do.
The last section lists the tasks for running the evaluation.

| Component | Owner | Replace | Interface | Called from | Runs |
|---|---|---|---|---|---|
| Rule-based form checking and rep counting | Kavee (Vern) | `lib/engine/stub.ts` | `Engine` in `lib/engine/types.ts` | `app/(app)/workout/[exercise]/live/live-screen.tsx` | in the browser, every camera frame |
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

The TypeScript port of the research repo's portable core, behind the research repo's own
contract (ADR-0002). It must run on the user's device (NFR1).

### What to replace

`lib/engine/stub.ts`. The live screen is its only importer and uses two names from it:
`createStubEngine(logic, engineKey)` at `live-screen.tsx:89` and `ENGINE_VERSION` at
`live-screen.tsx:71`. Either keep both names in `stub.ts`, or put the port in its own
folder and change that one import at `live-screen.tsx:6`. The frame loop,
`lib/live/session.ts`, takes whatever it is given as an `Engine`.

- `logic` is the exercise row's `rule_based_logic`: state names, state machine
  thresholds, arming joints, and the rules with their thresholds, messages, priorities,
  scope, debounce, and highlight joints. Configure from it, never from the exercise name
  (ADR-0006).
- `engineKey` is the research repo's registry name: `squat`, `pushup`, `lunge`,
  `dumbbell_biceps_curls`.
- `ENGINE_VERSION` is stored on every set as `engine_version`. The stub's is `stub-1`;
  export your own, for example the research repo's commit.

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
  cheap and must not fetch anything.

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
  report's `reps` and `abandoned_attempts`. Every attempt closed by an event needs its
  entry in the report, in the same order.
- Every rule name you emit, in `warnings_all`, in `warning_display_rules`, and in the
  report's `violations`, must be a `name` from the row's `rules`; the message shown comes
  from the row. `rep_stats` keyed by rule name gives each violation its measured value.
- `state` must be one of the row's `state_machine.states`.
- Before the set: `placement_phase` `guiding` shows `placement_cues[0]`; `ready_phase`
  `waiting` asks for the ready pose and `ready_pose` says it is held; `countdown` shows
  `countdown_s`. While active, `low_confidence` shows "Step back into view".

### What the stub returns today

- Real: the placement guide from the landmarks' bounding box (whole body in view, head or
  feet cut off, too far when the body is under 30% of the frame's height, off centre);
  the ready gate, a T pose held for 8 frames, then a 3 second countdown (no A pose); the
  confidence guard, which pauses the set when neither side's arming joints reach a score
  of 0.3.
- Fake: once active, an attempt about every 2.5 seconds on a clock (Idle 0.5 s,
  Concentric 0.8 s, Inflection 0.4 s, Eccentric 0.8 s). Each outcome is drawn at random:
  12% abandoned, 20% incorrect with one of the row's rules and sometimes a second,
  otherwise correct. A frame-scope rule shows 250 to 800 ms into the Concentric phase. An
  abandoned attempt carries the highest priority rep-scope rule. `angles` is empty, the
  yaw fields are null, and every `rep_stats` number is invented: the rule's first
  threshold plus or minus 5 to 15.

### What else changes

- `lib/engine/stub.test.ts` tests the stub's script and goes with it. Its first test's
  checks belong to the seam, not the stub: the counter moves only on a correct rep, at
  most one warning per frame, every warning comes from the row, and the report's totals
  add up. They are worth keeping against the port, fed a recorded landmark stream. A
  parity harness also needs the research repo to dump raw landmarks per frame
  (ADR-0002).
- `e2e/workout.spec.ts` runs a whole workout through Chrome's fake camera, fed a still
  frame of a person in a T pose. That works only because the stub scripts attempts on a
  clock, and the spec narrows `Math.random` so every attempt comes out incorrect. With
  the port a still frame produces no attempts, so the spec needs a clip of real reps as
  its camera feed (`e2e/fixtures/README.md`) and new expected counts.

## 2. Similarity: Punnapat

Compares the user's motion with the expert's and returns six numbers per rep: `overall`,
`head_neck`, `back_core`, `hips_pelvis`, `knees`, `ankles_feet` (REQUIREMENTS section 7).

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
consents, fill in the profile, pick an exercise, and open the camera. Stand back with your
whole body in view and hold your arms straight out until the countdown; the stub engine
then scripts attempts. When the set ends, the set-complete screen shows similarity and
feedback as they arrive. Supabase Studio at http://localhost:54323 shows the set's row
(`attempts`, `similarity`, `llm_feedback`) and its two files in the `sets` bucket. The
keypoint file there, once gunzipped, is exactly the `landmarks` value similarity receives,
so one real set gives a test fixture for the components that run after it.

`npm run test:e2e` runs a whole workout without a person in front of the camera, once
the fixture in `e2e/fixtures/README.md` is generated.

## Evaluation-time tasks

The evaluation runs on a team machine (ADR-0001). Owners are for the team to fill in.

| Task | Owner | Notes |
|---|---|---|
| Tunnel | | Install Tailscale on the team machine and open Funnel: the app on 443, the Supabase API on 8443. `NEXT_PUBLIC_SUPABASE_URL` must be the 8443 address, because browsers upload straight to storage (NFR3). The camera needs https, which Funnel gives. |
| Run the app | | `npm run build`, then `npm run start` rather than the dev server. Keep the machine awake and the stack up for the whole evaluation. Testers' devices need the internet: the pose model and its wasm come from Google's storage and jsdelivr. |
| Supervised or unsupervised | | Not decided. If testers use it on their own over days, the Pro plan is the fallback and needs no code change (ADR-0001). |
| Before the evaluation | | A camera run on a real phone and on iOS Safari has not happened yet. Guide videos and thumbnails do not exist (the UI labels the gap) and the guide text awaits the physiotherapy experts' review; both are data changes in Studio. |
| Database backup | | `npx supabase db dump --local --data-only -f backup-<date>.sql` covers accounts, consents, profiles, workouts, sets, and storage's records of the files. The schema is the migrations in git. |
| File backup | | `docker cp supabase_storage_MU-Capstone-Application:/mnt files-<date>` while the stack runs copies every video and keypoint file. Storage keeps them under its own folder layout, so restore by copying back into the volume, from the same moment as the database backup. A restore has not been rehearsed. |
| Disk | | Video is about 75 MB per minute of set. Storage refuses a file over 500 MiB (`supabase/config.toml`), so a set with more than about seven minutes of video would fail to upload. |
| Password resets | | There is no email, so no self-service reset. In Studio's SQL editor: `update auth.users set encrypted_password = extensions.crypt('<new password>', extensions.gen_salt('bf')) where email = '<email>';` The password needs at least 8 characters. Tell the tester privately. Studio is only on the team machine, http://localhost:54323. |
| Deletion on request | | The consent text promises deletion earlier than the project's end if a tester asks. Deleting the user in Studio's Authentication page cascades to their profile, consents, workouts, and sets. Their files do not cascade: delete their folder, named after their user id, in the `sets` bucket. Not rehearsed. |
| Reading the results | | The team reads everyone's data directly: the database as `postgres`, and the files. There is no admin screen and no export (ADR-0001). |

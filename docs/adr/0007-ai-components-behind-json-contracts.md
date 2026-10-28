---
status: accepted
---

# Similarity and feedback are JSON contracts behind stubs

Similarity is Punnapat's component and coaching feedback with retrieval is Sujira's. Neither exists yet, and their language and runtime are theirs. The app talks to each through a JSON-in, JSON-out contract from one server-side analyse step in Next.js. This repo ships an in-process TypeScript stub for each that returns believable fake output. The real implementation of a stub is expected to be an HTTP client to a small service on the same machine, written in whatever its owner chose; a TypeScript module satisfies the same contract. This decision is expected to be revised when the components exist. The contract is the stable part, the transport is not.

## The analyse step

1. The set is saved as soon as it ends, with its attempts, engine report, and file URLs.
2. Similarity is called with the engine key, the landmark stream, and the attempt frame ranges. It returns per-attempt and per-set region scores, which are written to the set.
3. Feedback is called with the set's attempts including similarity, the exercise's rules, the user's profile including medical history, mobility, and disability, the workout's earlier sets with their feedback, and summaries of the user's past workouts of the same exercise, bounded by `HISTORY_WORKOUTS`, the last five, fixed in Phase 4. The component retrieves knowledge-base chunks from the rule-based violations, scoped to the exercise, and returns the coaching text, which is written to the set.
4. If a call fails, the set is kept with the field empty and the user can retry. The set-complete screen shows a loading state while step 3 runs.

There is no chat. The feedback stub visibly echoes the medical history so the seam for safe advice is real while the text is fake.

## Data the components own

`knowledge_base` (chunks per exercise with embeddings) and `expert_motions` (one per exercise) live in this app's Postgres as the report specifies, created empty in Phase 6 and Phase 2. A component that is JSON-in only receives a database connection string. The embedding column's dimension depends on Sujira's model, which is not chosen; the column is added at integration, with an untyped pgvector `vector` column as the fallback, and pgvector itself is enabled in the first migration. The LLM API key lives with whichever process calls the model.

## Contract sketches

Similarity in: `{ exercise_key, landmarks: { joints, fields, fps, frames }, attempts: [{ attempt_no, frame_start, frame_end, outcome }] }`. Out: `{ attempts: [{ attempt_no, similarity }], set: { overall, regions } }`. The input was replaced on 2026-10-05, below.

Feedback in: `{ profile, exercise: { name, rules }, workout: { target_reps, target_sets, earlier_sets }, set: { set_no, kind, totals, attempts }, history }`. Out: `{ feedback }`.

The exact TypeScript types are fixed in Phase 4, below.

## As built in Phase 4

- The types are in `lib/analysis/contracts.ts`: `SimilarityInput`, `SimilarityOutput`, `FeedbackInput`, `FeedbackOutput`. The `landmarks` field is the keypoint file of ADR-0005 as stored.
- The stubs are `lib/analysis/similarity.ts` and `lib/analysis/feedback.ts`, one function each. Similarity returns six numbers for every completed attempt, higher for a correct rep than an incorrect one, none for an abandoned attempt, and the set's numbers as the mean over completed reps. Feedback waits 1.5 seconds and assembles its text from the input, quoting the medical history back.
- The analyse step is `lib/save-and-analyse.ts`, called through server actions with the user's own Supabase client, so row-level security applies to every read and write, the download of the keypoint file included. The browser saves the set, uploads both files, then asks for the analysis.
- History bound: `HISTORY_WORKOUTS` is 5. The feedback input carries the user's five most recent other workouts of the same exercise, finished or left part way, newest first. Each comes with its sets summarised as set number, kind, ended by, totals, similarity, and feedback. Attempt records of past workouts are not sent; the current set's are. The current workout's earlier sets travel in `workout.earlier_sets` in the same summary form. Five keeps the input small while covering about a week of regular training; Sujira's component may lower it once the model's context and cost are known.
- A retry re-runs only what is missing. Similarity is skipped when the set already has it, and file paths already stored are never erased.

## As built in Phase 6

- `knowledge_base` exists, empty: `id`, `exercise_id` referencing the catalogue, `content`, `embedding`, `created_at`, with an index on `exercise_id` for retrieval scoped to one exercise. The report's `chunk_id` is `id`, as on every other table.
- `embedding` is the untyped `extensions.vector`, the fallback named above, so any length goes in while the model is open. It is nullable, so a chunk can be stored before it is embedded. No vector index can exist on an untyped column; at integration the column becomes `vector(<dimension>)` and gets an hnsw index.
- Like `expert_motions`, no API role has any privilege on it and row-level security has no policy: the component connects to the database directly. `supabase/tests/knowledge_base.test.sql` proves both.
- This record first placed a component's service "in the same Docker Compose". Since Phase 1 there is none: the stack is `npx supabase start` (ADR-0001), so a service runs beside it on the team machine and the stub file calls it by URL.
- The database checks only that `similarity` is a JSON object and `attempts` an array. The six integer keys are a convention the UI relies on, not a constraint, and `llm_feedback` is plain text without a limit.
- `docs/HANDOVER.md` is each owner's page: the input and output field by field, what the stub returns today, and which tests change with the replacement.

## Decided 2026-09-29

- Similarity is a Python service beside the stack on the team machine, Punnapat's choice. `scoreSimilarity` becomes an HTTP client that POSTs JSON to it.
- The request's exact fields were agreed on 2026-10-05, below. A change to `SimilarityInput` in `lib/analysis/contracts.ts` changes this record too.
- His component works on one array per rep of shape (15, 3, T): 15 joints, x, y, z, and the rep's frames. His service cuts these from the keypoint file's `frames` and each attempt's `frame_start` and `frame_end`, so the app writes no `.npy` files.

## Decided 2026-10-05

- Punnapat agreed the request layout of SeniorProject's `scratch/export_similarity.py`, whose sample files of the exam sitting he received first (format note: `scratch_output/similarity_export/README.md` there). The web request matches it:
  `{ exercise_key, source, side, totals, attempts: [{ attempt_no, outcome, rep_number, frame_start, frame_end, violations, side }], landmarks: { schema_version, joints, fields, fps, frames: [{ t, state, event, attempt, rep, points }] } }`.
- `source` is the set's id. `totals` are the set's. Top-level `side` is the workout's chosen arm, null when the exercise has no choice. Each attempt's `side` is the engine's `active_side` from the stored report, its `violations` are rule names, and `rep_number` is null for an abandoned attempt.
- `landmarks` is the stored keypoint file plus two fields per frame, `attempt` and `rep`: the attempt and rep the frame is inside, from `frame_start..frame_end` inclusive, null outside, and `rep` null inside an abandoned attempt (`labelFrames` in `lib/set.ts`). The file in storage is unchanged.
- Two fields of the sample are not sent, by Vern's choice or for now. `frames[].rep_count` is left out: it repeats what `attempt` and `rep` say, and the format note itself says to cut reps by those. `landmarks.frame_size` waits for the curl update that makes the frame size an engine input; it then goes into the keypoint file (schema version 2, ADR-0005) and the request. Until then a reader of the sample files must treat both as optional. The curl update arrived later on 2026-10-05 (ADR-0002); `frame_size` in the keypoint file and the request is not done yet, by Vern's choice for now.

## Decided 2026-09-30

- Feedback is a Python service too, as Vern reports for Sujira's component. `writeFeedback` becomes an HTTP client like `scoreSimilarity`. Its fields are `FeedbackInput` and `FeedbackOutput` until agreed otherwise with her.
- Both services are planned to run on the deployment machine beside Next.js, reached over localhost, which is one reason the planned deploy is a VM and not a hosted platform (ADR-0001, `docs/DEPLOY.md`).

## Decided 2026-10-27

- Similarity is real. Punnapat's service, SeniorProject `src/similarity/` (service 0.11.0, model `bpe_v3_seed2026`), is copied into `services/similarity/` (`SOURCE.md` names the commit) with `server.py`, a standard-library HTTP front: `POST /score` takes `SimilarityInput` and answers the service's output, on 127.0.0.1 only. `scoreSimilarity` posts to `SIMILARITY_URL` and keeps the stub only while that is unset, for development and the end-to-end tests.
- The names are the service's, not the report's (Vern). REQUIREMENTS section 7 splits the body into five regions, `head_neck`, `back_core`, `hips_pelvis`, `knees`, `ankles_feet`, plus `overall`. The model scores `torso`, `left_arm`, `right_arm`, `left_leg`, `right_leg`, and none of the regions holds an arm, so the curl (arm only) and the push-up (torso and arms) could not be shown. Per attempt: `score`, `body_parts`, `skipped_reason`, `warnings`, `tracking_confidence`. Per set: `mean_score`, `body_parts`, `weakest_body_part`, `model`. Scores keep one decimal; the screens round them.
- Only the parts a rep is scored on are kept: squat and lunge the torso and both legs, push-up the torso and both arms (the visible one when an arm is hidden), curl the working arm (`fromService` in `lib/analysis/similarity.ts`). A rep the service could not score keeps `score` null and its reason, so the feedback never judges form from it; an abandoned attempt still has no similarity (ADR-0003). A service `status` of `error` throws, which keeps the set and offers the retry of step 4.
- The service reads the 2D image `x`, `y` and needs the picture's size: the keypoint file gains `frame_size`, `[width, height]` in pixels, within `schema_version` 1 (ADR-0005), because the service refuses any other version. Files saved before have none, so their sets stay unscored. The stub's numbers were cleared by `20261027163404_similarity_real_scores.sql`.
- The feedback input carries the new shape, including the fields that say when not to judge (`skipped_reason`, `warnings`, `tracking_confidence`); how to read a score is SeniorProject `docs/similarity/SCORE_INTERPRETATION.md`. The reference is the service's built-in one; `expert_motions` stays empty.

## Decided 2026-10-28

- Similarity may be empty, and feedback no longer waits on it: when the service fails or scores no rep, `analyseSet` keeps the error and writes feedback with `similarity` null. A retry that scores nothing new keeps the feedback already written.
- `sets.similarity` also keeps `mean_score_correct` and `mean_score_incorrect`, the service's means over the reps the rule engine judged correct (no warning fired) and incorrect (a warning fired), and `reference` (`kind`, `source`), because a new reference moves scores by 20 to 30 points. `weakest_body_part` is still sent; HANDOVER section 3 says it is a hint, since the torso reads lower even on good reps.
- The built-in reference is a placeholder: the expert's recorded sets will be the reference. The trained model is unchanged by that; only the reference rep changes. The route (a rebuilt built-in reference or a `reference` package per request) is to agree with Punnapat.
- Judging whether similarity separates correct from incorrect reps is Punnapat's; the app's check is that a set is scored, stored, and shown.

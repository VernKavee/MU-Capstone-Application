---
status: accepted
---

# Similarity and feedback are JSON contracts behind stubs

Similarity is Punnapat's component and coaching feedback with retrieval is Sujira's. Neither exists yet, and their language and runtime are theirs. The app talks to each through a JSON-in, JSON-out contract from one server-side analyse step in Next.js. This repo ships an in-process TypeScript stub for each that returns believable fake output. The real implementation of a stub is expected to be an HTTP client to a small service in the same Docker Compose, written in whatever its owner chose; a TypeScript module satisfies the same contract. This decision is expected to be revised when the components exist. The contract is the stable part, the transport is not.

## The analyse step

1. The set is saved as soon as it ends, with its attempts, engine report, and file URLs.
2. Similarity is called with the engine key, the landmark stream, and the attempt frame ranges. It returns per-attempt and per-set region scores, which are written to the set.
3. Feedback is called with the set's attempts including similarity, the exercise's rules, the user's profile including medical history, mobility, and disability, the workout's earlier sets with their feedback, and summaries of the user's past workouts of the same exercise, bounded by a Phase 4 parameter defaulting to the last five. The component retrieves knowledge-base chunks from the rule-based violations, scoped to the exercise, and returns the coaching text, which is written to the set.
4. If a call fails, the set is kept with the field empty and the user can retry. The set-complete screen shows a loading state while step 3 runs.

There is no chat. The feedback stub visibly echoes the medical history so the seam for safe advice is real while the text is fake.

## Data the components own

`knowledge_base` (chunks per exercise with embeddings) and `expert_motions` (one per exercise) live in this app's Postgres as the report specifies, created empty in Phase 6 and Phase 2. A component that is JSON-in only receives a database connection string. The embedding column's dimension depends on Sujira's model, which is not chosen; the column is added at integration, with an untyped pgvector `vector` column as the fallback, and pgvector itself is enabled in the first migration. The LLM API key lives with whichever process calls the model.

## Contract sketches

Similarity in: `{ exercise_key, landmarks: { joints, fields, fps, frames }, attempts: [{ attempt_no, frame_start, frame_end, outcome }] }`. Out: `{ attempts: [{ attempt_no, similarity }], set: { overall, regions } }`.

Feedback in: `{ profile, exercise: { name, rules }, workout: { target_reps, target_sets, earlier_sets }, set: { set_no, kind, totals, attempts }, history }`. Out: `{ feedback }`.

Exact TypeScript types are fixed in Phase 4.

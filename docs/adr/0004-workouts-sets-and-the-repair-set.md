---
status: accepted
---

# Workouts own sets, and the repair set is a set

The report's setup screen collects reps per set and a number of sets, but its data model stores one row per set with nothing grouping them, and its repair-round rule is written per set. We add a `workouts` parent. A workout is one choice of exercise, rep target, set count, and rest length; it owns its sets. A set with any violation on any attempt, abandoned attempts included, is offered exactly one repair set immediately, recorded as a set of kind `repair` with the same set number. The user may decline, and the decline is recorded. Then the next set starts. Feedback is generated after every set, with the workout's earlier sets as context.

## Tables

`workouts`: `id`, `user_id`, `exercise_id`, `target_reps`, `target_sets`, `rest_seconds`, `started_at`, `ended_at`. Created when its first set is saved, so an abandoned setup leaves no row.

`sets`: `id`, `workout_id`, `set_no`, `kind` (`initial` or `repair`), `ended_by` (`target_reached`, `user_ended`, `attempt_cap`), `repair_declined`, `started_at`, `ended_at`, `totals` (attempts, completed reps, correct reps, abandoned attempts), `attempts` (ADR-0003), `engine_report`, `keypoints_url`, `video_url`, `similarity` (overall and per region, averaged over completed reps), `llm_feedback`, `engine_version`. Unique on `workout_id`, `set_no`, `kind`.

## The six questions of section 9.2

| Question | Answer |
|---|---|
| What does history level 3 list? | Workouts, newest first, with date and the workout's mean similarity. Level 4 shows the workout's sets. |
| How does the weekly chart average? | Mean similarity over all sets of the day, initial and repair alike. |
| How many repair sets can one workout trigger? | At most one per set. |
| What does the LLM see? | The set it is writing for, the workout's earlier sets with their feedback, and the user's history for the exercise. |
| How many videos? | One per set, repair sets included. |
| What does rest look like? | A timer between sets, default sixty seconds, set on the setup screen, then the ready gate again. |

## Considered options

- Group sets by time window: rejected, it turns a fact into a guess.
- A session is the whole workout with set boundaries inside the per-rep detail: rejected, it breaks the report's payload shape and the per-set repair rule.
- Drop multi-set from v1: rejected by the user; the setup screen keeps both numbers.

## As built in Phase 4

- `keypoints_url` and `video_url` hold object paths in the private `sets` bucket, `<user_id>/<set_id>/...`, not URLs. A reader signs a download URL when it needs one. Both stay null when an upload failed.
- `sets` also has `created_at`, which orders a workout's sets for the feedback context.
- `repair_declined` is recorded on the set whose repair set was skipped. A repair set is offered only after an initial set, never after a repair set, and the unique constraint allows one per set number.
- The repair set starts at once, without rest. After it, or after a skip, the rest timer runs before the next set.
- The rest timer counts down on the set-complete screen and starts the next set on its own at zero, back through the placement guide and the ready gate. Start now skips the wait. A rest of zero starts the next set at once, so that set's feedback is first read on the finished summary.
- `ended_at` on the workout is written when the user presses Finish workout after the last set. A workout left part way keeps a null `ended_at` and its saved sets.
- Column grants limit what the API may update: `ended_at` on a workout, and `repair_declined`, the two file paths, `similarity`, `llm_feedback`, and `attempts` on a set. Nothing is deleted.

## As built in Phase 5

- History only reads. Level 3 lists finished workouts, those with `ended_at`, newest first, each with the mean similarity over all its sets, initial and repair.
- The weekly chart covers the last seven days ending today, not Monday to Sunday, at Vern's request. It stays set based, so the sets of a workout left part way count there and nowhere else in History.
- An active day is a day with a finished workout of the exercise, dated by the workout's start in the browser's time zone.
- Level 4 lists every set of the workout, each repair set after the set it repairs, and shows the chosen one in full.

## As built in Phase 6

- What follows a set, one repair set after an initial set with any violation, abandoned attempts included, unless it was skipped, then the rest or the end, is `afterSet` in `lib/set.ts`, tested in `lib/set.test.ts`.
- The job that saves a set, uploads its files, and analyses it is `lib/set-job.ts`. `lib/set-job.test.ts` proves the order, that a retry redoes only what is missing, that each save waits for the previous set's, and that a skip before the save lands is still recorded.
- The workout end-to-end test takes one repair set and skips another, and checks that the rest timer follows a repair set rather than a second offer.

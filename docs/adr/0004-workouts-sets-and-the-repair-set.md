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

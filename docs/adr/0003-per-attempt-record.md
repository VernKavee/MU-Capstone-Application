---
status: accepted
---

# One record per attempt, merged from the engine's report and the AI outputs

The report's `reps_detail` and the research repo's schema version 4 report describe the same thing from different sides. The report has a status, per-region similarity, and state durations. The engine has separate lists for completed reps and abandoned attempts, each with violations and continuous `rep_stats`, and no similarity. Every set stores both: the engine's report verbatim in `engine_report`, and one merged record per attempt, in order, in `attempts`. The app's record has `schema_version` 1 and stores the engine's report version beside it.

## The record

```json
{
  "attempt_no": 3,
  "outcome": "incorrect",
  "rep_number": 2,
  "frame_start": 412,
  "frame_end": 501,
  "state_durations_s": { "concentric": 1.1, "inflection": 0.4, "eccentric": 0.9 },
  "violations": [
    { "rule": "knee_depth", "message": "Lower to 90 degrees", "priority": 1,
      "scope": "rep", "state": "inflection", "value": 112, "threshold": "<= 100" }
  ],
  "rep_stats": { "min_knee": 112, "max_back_tilt": 31.5 },
  "similarity": { "overall": 91, "head_neck": 95, "back_core": 90,
                  "hips_pelvis": 88, "knees": 89, "ankles_feet": 93 }
}
```

`outcome` is `correct`, `incorrect` (completed with violations), or `abandoned`. `rep_number` is the engine's number for completed reps and null for abandoned attempts. `frame_start` and `frame_end` index the keypoint file and the video. `state_durations_s` is computed by the frame loop from the per-frame engine state. `rep_stats` is the engine's snapshot, verbatim. `similarity` is null until Punnapat's component fills it and always null for abandoned attempts.

## Field mapping

| Report field | Research repo field | This record |
|---|---|---|
| rep_no | rep_number, attempt_number | attempt_no for every attempt, rep_number for completed ones |
| status completed or aborted | reps list versus abandoned_attempts list | outcome |
| similarity_scores_percent | none | similarity |
| state_duration_seconds descending, bottom, ascending | none | state_durations_s concentric, inflection, eccentric |
| errors[].error_type | violations[] | violations[].rule |
| errors[].angle_recorded | rep_stats | violations[].value |
| errors[].threshold_expected | ruleset constants | violations[].threshold |
| errors[].state_occurred | none | violations[].state |
| errors[].action | none | dropped, implied by outcome |
| aborted_reps | total_attempts_abandoned | totals.abandoned_attempts on the set |
| completed_reps | total_reps_completed | totals.completed_reps, plus totals.correct_reps, the counter |

## As built in Phase 4

`lib/set.ts` builds the records in the browser from the engine's report and the captured frames. Nothing is judged there: outcomes, counts, and violations are the engine's.

- Every record carries `schema_version` 1. The engine's report keeps its own `schema_version` 4 in `engine_report`.
- `threshold` is the rule's threshold object copied from the exercise row, for example `{ "depth_target": 100 }`, not a string such as `"<= 100"`. The direction of the comparison belongs to the check, and the record does not carry code.
- `value` is the `rep_stats` entry named after the rule, and null when there is none. The stub keys its invented `rep_stats` by rule name. The port must do the same, or the export script must map statistic names to rule names, for `value` to fill.
- `state` is the engine state, lower case, of the first frame in the attempt whose violations list the rule. A rep scope rule appears on the completion frame, so its state is usually `idle`. It is null when the rule never appears on a frame.
- `state_durations_s` is keyed by the row's state names in lower case and sums the frame gaps from `rep_started` to the closing event.
- A report record whose event the frames never showed keeps its place with a null frame range, so every attempt still has a record.
- `similarity` is written into each record by the analyse step of ADR-0007, at the same time as the set's own `similarity`.

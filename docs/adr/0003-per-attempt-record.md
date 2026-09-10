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

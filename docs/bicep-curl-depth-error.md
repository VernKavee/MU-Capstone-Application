# Bicep curl: MediaPipe's depth error at the top of the curl

**A copy.** The one to work from is SeniorProject's
`docs/rule_based/BICEP_CURL_DEPTH_ERROR.md`, since the fix lands in the Python first and
reaches this repo through the export and the port (ADR-0002). Paths below without a repo
are SeniorProject's; `lib/...` and migrations are this repo's.

Found 2026-10-04 by plotting two curl workouts in this app (Vern). Not fixed.

## What it is

At the top of a curl, the elbow angle reaches a low, rises 10 to 30 degrees, then falls to
a second low. Vern confirmed his elbow stayed still. The keypoints say the same:

- In the image the elbow stays put. Its offset from the shoulder moves a median 4 px (90th
  percentile 9) of a 1280 px wide frame while the hand is up.
- MediaPipe's 3D world points move the same elbow 6 cm toward the camera at the median
  (90th percentile 11, up to 15).
- The image-plane elbow angle keeps folding the whole time (down to 10 to 20 degrees in
  projection), while the 3D angle opens.

So it is a depth (z) error in the world landmarks. It appears when the hand rises in front
of the upper arm at the 45 degree placement. A filter cannot remove it: it lasts 0.3 to 1 s,
not a frame or two.

Worked example: the 12:28 UTC workout, set 1, attempt #8, frames 1205 to 1340 (left arm).
The 3D elbow angle falls to 59 at frame 1238, then sits at 70 to 79 from frame 1241 to
1292 and falls back to 51 at 1304. Over the same frames, the image elbow-to-shoulder offset
stays at 2 to 5 px across and 79 to 85 px down. The world elbow-to-shoulder z goes from
-0.3 to -15.2 cm, and the image elbow angle goes from 32 to 10 degrees.

Size, over the 87 attempts that reached 60 degrees or below in all 8 sets: the rise above
the rep's running low is 18 degrees at the median, 24 at the 75th percentile, 30 at the
90th, and 75 of the 87 rise 10 or more.

## The three problems it causes

1. **Rep splitting (counting).** Inflection exits to Eccentric once the angle is above
   `thr_inflection + hysteresis_buffer` = 55 + 15 = 70 (3 frames after entering
   Inflection, then a single frame is enough). The next dip to 55 or below for 3
   consecutive frames banks a re-descend rep. One real rep becomes two attempts. The first
   half then fails `partial_curl` by construction: rep stats only accumulate from
   `rep_started`, which fires below 140, so its `max_elbow` can never reach 145. The
   second half opens at the top and gets the real lowering. Example: 12:28 set 2,
   attempts #6 and #7 (max 135, then a correct rep).
2. **The angle at the top reads too open.** During the bump the 3D angle says the arm is
   less bent than it is. `min_elbow` is the lowest frame, so it survives a bump with a
   good low on either side. It is not yet known how far the lows themselves are off
   (see the Vicon plan below).
3. **`elbow_flare` reads the same error (minor).** It uses the 3D shoulder angle
   (elbow-shoulder-hip). The elbow's false 6 to 15 cm of depth travel pushes it up at the
   top: the highest shoulder angle at the top is 30 at the median and 43 at the 90th
   percentile, against a limit of 45 (2 attempts over).

## One candidate for problem 1, not accepted

Replaying all 8 recordings through the web engine (`createEngine(row,
"dumbbell_biceps_curls", { placement: false, ready: false, armed: true })`, which
reproduces every saved total) with only `hysteresis_buffer` changed. A split is a
`rep_started` within 4 frames of a `rep_completed`.

| `hysteresis_buffer` | exit at | split reps | correct | attempts | partial_curl |
|---|---|---|---|---|---|
| 15 (today) | 70 | 13 | 64 | 114 | 44 |
| 25 | 80 | 1 | 69 | 101 | 30 |
| 30 | 85 | 0 | 69 | 100 | 29 |
| 35, 45 | 90, 100 | 0 | 69 | 100 | 29 |

A real lowering always passes 85 on its way to 155, so normal reps count the same. Side
effects: lowering only to about 80 and curling again no longer banks a rep, and after a
re-descend bank the `_rearm_exempt` window widens from 70 to 85 (abandoned attempts went
35 to 29 in the replay, not up). Vern has not accepted this; it treats the symptom, and a
fix for problem 2 may remove the bump at its source.

## Candidates for problems 2 and 3, to score against Vicon

Ground truth exists: LabMoCap, 6 curl trials (`20260713-kavee-curl-00..02`,
`20260713-boom-curl-00..02`) with Vicon 3D and the FrontView, 45SideView, and
90RightSideView videos. The existing number is the whole-curl elbow MAE, 16.97 degrees
with bias +1.71 for mediapipe_3d (`ref_doc/reports/task_a_v2/per_exercise_accuracy.md`).
It says nothing about the top of the curl.

1. **Measure first.** Run MediaPipe on the 45SideView curl videos and compare the elbow
   and shoulder angles to Vicon frame by frame, at the top of each rep. Does Vicon show
   any bump? How far off are MediaPipe's lows?
2. **Bone-length depth correction.** Image x and y stayed accurate here; only z drifted.
   Take each segment's 3D length (upper arm, forearm) from frames where the arm hangs
   straight. On every frame, take the segment's image length scaled to metres (for
   example by the shoulder-to-hip length), and solve depth as `sqrt(L^2 - l^2)` with the
   sign taken from MediaPipe's z. This corrects the elbow angle (problem 2) and the
   shoulder angle (problem 3) together, since both read the elbow's position. Watch: the
   sign when the segment is near the image plane, and the scale factor.
3. **A 90 degree camera with the working arm nearest.** The placement report chose 45 over
   90 for the curl because a 90 degree view puts the working arm on the far side half the
   time. Since 2026-10-04 the user chooses the arm and `PlacementGuide(near_side=)` keeps
   it toward the camera, so that objection is gone. In profile the curl folds in the image
   plane and depth matters less. Score it on the 90RightSideView trials whose working arm
   is the right one.

Whichever wins on Vicon replaces any temporary fix for problem 1.

## The data

`scratch_output/web_app_curl_2026-10-04/` (git ignored): per set the keypoint file
(`<set_id>.json.gz`, the web app's format: per frame `t`, `state`, `event`, and 33 joints
of `x y z x_3d y_3d z_3d score`; image x and y normalised to the frame) and the video
(`<set_id>.webm`), plus `sets.json` with every set's totals, attempt records, and engine
report verbatim. The local web database copy is gone after any `db:reset`. Times are UTC.

| Workout | Set | Set id | Correct of attempts | Arm (engine) |
|---|---|---|---|---|
| 12:28 | 1 initial | `bd848d5a-1a55-4373-9d74-9049c795d709` | 5 of 20 | left |
| 12:28 | 2 initial | `6a4211c8-d8c2-449b-b2b5-8a7de5173afb` | 8 of 20 | right |
| 12:45 | 1 initial | `0055afa8-3c9b-4781-8b65-9b8a5aa05581` | 4 of 11 | 10 left, 1 right |
| 12:45 | 1 repair | `0b26f0cc-f43a-4ad6-90aa-a521b694b2f6` | 7 of 13 | right |
| 12:45 | 2 initial | `9688b5fa-e2bd-49ee-bba1-7e5094a1c4a0` | 10 of 12 | right |
| 12:45 | 2 repair | `def3405c-e4ff-4d9e-926e-123d4d2e964a` | 10 of 14 | left |
| 12:45 | 3 initial | `53e80918-5186-4799-ae8f-0a1b786737f9` | 10 of 13 | right |
| 12:45 | 3 repair | `ae855ecb-0d75-4645-90f9-f6c97cbff9a8` | 10 of 11 | left |

These were recorded before the chosen arm existed (engine `2695984`), so the arm was picked
per attempt.

## How to reproduce

- **Angles.** Rebuild each frame's joints from the flat row (`fields` times `joints`), then
  call the engine's own angle function: `extractAngles` in the web app's
  `lib/engine/angles.ts` (3D world), or `read_keypoints` in
  `scratch/eval/eval_web_parity.py` followed by the Python angle extraction.
- **The arm.** Take each attempt's side from `engine_report` (`reps` and
  `abandoned_attempts`, each with `active_side`), matched to the attempt record on
  identical `rep_stats.min_elbow` and `max_elbow`. Do not guess it from the more-bent elbow
  at `rep_started`: that picked the wrong arm on 20 of 114 attempts, because the resting
  arm hangs at about 140.
- **Replay.** Python: `ExerciseFrameProcessor("dumbbell_biceps_curls", ready_gate=False,
  placement_gate=False)`, `session.fsm.force_arm()`, then `process` per frame with
  `timestamp_ms=t`. Web: `createEngine(row, "dumbbell_biceps_curls", { placement: false,
  ready: false, armed: true })` with the row from the latest `rule_logic_*` migration, then
  `process(kp, t)` per frame. Both reproduce the saved totals.
- **2D comparison.** Image x and y are normalised separately to width and height. The
  numbers above assume a 16:9 frame (x times 16/9) for the image-plane angle.

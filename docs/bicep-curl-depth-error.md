# Bicep curl: MediaPipe's depth error at the top of the curl

Found 2026-10-04 by plotting two web app curl workouts (Vern). A copy lives in the web app at
`docs/bicep-curl-depth-error.md`; this one is the one to work from, since the fix lands in
the Python first.

**Status (2026-10-04, later the same day):**
- **Problem 1 (rep splitting): FIXED.** Curl `HYSTERESIS_BUFFER` 15 -> 30, so the FSM leaves the
  bottom above 85, not 70. See "Measured 2026-10-04" below.
- **Problems 2 and 3: FIXED 2026-10-05 by the elbow rebuild, now the default** (V4,
  `CurlArmRebuild`; count bar 55 -> 38, then 40 the same day, a round number). Remaining caution: a forearm pointing straight at the
  camera can read as a full bend. History of the search below.
- (2026-10-04 status, superseded:) **Problems 2 and 3 (the top reads too open, `elbow_flare` nudged up): OPEN.**
  `RULES_AND_FSM.md` open item 22. Vicon measurement done; a 90 degree camera dropped; the depth
  rebuild parked; a closer camera tilted up was filmed and is much worse (tops 82-98).
- The web app's copy of this file is not updated yet; do it in the web app session that ports the
  hysteresis change.

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

## The candidate for problem 1: ACCEPTED 2026-10-04 (hysteresis 30)

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
35 to 29 in the replay, not up). Vern accepted `hysteresis_buffer` 30 on 2026-10-04 (the first
version of this file left it open). It treats the symptom, and a fix for problem 2 may still remove
the bump at its source.

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

Results of items 1 to 3 (run 2026-10-04): see "Measured 2026-10-04" below. Item 3 is dropped, item 2
is parked, and no candidate has replaced hysteresis 30 yet.

## Measured 2026-10-04 (read-only, nothing written)

Setup: LabMoCap, the 6 curl trials, right arm, MediaPipe full (`models/mediapipe_pose_full.task`,
the same model the web app loads) run on the iPad videos, against Vicon. Per Vicon top window
(elbow under 100 degrees for 5+ frames): the lowest value, and the "jump", the largest rise above the
running low inside the window. Frames where MediaPipe's 2D wrist or elbow is more than 5% of the
frame height from the projected Vicon point (a bystander) are dropped. A rebuilt angle takes each
segment's length in the image from the frames where MediaPipe's own 3D elbow reads over 140, and
the depth sign from MediaPipe's z.

| View | Vicon low | MediaPipe 3D low | MediaPipe 2D low (Vicon projected to 2D) | Rebuild low | Error on top frames, 3D / rebuild |
|---|---|---|---|---|---|
| 45SideView | 31.9 | 74.1 | 20.4 (16.9) | 30.3 | 33.9 / 9.9 |
| 90RightSideView | 31.9 | 75.3 | 38.5 (32.3) | 61.5 | 39.2 / 28.9 |

1. **Vicon shows no jump on any trial** (0.0 on all 12 view-trial rows): the jump is MediaPipe's
   error, not the movement.
2. **MediaPipe's image keypoints are right at the top**: its 2D angle is within 1 to 6 degrees of
   the projected Vicon angle at both views. Its world landmarks under-fold: 21 to 48 degrees at 45
   and about 40 at 90. The shoulder angle (problem 3) reads 6 to 12 degrees above Vicon at the top
   at 45 (exam `good_right` peaked at 44 against the 45 bar).
3. **A 90 degree camera does not help** (candidate 3 below): the 3D top reads no better there (75
   vs 74), even though the curl folds in the image plane. Dropped.
4. **The depth rebuild (candidate 2)** works on the lab videos at 45 (30.3 vs 31.9, error 9.9) but
   fails at 90, where the segments lie near the image plane and `sqrt(L^2 - l^2)` swings widely. On
   the 8 web app sets it is not stable: lows read 14 to 35, the 90th percentile jump barely moves
   (27 -> 25) and one set got worse; the FSM running on it still split 3 reps. Parked, see
   `RULES_AND_FSM.md` item 22.
5. **How big is the capture dependence (problem 2):** at a full top, Vern reads 35-47 on the
   webcam but 60-64 on the lab iPad at 45, and boom reads 74-79 on the iPad. So the 55 count bar
   holds for one subject on one camera; a user like boom on that camera would never count a rep.

Webcam recordings (no ground truth):

6. **Exam files (Python demo, 45 deg):** full curls top out at 35 to 47 and partial-top curls at 59
   to 76, so the 55 bar separates them and does not move. The jump is present here too (median
   12 to 17 on the good files), but it starts from deeper lows, so its peak stays under 70 and
   the exam did not split.
7. **Web app sets (8 sets, 102 tops):** median jump 10, 90th percentile 27. The highest peak between
   two dips (both at 55 or below) is **81.3**; the exit at 70 is passed by 11 tops, 75 by 6, 80 by
   1, 85 by none. Jump size did not depend on body yaw in 30 to 54 degrees.

The fix for problem 1: hysteresis 30, exit 85. Replay, all 20 recorded curl sessions: no rep
count changes; 17 identical and 3 lose one false `partial_curl`. Exam: every cell identical. Web
app sets: splits 13 -> 0, attempts 114 -> 100, correct 64 -> 69, `partial_curl` 44 -> 29 (hysteresis
35 gives the same). Test:
`tests/test_digital_ergonomist.py::test_bicep_fsm_depth_error_bump_at_the_top_does_not_split_the_rep`.

Worked example (12:28 set 2, attempts 6 and 7, right arm, 60 fps): frame 1162 the curl reaches 55
(Inflection, low 50); 1203 the jump reads 73, above the old 70 exit, so the FSM goes to Eccentric;
1230 the angle is back to 53 and attempt 6 banks with max 135, so a correct curl gets "Full range
of motion"; attempt 7 opens at depth and completes at 155. With the exit at 85 the 73 to 78 jump
stays in Inflection, the real lowering crosses 85 near frame 1278, and one rep closes at 1343.

## Next

### The closer-camera test (Vern's idea, 2026-10-04): FILMED AND SCORED, Close fails

Question: does a closer webcam, the picture from head to hips, with the camera lower and tilted
slightly up, shrink the jump? (On the lab iPad, which stood farther away, a full top read 60-64 for
Vern; on the webcam it reads 35-47, so distance may matter.)

Film in one sitting, right arm, turned half left so the right arm faces the camera. Record without
`--placement` (it rejects a half-body picture) and without `--ready-stand`. One new name per take
(re-running a name overwrites it), never move or rename a file while it records, `q` stops a take.
The hips must stay in the picture: `elbow_flare` and MediaPipe's hip-centred 3D both need them.

- **Normal** = the whole body in the picture, as at the exam. **Close** = the picture from head to
  hips, camera lower and tilted slightly up.
- Alternate the takes, because the jump drifts between sittings (the web app's 12:28 sets had a
  median jump of 21-27, the 12:45 sets 6-11): Normal 1, Close 1, Normal 2, Close 2, then Close
  partial top (10 curls stopped well short of the top).
- Names: `live_curl_cam_normal_good_right_1`, `live_curl_cam_close_good_right_1`,
  `live_curl_cam_normal_good_right_2`, `live_curl_cam_close_good_right_2`,
  `live_curl_cam_close_partial_top_right`. Command, with `NAME` replaced:

```bash
.venv/bin/python3 -m scratch.demo.demo_realtime_pipeline --source 0 --exercise dumbbell_biceps_curls --json scratch_output/live_tuning/NAME.json --raw-output scratch_output/live_tuning/NAME_raw.mp4
```

Score (read-only replay, the same jump measurement as "Measured 2026-10-04"). First check each take
is valid, since nothing enforces placement while filming:
- turn angle: `body_yaw_from_keypoints` (the placement guide's own measure) inside the curl band,
  +33 to +57 for the right arm (two of the 12:45 web sets sat at 65 and 79);
- on the Close takes: the share of low-confidence frames, how often a hip scores under 0.3, and the
  frames `elbow_flare` gives no verdict on (a silent rule must not look like a smaller flare).

Then per take: counted reps and splits at exit 70 and 85; each curl's top reading; the jump (median,
90th percentile, worst peak between two dips); the `elbow_flare` peak with its no-verdict count.

**Close wins only if all three hold:** both Close takes have a smaller median jump than both Normal
takes; Close has more `elbow_flare` headroom on good curls; the 55 line still separates them (good
tops at or below 55, partial tops above 55). If it wins, the placement guide needs a curl framing
(head to hips, its own distance band; `framing_check` demands feet and height 0.45-0.95 today) and a
web port; the guide cannot check camera tilt, so one more take, close but level, would show which
change did the work. Otherwise hysteresis 30 stays the fix.

**Result (filmed 2026-10-04, `scratch_output/live_tuning/live_curl_cam_*`, scored with the arm fixed
to the one that curled, as the web app does):**

| Take | Arm | Turn (yaw) | Curl tops (3D elbow) | Counted | `elbow_flare` peak per curl |
|---|---|---|---|---|---|
| normal_2 | right | +44 (in band) | 42-58 | 9 of 10 (first top 58) | 21-35, fired 0/11 |
| normal_1 | left | -31 (just outside) | 67-89 | 0 | 37-39 (one 58) |
| close_1 | right | +31 | 94-98 | 0 | 58-62, fired 10/12 |
| close_2 | left | -31 | 82-91 | 0 | 51-55, fired 10/11 |
| close_partial_top | right | +35 | only 2 cycles seen | 0 | - |

- **Close is much worse.** With the camera low and tilted up, a full curl (fist at the mouth) reads
  82-98 at the top, so not one of about 21 good curls reached the 55 count bar, and `elbow_flare`
  fired on almost every good curl. Its jump is smaller only because the angle never folds. All three
  win conditions fail; the setup stays as it is, and hysteresis 30 stays the fix.
- Same sitting, same arm: right arm Normal 42-58 vs Close 94-98.
- Protocol deviations: takes 1 and 4 used the LEFT arm with the body turned the other way, so only
  one valid Normal right-arm take exists; the partial-top take is not judgeable.
- Found while scoring: the demo picks the arm per attempt, and in normal_2 a dip of the hidden left
  arm (132) opened an attempt 4 s in. That arm then read about 140 at low confidence for 28 s, never
  straight and never bent, so the live session counted 0 of 9 real right-arm curls. The web app is
  safe (the user chooses the arm, `forced_side`); the Python demo has no `--side` flag.

**Re-filmed with `--side right` (v2 takes, same evening): Close fails again, and the Normal tops
sit on the count bar.**

| Take | Turn (yaw) | Curl tops (3D elbow) | Counted, live = replay | `elbow_flare` on good curls |
|---|---|---|---|---|
| normal 1 v2 | +42 | 45-65 | 5 of 10 | 0/10 (peaks 29-39) |
| normal 2 v2 | +42 | 53-61 | 2 of 10 | 0/10 (peaks 31-36) |
| close 1 v2 | +30 | 94-98 | 0 of 10 | 10/10 (peaks 50-69) |
| close 2 v2 | +27 | 93-103 | 0 of 10 | 10/10 (peaks 50-57) |
| close partial top v2 | +27 | 100-105 | 0 of 10 | 7/10 |

- **Close is dropped.** Good and partial-top curls read the same (93-103 vs 100-105), so no count bar
  can separate them, and the flare warning fires on every good curl.
- **The counter fix shows live:** normal 1 v2 at the old exit 70 splits twice (2 false
  `partial_curl`); at 85, none.
- **Problem 2 now costs real reps in the normal setup.** Video frames show full curls (fist at the
  shoulder) at readings 45 and 61 alike, yet 13 of 20 good curls topped out at 56-65, above the 55
  bar, and were abandoned. Earlier sittings read lower for the same curl (exam 2026-09-27: 35-47;
  normal 2 v1: 42-58). The exam's partial-top curls read 59-76, so today's full curls and the
  exam's partial ones overlap in 55-65: no single bar separates them across sittings.

### Depth rebuild, Phase 2 result (2026-10-04, `scratch.eval.eval_curl_depth_rebuild`)

MediaPipe re-run (VIDEO mode, each frame at its recorded timestamp) on the 8 exam curl videos,
tonight's 6 webcam takes and the 12 LabMoCap curl videos, cached in `scratch_output/rebuild_rerun/`.
Variants: V0 raw 3D; V3 the depth rebuild (bone-length forearm depth, upper-arm MediaPipe depth
clipped to the bone bound, blended in by the raw angle: rebuilt at 110 or less, raw at 130 or more);
V2D the plain image (2D) elbow angle with the same blend (no depth at all).

| Gate | V0 raw 3D | V3 depth rebuild | V2D image angle |
|---|---|---|---|
| G1 Vicon 45SideView: top-frame error / median per-rep low error | 33.9 / +30.6 | **9.6 / -3.4** | 15.6 / -12.6 (2D reads foreshortened) |
| G2 jump, 90th percentile: labelled takes / web sets | 20.7 / 32.8 | 10.9 / 19.3 | **0.7 / 2.1** |
| G3 one bar for every labelled sitting (full max vs partial-top min) | 63 vs 60: fail | 53 vs 45: fail | **28 vs 42: PASS, bar 35** |
| G4 bottom untouched | - | yes | yes |

- **The depth rebuild is closer to the true angle but not consistent between sittings.** At the
  top the upper arm shows only 77-92% of its length, so its depth is large, and MediaPipe's sign for
  it flips between reps: `normal_good_right_2` reads 31-53 rebuilt while `normal_good_right_2_v2`,
  minutes later, reads 32-38. Shoulder angle bias vs Vicon: +9.0 -> -4.2. The close camera's full
  curls go from 97 raw to 44-49.
- **The image angle separates full from partial curls in every sitting**: full tops 13-28 (exam,
  earlier tonight, v2), partial tops 42-64, with no jump. Its numbers are foreshortened (a full
  curl reads about 20, not the true 32), so expert degrees do not apply to it directly, and it was
  tested only at a turn of 38-50 inside the band, on one subject. At the lab's 45 deg camera some
  full tops collapse toward 0 in 2D (forearm in front of the upper arm in the picture).
- One partial-top cycle at the end of `live_curl_exam_partial_top_left` is Vern walking to the
  keyboard (checked on the frame); cycles where the torso looks 1.3x bigger than usual are skipped.

### Depth rebuild, fix attempt (2026-10-04 late, Vern chose "fix the depth rebuild first")

- **The toward/away direction is NOT the problem.** At the top, in LabMoCap camera coordinates (via
  `calibration/45SideView__<subject>.json`), MediaPipe gets the upper-arm direction right 100% and
  the forearm 87%. With the true directions plugged in the rebuild is no better (error 10.1 vs 10.0).
- **The geometry was backwards.** At the top the UPPER arm tilts toward the camera (median 38% of its
  length in depth, the elbow comes forward) and the FOREARM lies almost flat in the picture (14%).
  V3 gave the forearm too much depth.
- **V4 = upper arm as in V2 (MediaPipe depth clipped to the bone bound), forearm kept flat**, blended
  in by the raw angle. Passes all four gates:

| | V0 raw | V4 |
|---|---|---|
| Vicon 45SideView, real curls, per-rep low error (median, 10..90%) | boom +44 (+42..+48), kavee +29 (+22..+33) | boom -8 (-11..-4), kavee -1 (-5..+2) |
| Vicon 90RightSideView top error | 39.2 | 7.3 |
| jump, 90th percentile, labelled / web sets | 20.7 / 32.8 | 2.0 / 3.6 |
| one bar for every labelled sitting | fail | full 14-31 vs partial 44-64: PASS, bar 38 |
| close camera, full vs partial top | 92-102 vs 100-105 | 16-50 vs 39-68 (median 29-34 vs 58) |

- Shoulder angle (`elbow_flare`) with the same elbow: bias vs Vicon +9.0 -> -4.2; exam good peaks
  max 36 (raw 44, bar 45); flare files median 73-76.
- **Caution, not a curl:** the first ~5 s of every lab trial hold both arms bent toward the camera
  (Vicon 60-98). There even Vicon's projected 2D reads near 0, and V4 reads 1-60, i.e. a fully bent
  arm. A forearm pointing straight at the camera can read as a full curl. Within a curl at the
  placement band it did not happen, but a phantom count from such a pose must be checked (Phase 4).
- Tried and dropped: forearm depth from its sideways shift in the picture ("planar", k 0.7 or 1.0):
  worse on the webcam (gaps -0.2..+17 with jumps 7-15).
- **Next:** Vern decides whether to ship V4 (Phase 3 of the plan: `CurlArmRebuild` in
  `exercise_session.py`, count bar ~38 for `BicepCurlFSM.THR_INFLECTION` and `BICEP_FLEX_TARGET`
  together; this lifts the measurement freeze for the curl's elbow and shoulder angles).

**Try it live (opt-in, 2026-10-04):** demo `--curl-angle rebuild` (V4, count bar 38) or `picture`
(V2D, bar 35); default raw is unchanged. Checked on recorded takes: tonight's normal_2_v2 goes from
0 to 10 counted (tops 21-26), the exam partial-top right stays at 0 (tops 43-64), exam good left
9 -> 10, plus one extra at the end (walking to the keyboard reads as a full bend, the caution
above). Test: `tests/test_exercise_session.py::test_curl_arm_rebuild_ignores_mediapipe_false_elbow_depth`.

**Tried live 2026-10-04 (Vern, webcam, right arm, `--curl-angle rebuild`, bar 38; files in
`scratch_output/curl_rebuild_try/`, outside the replay folders):**

| Take | What was done | Top reading (rebuilt) | Counted |
|---|---|---|---|
| `try_rebuild_good_right_1` | 11 full curls | 22-32 | 11 of 11, all correct (one setup attempt rejected, not a curl) |
| `try_rebuild_partial_top_right` | 10 curls stopped at chest height, lowered fully (151-155) | 51-80 | 0 (all 10 rejected) |
| `try_rebuild_half_bend_right` | 14 slow bends to a right angle, forward and pointing at the camera | 51-117 | 0 |

- Full and partial tops are 19 degrees apart on the same evening (32 vs 51); against the exam's
  partial tops re-run offline (from 43) the margin is 5. The forearm-at-the-camera weak spot did not
  trigger (lowest half bend 51).
- A first partial-top attempt was a top-half set (full curl, lowered only to 100-119): counted and
  flagged `partial_curl` 9/10, which is right for that movement.
- **Next:** Vern decides whether the rebuild becomes the curl's reading (plan Phase 3: default on,
  bar 38 for `BicepCurlFSM.THR_INFLECTION` and `BICEP_FLEX_TARGET` together, docs, then the web port).

### The depth rebuild (only if wanted)

It needs the demo logger to store image x and y, a stable rebuild on webcam data scored against
Vicon, a new count bar for the FSM and `partial_curl` together, and a TypeScript port. It changes
what the curl measures, so ask Vern first.

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

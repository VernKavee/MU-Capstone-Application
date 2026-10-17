---
status: accepted
---

# Rule engine runs client-side in TypeScript behind the research repo's contract

NFR1 requires angle math and rule checking on the user's device with no per-frame server round trip, which rules out keeping the research repo's Python engine on a server. The engine will be a TypeScript port of the research repo's portable core, ported by Vern after the Python settles and outside the phases of this build. Until then the app runs a stub. The seam between app and engine is the research repo's contract, mirrored verbatim, so the port drops in without touching the app.

## The seam

Input per frame: the research repo's 33-entry keypoints dict, one entry per MediaPipe landmark name, each with `x`, `y`, `z` (image-normalised), `x_3d`, `y_3d`, `z_3d` (world metres), and `score`, which is MediaPipe's visibility. The app's MediaPipe adapter produces exactly this from the Tasks Vision pose landmarker; the research repo's `src/frame_processing/mediapipe_hpe.py` is the reference.

`process(keypoints, timestampMs)` returns the `FrameResult` of `src/pipeline/frame_processor.py`: `rep_count`, `correct_rep_count`, `attempt_count`, `state`, `event`, `warning` (zero or one message), `warnings_all`, `warning_display`, `warning_display_rules`, `low_confidence`, `armed`, `ready_phase`, `ready_pose`, `countdown_s`, `placement_phase`, `placement_ok`, `placement_cues`, `body_yaw_deg`, `target_yaw_deg`, `distance_state`, `filter_active`, `angles`, `keypoints`.

`getSessionReport()` returns the schema version 4 report of `src/pipeline/session_report.py`: totals for attempts, completed reps, correct reps, and abandoned attempts, plus the `reps` and `abandoned_attempts` lists with their `rep_stats`.

`reset()` clears everything for the next set.

The UI reads counters, states, and warnings from the frame result and never re-derives them. The ready gate (held T or A pose, then a three-second countdown) and the placement guide are part of the core and come with the port. Vern expects the gate logic to change, and that change stays inside the seam.

## Considered options

- **Pyodide, the Python core in the browser.** One code path, byte-identical to what was validated against the motion-capture data. Rejected: roughly 6 MB of runtime plus numpy on first load, several seconds of startup, a Web Worker and a wheel build, and the data-driven configuration of ADR-0006 would need the Python refactored to accept injected config.
- **Python on a server over a WebSocket.** Rejected by NFR1.

## Consequences

- The port is about 4,100 lines of Python across 18 files, numpy geometry included. It is real work and it is not scheduled inside these phases.
- Exercises carry an engine key (`squat`, `pushup`, `lunge`, `dumbbell_biceps_curls`) matching the research repo's registry.
- Thresholds, messages, priorities, state names, and highlight joints will be exported from the Python into the exercises seed by a script, so the numbers have one source. Until the port, the seed is typed from the Python by hand and marked as such.
- A parity harness that replays a recorded keypoint stream through both engines needs recordings with raw landmarks per frame. The research repo's live recordings hold angles and joint scores but not landmarks; adding that dump is a request to the research repo.
- The browser runs MediaPipe's full pose model everywhere, the variant the thresholds were calibrated on. Lite is offered as a manual fallback for a phone that cannot hold fifteen frames per second.

## As built in Phase 6

- The live screen builds a new engine for every set, for every "Try again" after a camera or model failure, and when the pose model is switched; the frame loop calls `reset()` once the camera and the model are up. The port's construction must be cheap and must not fetch anything.
- The workout end-to-end test gets its attempts from the stub's clock while Chrome's fake camera shows a still T pose. The port produces no attempts from a still frame, so that test will need a recorded clip of real reps as its camera.
- `docs/HANDOVER.md` lists what the app reads from each frame result beyond the types, and what the stub returns today.

## Decided 2026-10-04: the port

The port follows the research repo's `docs/rule_based/WEB_APP_PORT.md`, made from SeniorProject `2695984`.

- The research repo's live recordings have logged `kp3d`, the 3D world landmarks with their scores for 16 joints, since 2026-07-24, and the ankle since 2026-09-19. The consequence above that they hold no landmarks is outdated: the parity harness replays them.
- The seed is replaced by the export of `scratch/export_web_logic.py` in the migration `rule_logic_2695984`. Every row's `source` names the commit, and `ENGINE_VERSION` equals it.
- The row gains `state_machine.confidence_joints` (the joints the low-confidence guard needs on one side) and `placement` (`yaw_center`, `yaw_tol`, in the engine's units, not camera degrees). Numbers that define a measurement stay constants in the TypeScript engine; only the bars Vern tunes are in the row.
- The ready gate runs before placement: a T or A pose held facing the camera starts the countdown, placement is checked during it, and the countdown holds at 0 until the user is placed. A T pose held 30 frames, after 3 s of the set, ends it. Since 2026-10-10 the pose counts only once the user is framed (below).
- `RepRecord` and `AbandonedRecord` carry `active_side`, as the Python emits it, since the report is stored verbatim.

## Decided 2026-10-04 (later): the user chooses the curl arm

Made in SeniorProject `32168a5` and ported here, at Vern's request: per-attempt arm detection held on the recordings but leans on the resting arm staying still.

- `createEngine(logic, engineKey, { side })` takes the arm the user chose, `"left"`, `"right"`, or null (the default, today's per-attempt pick). It sets `BicepCurlFsm`'s `forcedSide` (only that arm can open an attempt, and the active side never leaves it) and the placement guide's near side.
- The near side makes the facing band one-sided: positive yaw is the left side turned away, so the left arm is the negative band (-45) and the right arm the positive one (+45). The turn cue points that way from the first frame. This overrides the research placement report's choice not to bake in a side, which hedged against the working arm landing on the far side.
- A side for a machine that does not choose one throws (`BaseFSM.CHOOSES_SIDE`, `choosesSide` here).
- Parity: the fixtures are regenerated at `32168a5`, and `dumbbell_biceps_curls_left.json.gz` replays the curl window with the side forced. All 25 exam recordings still match.
- Found alongside, not fixed: MediaPipe's depth error at the top of the curl at 45 degrees, which splits reps and opens the elbow angle. `docs/bicep-curl-depth-error.md`.

## Decided 2026-10-05: the curl elbow rebuild and the frame size

Made in SeniorProject `858b203` (WEB_APP_PORT.md section 9b) and ported here, at Vern's request.

- `process(keypoints, timestampMs, frameSize?)`: the seam gains an optional third argument, `[width, height]` in pixels of the video MediaPipe saw. The live loop passes `videoWidth` and `videoHeight` every frame (Vern: per frame rather than at construction, since the engine is built before the camera opens). Callers that pass nothing are unchanged.
- `CurlArmRebuild` in `lib/engine/angles.ts`, built for the curl's engine key only, runs after the angles and before the session, as in the Python's `ExerciseFrameProcessor`. Near the top of the curl it re-reads the elbow and shoulder angles from the image x, y, with the upper arm's depth clipped to what its straight-arm image length allows. Without a frame size the raw angle is judged, as in the Python. One addition the Python lacks: a new frame size starts its calibration over, since that is in pixels.
- The bars move with it, from the export `rule_logic_858b203`: curl `thr_inflection` and `partial_curl.flex_target` 55 -> 40, `hysteresis_buffer` 30.
- The push-up floor bar moved beside it into `angles.ts` (Vern), no behaviour change.
- Parity: the fixtures are regenerated at `858b203`; the curl ones carry image x, y and `frame_size`, and fail if the frame size is withheld. All 25 exam recordings match.
- The keypoint file the app saves does not carry the frame size yet (see ADR-0007, 2026-10-05).

## Decided 2026-10-10: the stand check before the T pose

Made in SeniorProject `9a377cd` and ported here, at Vern's request after the first phone run: he held the T pose too far back, the countdown then waited at 0 on "Move closer to the camera", and when he came forward and turned the set started unnoticed, so his second T pose ended it.

- While the ready gate waits, placement runs `standCheck`: framing, distance (45% to 95% of the frame's height), and centring, never facing, with nothing held or latched. The ready pose counts only while it passes; a frame that fails resets the 8-frame hold. `ReadyPoseGate.update` gains `framed`, true when placement is off.
- The frame reports the stand check's cues while waiting, so the live screen shows "Move closer to the camera" and the like in place of the T-pose text, and the loop speaks them. The countdown's hold at 0 is left for the turn.
- Migration `rule_logic_9a377cd`: the export, equal to `858b203`'s but for the source, plus guide step 1 rewritten. `ENGINE_VERSION` is `9a377cd`.
- Parity runs with both gates off, so the goldens are unchanged; the fixtures are rewritten for the new source. All 25 exam recordings match. The gate order is tested in `gates.test.ts`, beside the Python's tests.

## Decided 2026-10-17: push-up body alignment reads the trusted side

Made in SeniorProject `5eccc55` and ported here (Vern). `hip_sag_or_pike` and the stored
`min_body_alignment` use the shoulder-hip-ankle angle of the side whose shoulder, hip, and ankle
score best (the lowest of the three decides a side, a tie goes to left), not the mean of both:
the hidden far ankle at 45 degrees is guessed 8 to 10 degrees low and pulled the mean onto the
bar. Without keypoints both sides are averaged. The bar stays 160. Migration
`rule_logic_5eccc55` (source only), `ENGINE_VERSION` `5eccc55`, goldens regenerated.

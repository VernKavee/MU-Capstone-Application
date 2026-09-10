# Exercise posture coach

The web app for the Mahidol capstone "Exercise Posture Checking and Accurate Guidance using Artificial Intelligence". A user does one of four bodyweight exercises in front of a camera; the app counts correct reps and corrects form live, then scores the motion and writes coaching feedback. This file is the vocabulary. Decisions live in `docs/adr/`.

## Language

### Exercises and rules

**Exercise**:
One of the four movements the app coaches: Squat, Push-up, Lunge, Bicep curl. Defined by a row of configuration, never by code that names it.
_Avoid_: workout type, movement type

**Engine key**:
The research repo's registry name for an exercise, which selects its state machine and rule set: `squat`, `pushup`, `lunge`, `dumbbell_biceps_curls`.
_Avoid_: exercise id (that is the database key)

**Check**:
A named, registered computation over angles or landmarks, such as the minimum joint angle over a rep or the trunk tilt in 3D. Adding a check is code; using one is data.
_Avoid_: primitive, validator

**Rule**:
An exercise's configured use of a check: threshold, warning text, priority, scope (per frame or per rep), and debounce. Rules are data.
_Avoid_: constraint, criterion

**Violation**:
A rule found broken on one attempt. Every violation is recorded, shown or not.
_Avoid_: error, fault, mistake

**Warning**:
The single message shown to the user at one moment: the highest-priority violation live. Show one, record all.
_Avoid_: alert, notification, correction message

**Priority**:
The rank that decides which violation becomes the warning when several fire at once. Lower number wins.

**Highlight joints**:
The landmarks the skeleton overlay emphasises while a rule's warning is showing.

### Workouts and sets

**Workout**:
One time a user chose an exercise, a rep target, a set count, and a rest length, and started. Owns its sets.
_Avoid_: session, training, exercise session

**Set**:
One continuous stretch of attempts at the rep target, with its own video, keypoint file, engine report, similarity, and feedback. The unit the report calls a session.
_Avoid_: session, round, run

**Repair set**:
The one extra set offered right after a set in which any attempt had a violation. Same target, recorded as a set of kind repair, can be declined.
_Avoid_: repair round, retry, redo

**Target**:
The number of correct reps a set is trying to reach.
_Avoid_: goal

**Rest**:
The timed pause between sets, chosen on the setup screen, default sixty seconds.

**Ended by**:
Why a set stopped: the target was reached, the user pressed end set, or the attempt cap was hit.

**Attempt cap**:
The number of attempts after which a set ends on its own, default twice the target.

### Attempts and counting

**Attempt**:
Any movement the state machine opened. Every attempt has an outcome and a record.
_Avoid_: rep (an attempt may not be a rep), try

**Completed rep**:
An attempt that reached the exercise's depth and returned to the start.

**Correct rep**:
A completed rep with no violations. The only thing the counter counts.

**Abandoned attempt**:
An attempt that started but never reached depth. Not counted, still recorded with its violations.
_Avoid_: aborted rep, failed rep, incomplete rep

**Outcome**:
What an attempt was: correct, incorrect (completed with violations), or abandoned.
_Avoid_: status

**Counter**:
The number shown live and compared to the target: correct reps. Attempts are shown beside it, never in its place.
_Avoid_: rep count, score

### The engine

**Engine**:
The on-device rule engine: angle extraction, state machine, rules, ready gate, and placement guide. A port of the research repo's core; a stub until the port lands.
_Avoid_: rule-based system, pipeline, backend

**Engine state**:
Where the state machine is: Idle, Concentric (moving toward depth), Inflection (at depth), Eccentric (returning).
_Avoid_: descending, bottom, ascending, phase

**Frame result**:
What the engine returns for one frame: counters, engine state, rep event, the warning, every violation on that frame, and the gate states.

**Engine report**:
The research repo's session report, schema version 4, emitted at the end of a set and stored verbatim on the set.
_Avoid_: session report, summary

**Ready gate**:
The engine step that waits for a held T or A pose, runs the countdown, then lets attempts open.
_Avoid_: arming, start gate

**Placement guide**:
The engine step before the ready gate that tells the user to turn or step back until the camera view is usable.
_Avoid_: calibration

**Countdown**:
The three seconds between the ready pose and the first attempt.

### Motion data

**Landmark**:
One of MediaPipe's 33 body points: image coordinates, world coordinates in metres, and a visibility score.
_Avoid_: keypoint (used only in "keypoint file"), joint (a landmark used in an angle)

**Keypoint file**:
The per-set file holding every frame's 33 landmarks at capture rate, uploaded beside the video. What similarity reads and what the replay draws.
_Avoid_: skeleton file, motion file, landmark dump

**Video**:
The raw camera recording of one set, from the end of the countdown to the end of the set. The skeleton is drawn over it at playback, never baked in.

**Similarity**:
The percentage match between the user's motion and the expert motion, per rep and per region, plus an overall. The report's "accuracy" is this number.
_Avoid_: accuracy score, form score, correctness percentage

**Region**:
One of the five body areas similarity is split into: head and neck, back and core, hips and pelvis, knees, ankles and feet.

**Expert motion**:
The stored reference motion for one exercise that similarity compares against. Owned by Punnapat's component.
_Avoid_: template, reference video

### Feedback and history

**Feedback**:
The coaching text written for one set from its attempts, similarity, retrieved knowledge, the user's history for that exercise, and the profile. Shown after the set and stored on it.
_Avoid_: advice, LLM response, comment

**Knowledge base**:
The exercise-scoped text chunks with embeddings that feedback retrieves from. Owned by Sujira's component.
_Avoid_: RAG store, documents

**Weekly summary**:
The Home chart: the last seven days ending today in the browser's time zone, mean similarity over each day's sets.
_Avoid_: daily tracking, dashboard

**Active day**:
A day on which the user finished at least one workout of a given exercise, dated by the workout's start. History level 2 counts them over the last seven days. A workout left part way makes no active day.

**Consent**:
The user's recorded agreement, with version and time, to camera use, to storing video and landmarks, and to storing the profile.
_Avoid_: terms, agreement, PDPA acceptance

**Profile**:
The user's name, age, gender, weight in kilograms, height in centimetres, and medical history. Complete before the first workout.
_Avoid_: account, settings

**Medical history**:
Free text about injuries, mobility, disability, and conditions the feedback must respect. May be "none". Editable at any time.
_Avoid_: health notes, injury history (it is broader than injuries)

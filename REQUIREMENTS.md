# Product requirements

Distilled from *"21 Apr 2026 Draft Chapter 1-3 V4"*, the Chapter 3 sections submitted
to the professor: 3.2 (system requirements and architecture), 3.3 (API design), 3.4
(history system), 3.5 (data structures), 3.6 (screen designs), 3.7 (design constraints).

**This file is the contract. It says WHAT the system must do, not HOW to build it.**

## A note on what is superseded

The report specifies a **React Native mobile app** with a FastAPI backend, Firebase
Authentication, Google Cloud Storage, and PostgreSQL with pgvector.

The team has since decided to build a **web application first**. Everything in this
file about *behaviour, screens, data, and rules* still holds. Everything about
*specific technologies* is a starting suggestion, not a requirement. The direction the
team is leaning is Next.js plus Supabase plus Postgres, but the implementing session
is expected to evaluate that and say so if something fits better.

Requirements that survive the platform change and must not be dropped:

- Pose detection, angle calculation, and rule-based checking run **on the client**, not
  on a server. The report justifies this as latency (zero-latency correction) and as
  cost (edge computing to save bandwidth). Both still apply on the web.
- Every authenticated data path is access-controlled per user. The report achieves this
  with JWT plus a backend check. Any equivalent mechanism is fine.
- Video uploads go **directly** from client to object storage using a short-lived
  signed credential, never proxied through the application server.

---

## 1. Scope

Four bodyweight exercises, and only these four: **Squat, Push-up, Lunge, Bicep curl**.

Adding a fifth exercise must be a data change, not a code change. The report is
explicit about this: the exercise endpoint is described as *"Dynamic Configuration"* so
the client can pull thresholds and guidance without hardcoding them.

---

## 2. Functional requirements

### FR1. User management

- Register and sign in.
- A user profile holding: display name, age, gender, **weight (kg)**, **height (cm)**,
  and **medical history / injury history** as free text.
- The user can view and edit their own profile.

Weight, height, and especially medical history are not decoration. The report states
medical history is passed as **context to the LLM so its advice is safe** (its example
is a previously broken leg). Treat these fields as inputs to a downstream system, not
as profile trivia.

### FR2. Real-time posture evaluation

During exercise, on the client, continuously:

- Capture camera video.
- Extract body landmarks (33 MediaPipe points).
- Compute joint angles.
- Count repetitions through a **state machine**.
- Check angles against **rule-based thresholds** and surface a correction message
  immediately, for example "Keep back straight".

**Counting is strict.** From the report: if the user performs the movement incorrectly,
the rep **is not counted**, and they must perform it correctly before the counter
advances. A wrong rep is not a rep.

### FR3. In-depth analysis and AI feedback

At the end of each set:

- Compute a **similarity percentage** for the user's motion against stored expert
  motion, broken down per body region.
- Feed the detected rule-based errors plus retrieved biomechanical knowledge (RAG) plus
  the user's history into an **LLM** to produce natural-language coaching.
- Persist the result.

### FR4. History and tracking

Record video, statistics, similarity percentage, and the AI advice, and present them
back as a weekly overview and as browsable past sessions. Detailed in section 5 below.

---

## 3. Non-functional requirements

| | Requirement |
|---|---|
| **NFR1 Real-time** | Landmark extraction, angle math, and rule checking run on the user's own device. No per-frame server round trip. |
| **NFR2 Access control** | Every request except register and sign-in is authenticated, and a user can only ever reach their own data. |
| **NFR3 Signed uploads** | Video goes client to storage directly via a temporary signed URL. |
| **NFR4 Consent (PDPA)** | The system records video of the user. Explicit consent is required for camera access and for storing personal data, per Thailand's PDPA. This is a stated design constraint, not optional. |
| **NFR5 Cost** | Client-side processing is chosen partly to reduce bandwidth cost. Prefer open-source and free-tier-friendly infrastructure. |
| **NFR6 Safety** | The real-time correction exists to prevent injury from bad form. Feedback must be prompt and unambiguous. |

---

## 4. The exercise session flow

This is the core loop and the most detailed part of the report. It runs in five stages.

### 4.1 Setup

The user picks one of the four exercises, then chooses **reps per set** and **number of
sets**. Both are user-configurable, not fixed.

### 4.2 Guide

Before the camera opens, show the exercise's **guide text** and a **demonstration video**
so the user can prepare and position themselves.

### 4.3 Get ready

The camera view opens showing live video with the user's **skeleton overlaid in
real time**, and a **countdown** runs so the user can get into position before counting
starts.

### 4.4 Exercise

Live, per frame: skeleton overlay, current rep count, and a correction message when a
rule is violated. An incorrect rep does not increment the counter.

### 4.5 Completion, and the repair round

This rule is specific and easy to miss:

> If **even one** rule-based error occurs during a set, then when the set completes the
> user is given **one repair round** to try again, and then the system ends the session.

So a session is not simply "reps done, finished". It is:

1. Complete the set.
2. If zero errors occurred, finish.
3. If one or more errors occurred, offer exactly **one** retry round.
4. After the retry round, finish regardless of outcome.

Afterwards, show the LLM feedback for the set. The system remembers the errors and uses
them as context for future advice, so the retry round's feedback should be aware of
what went wrong the first time.

---

## 5. History system

Four levels, drilled into progressively. The report explicitly calls out a **drill-down
approach** to avoid over-fetching, so do not load everything at once.

**Level 1. Weekly summary dashboard.** On the home screen. The last 7 days as a **bar
chart**, Monday through Sunday, of average posture accuracy or activity volume per day.

**Level 2. Per-exercise statistics.** For each of the four exercises, the number of days
in the week the user performed it (**Weekly Active Days**).

**Level 3. Chronological session list.** For one chosen exercise, every past session
newest first, each showing at least the **date** and the **similarity percentage**.

**Level 4. Session deep-dive.** The most important screen in the history system. For one
chosen session, all four of:

- the **recorded video** of that session
- the **accuracy score**, the similarity percentage against the expert model
- the **incorrect form list**, every error the rule-based system detected
- the **LLM feedback** generated for that session

---

## 6. Screens

From section 3.6. The report's wireframes are phone-shaped; adapt the layout to the web,
keep the information architecture.

| Screen | Contents |
|---|---|
| **Login** | Email and password, with registration. |
| **Home** | Exercise selection cards, plus the Daily Tracking bar chart (Mon to Sun accuracy). |
| **Settings** | Edit name, weight, medical history. |
| **Exercise setup** | Pick from the 4 exercises, set reps per set and number of sets. |
| **Exercise ready** | Live camera, real-time skeleton, countdown. |
| **Exercise active** | Live skeleton, rep counter, correction messages. Wrong reps do not count. |
| **Set complete** | LLM-generated feedback for the set. |
| **Repair round** | Shown when errors occurred, one retry. |
| **Session finished** | Post-session summary. |
| **History** | Per-exercise cards with weekly activity. |
| **History: one exercise** | Session list for that exercise. |
| **History: one session** | Video, accuracy, errors, feedback. |
| **History: feedback detail** | The full LLM advice for that session. |

Primary navigation is a bottom tab bar in the wireframes: **Home**, **History**,
**Settings**.

---

## 7. Data model

Five tables in the report. Names and fields are given here as the intent; adapt naming
to whatever conventions the implementation adopts, but do not silently drop a field.

**users** is `user_id` PK (derived from the auth provider's token), `name`, `age`,
`gender`, `weight` float, `height` float, `medical_history` text, `created_at`.

**exercises** is `exercise_id` PK, `name`, `guide_text`, `thumbnail_url`,
`guide_video_url`, `rule_based_logic` JSONB holding the angle thresholds and the warning
message for each rule. This JSONB is what makes the exercise set data-driven.

**expert_motions** is `exercise_id` PK and FK, 1:1 with exercises. `motion_data` holding
the expert's encoded motion (a `.npy` file's contents), `updated_at`. Deliberately a
separate table so listing exercises does not drag large binaries along.

**sessions** is `session_id` UUID PK, `user_id` FK, `exercise_id` FK, `date`,
`target_reps`, `completed_reps`, `aborted_reps`, `average_overall_similarity` float,
`reps_detail` JSONB, `video_url`, `llm_feedback` text.

**knowledge_base** is `chunk_id` UUID PK, `exercise_id` FK (so retrieval can be scoped to
one exercise), `content` text, `embedding` vector. Requires pgvector.

### The reps_detail shape

Per-rep detail, stored as a JSON array. This is the richest structure in the system and
the one the similarity and LLM parts both read, so get it right early:

```json
[
  {
    "rep_no": 1,
    "status": "completed",
    "similarity_scores_percent": {
      "overall": 95, "head_neck": 98, "back_core": 95,
      "hips_pelvis": 92, "knees": 94, "ankles_feet": 96
    },
    "state_duration_seconds": { "descending": 1.2, "bottom": 0.5, "ascending": 1.0 },
    "errors": []
  },
  {
    "rep_no": 2,
    "status": "aborted",
    "similarity_scores_percent": { "overall": 68, "...": 0 },
    "state_duration_seconds": { "descending": 3.0, "bottom": 0, "ascending": 0 },
    "errors": [
      {
        "error_type": "knees_over_toes_excessive",
        "state_occurred": "descending",
        "angle_recorded": 140,
        "threshold_expected": ">= 150",
        "action": "warned_user_reset_to_standing"
      }
    ]
  }
]
```

Three things this shape tells you:

- `status` is `completed` or `aborted`. Aborted reps are **recorded but not counted**.
- `similarity_scores_percent` splits the body into **five regions**: head_neck,
  back_core, hips_pelvis, knees, ankles_feet, plus an overall. So the similarity part
  returns six numbers per rep, not one.
- `state_duration_seconds` records how long the user spent in each state machine phase,
  used to detect reps that are too fast, too slow, or stuck in one state.

---

## 8. Behavioural contract from the API design

Section 3.3 specifies REST endpoints. On the web the transport may differ, but each
endpoint encodes a behavioural requirement worth preserving:

| Behaviour | Detail |
|---|---|
| Create profile after signup | A user record is created in the app database immediately after the auth provider confirms the account. |
| Read and update own profile | Pre-fill the edit form with current values before editing. Validate on the client first to reduce server load. |
| List exercises | Returns the four exercises with name and thumbnail for the selection cards. |
| Get one exercise | Returns guide text, guide video URL, **rule thresholds**, **rule guidance messages**, and the **list of state machine states**. The client pulls its rule configuration from here rather than hardcoding it. |
| Request an upload URL | Returns a short-lived signed URL plus the destination path. Called when the set ends, before analysis. |
| Analyse a session | Takes session id, exercise, target reps, aborted reps, and the full `reps_detail` array. Runs similarity, runs RAG retrieval, calls the LLM, persists everything, returns the per-rep similarity percentages and the feedback text. |
| History summary | Last 7 days grouped by weekday for the home chart. |
| History by exercise | Weekly active days per exercise type. |
| Sessions for one exercise | Session id, date, similarity accuracy, newest first. |
| One session's details | Video URL, per-rep detail, errors, similarity, LLM feedback. Must verify the session belongs to the requesting user. |

---
## 9. Known gaps to resolve

Two places where the report contradicts either itself or the existing implementation.
Both need a decision before any table is created. Do not paper over either by picking
one option at random.

### 9.1 The per-rep schema does not match the research repo's

The research repo (`~/Documents/SeniorProject`) already emits a versioned session report
from `src/pipeline/session_report.py` at `SCHEMA_VERSION = 4`. Its per-rep shape is
`{ rep_number, correct, warnings[], violations[] }`, with session totals of
`total_attempts`, `total_reps_completed`, `total_reps_correct`,
`total_attempts_abandoned`.

**That does not match this report's `reps_detail` shape.** The report has `rep_no`,
`status`, per-region similarity, and state durations; the Python has `rep_number`,
`correct`, warnings, and violations, and no similarity at all because similarity is a
different person's component.

They are describing the same thing at different times, from different sides. Neither is
wrong. Reconciling them into one schema the web app owns is real design work.

Vocabulary from the Python side that the UI should adopt, because it is more precise
than the report's:

- **attempt**: any movement the state machine opened
- **completed rep**: an attempt that finished the full range of motion
- **correct rep**: a completed rep that violated no form rules
- **abandoned attempt**: started, never reached depth, deliberately not counted, still
  recorded with its warnings

The report's `aborted_reps` maps to abandoned attempts.

### 9.2 Sets and sessions do not line up

**The UI collects two numbers. The data model stores one.**

Section 3.6 says the user picks an exercise and then chooses **reps per set** *and*
**number of sets**. Section 4.1 of this file repeats it.

But section 3.5's `sessions` table is explicitly described as one row per **set**
(*"when the user finishes each round (Set)"*), and it carries exactly one of everything:
one `target_reps`, one `completed_reps`, one `aborted_reps`, one
`average_overall_similarity`, one `reps_detail` array, one `video_url`, one
`llm_feedback`. The analyse endpoint in 3.3 takes the same single-set payload.

So a three-set workout produces three rows, and **nothing in the schema groups them.**
There is no workout entity. The user's stated intent, "3 sets of 10 squats", is not
representable as a single record anywhere.

Consequences that have to be answered together, not one at a time:

| Question | Why it bites |
|---|---|
| What does history level 3 list? | Three sets of one workout appear as three separate entries, indistinguishable from three workouts done on three occasions. |
| How does the weekly chart average? | "Average accuracy per day" over sets weights a 5-set day differently from a 1-set day. Over workouts it does not. |
| How many repair rounds can one workout trigger? | The repair round in 4.5 is defined per set. Three sets means up to three repair rounds. Almost certainly not intended, but the report never says. |
| What does the LLM see? | Feedback is generated per set. Does it get the other sets in the same workout as context, or does each set get advice written in ignorance of the rest? |
| How many videos? | One `video_url` per row means either one recording per set, or one recording split across rows, or a video that outlives its row. |
| What does rest between sets look like? | There is no rest state anywhere in the report, yet multi-set training implies one. |

Four ways out, roughly in order of how much they change:

1. **Add a parent `workouts` table.** Sessions keep meaning "one set" and gain a
   `workout_id` plus a `set_no`. Most faithful to the report, most new structure.
2. **Keep one row per set and group by time window.** No new table, but "same workout"
   becomes a heuristic rather than a fact, which will be wrong eventually.
3. **Redefine a session as the whole workout.** Push set boundaries down into
   `reps_detail`. Fewer rows, but it breaks the report's own wording and the analyse
   endpoint's payload shape.
4. **Drop multi-set from v1.** Ship reps-per-set only, fix the set count at one, and
   note it as deferred scope. Smallest build, and it makes the UI honest instead of
   collecting a number the system cannot represent.

Option 4 is worth genuinely considering rather than treating as a cop-out. The report's
entire data model, its API, its repair-round rule, and its history design were all
written as if a session is a set. Multi-set appears in exactly one sentence of the
screen descriptions and nowhere else. It may simply never have been designed.

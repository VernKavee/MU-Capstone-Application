# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

Phase 0 is done: the decisions exist, the code does not. The repo holds planning
documents, the vocabulary, and the decision records.

- `REQUIREMENTS.md` is the contract. It says WHAT the system must do, not HOW. Read it at the start of every session.
- `BUILD_PLAN.md` is the phase sequence: seven phases, one session each. Do not run more than one phase per session.
- `CONTEXT.md` is the vocabulary. Use its terms in code, UI, and docs, and challenge any term that conflicts with it.
- `docs/adr/` holds the seven decision records from Phase 0. Read the ones a phase depends on before starting it, and update them rather than deciding silently.
- `ref_doc/sessions/` holds one log per session.

The project is a web app for checking exercise posture with AI, covering exactly four
bodyweight exercises: Squat, Push-up, Lunge, Bicep curl. The requirements were written
for React Native plus FastAPI; the team switched to web. Behaviour, screens, data, and
rules still hold. The stack is decided in ADR-0001: Next.js App Router against the
Supabase API, run from Supabase's Docker stack on a team machine for the evaluation.

## Build, lint, and test commands

None exist. There is no `package.json`, test runner, or lint config. Phase 1 lands the
scaffolding; fill this section in then. Tooling decided for Phase 1: Supabase CLI SQL
migrations, `supabase-js`, no ORM, the Supabase Docker stack for local and evaluation
runs.

## The three-part AI structure

Three AI components are owned by specific people and **none of them is implemented in
this repo**. Each stays behind an explicit interface with a stub that returns believable
fake data, so one person can replace one file.

| Component | Owner | Lives where |
|---|---|---|
| Rule-based form checking plus FSM rep counting | Kavee (Vern) | already built in the research repo, see below |
| Motion similarity, six numbers per rep | Punnapat | their own component |
| LLM coaching plus RAG retrieval | Sujira | their own component |

Do not write similarity math, an LLM call, RAG, or vector search here. The rule engine
port is Vern's separate work behind the seam in ADR-0002, not a phase of this build. The
similarity and feedback contracts are in ADR-0007.

## Invariants that are easy to violate

- **Client-side processing (NFR1).** Landmark extraction, angle math, and rule checking
  run on the user's device. No per-frame server round trip.
- **Per-user access control (NFR2).** Enforced at the database layer from the first
  migration, not added later. A user can only ever reach their own data.
- **Signed uploads (NFR3).** Both files of a set, the video and the keypoint file, go
  client to storage directly via a short-lived signed URL, never proxied through the
  application server.
- **PDPA consent (NFR4).** Three separate consents, recorded with version and time:
  camera access with on-device processing, storing video and landmarks, storing the
  profile including medical history. Built in Phase 1, not bolted on.
- **Strict counting.** The counter is correct reps. Attempts are shown beside it. An
  incorrect or abandoned attempt never increments it.
- **Show one, record all.** Display the single highest priority violation to the user
  while recording every violation in the attempt record.
- **The engine seam is the research repo's contract (ADR-0002).** `process(keypoints,
  timestampMs)` returns the FrameResult fields and `getSessionReport()` returns the
  schema version 4 report. The UI never re-derives counters, states, or warnings. The
  stub and the future port both satisfy it.
- **Adding an exercise built from existing checks is a data change (ADR-0006).**
  Exercise rows carry thresholds, messages per locale, priorities, scope, debounce,
  state names, highlight joints, an engine key, and the name of each check. A new check
  is one registered function. If you write `if (exercise === 'squat')`, the design is
  wrong.
- **Save first, then analyse (ADR-0007).** A set is persisted the moment it ends.
  Similarity and feedback are written to it afterwards and may be empty.
- **The engine's report is stored verbatim (ADR-0003)** next to the merged attempt
  records. Never reconstruct it.
- **Medical history is a real field**, not profile trivia. Required before the first
  workout, "none" allowed, editable in Settings. It feeds the LLM so advice is safe.
  Stubs should visibly receive it.

## Decided in Phase 0

Every decision has a record in `docs/adr/`. Do not re-open one silently; if a phase finds
a decision wrong, say so and update the ADR.

- ADR-0001: web app, Next.js against the Supabase API, self-hosted Docker stack on a team
  machine for the evaluation, no SMTP, evaluation through direct database and file access.
- ADR-0002: rule engine client-side in TypeScript, ported by Vern later, behind the
  research repo's contract; MediaPipe full model everywhere.
- ADR-0003: one merged record per attempt plus the engine's report verbatim.
- ADR-0004: workouts own sets; the repair set is a set of kind repair, offered once per
  set, can be declined; rest timer; feedback after every set.
- ADR-0005: full raw video plus a keypoint file per set, skeleton drawn at playback;
  consent in three parts; data kept until the project ends.
- ADR-0006: exercise configuration is data with a check registry.
- ADR-0007: similarity and feedback behind JSON contracts and stubs, subject to change;
  the knowledge base and expert motions live in this Postgres.

Smaller decisions without an ADR, so no phase re-decides them:

- The setup screen asks reps per set, number of sets, and rest seconds (default 60).
- The attempt cap defaults to twice the target; an end-set button exists.
- Live screen: a beep per correct rep and the warning spoken through the browser speech
  API, with a mute toggle.
- The profile must be complete before the first workout; medical history may be "none".
- Weekly chart: mean similarity per day over that day's sets; week starts Monday in the
  browser's time zone. History level 3 lists workouts, not sets.
- English UI; every user-facing message in exercise data is keyed by locale.
- Laptops and phones are both first-class.
- Skills: adopt `supabase/agent-skills@supabase` and
  `supabase/agent-skills@supabase-postgres-best-practices` at the start of Phase 1 and a
  Playwright skill at Phase 6. Nothing else in the ecosystem was worth adopting.

Still open, to be settled in the phase named:

- Tunnel choice, Phase 1.
- Keypoint file format, Phase 4.
- The bound on past workouts in the feedback input, Phase 4.
- Embedding model and column dimension, at integration with Sujira's component.
- Whether the evaluation is supervised sessions or unsupervised use; decides self-hosted
  versus the Pro plan.
- Guide videos and thumbnails for the four exercises do not exist yet.

Vocabulary is in `CONTEXT.md`. In particular: attempt, completed rep, correct rep,
abandoned attempt, workout, set, repair set, and the engine state names Idle, Concentric,
Inflection, Eccentric.

## Research repo, reference only

`~/Documents/SeniorProject` is the Python research project, not a dependency of this repo.
Relevant for cross-checking behaviour:

- `src/rule_based/` and `src/fsm_counter/` - the existing rule and state machine logic
- `src/pipeline/session_report.py` - emits the versioned report at `SCHEMA_VERSION = 4`
- `src/pipeline/frame_processor.py` - the FrameResult contract the engine seam mirrors
- `scratch_output/live_webcam/` - live recordings with angles and joint scores per frame
  but no landmarks; the parity harness needs a landmark dump added there

## Working rules

- Work in steps within a phase, and pause between them to report what was done.
- Ask immediately when uncertain. Do not assume silently. If a requirement is wrong or
  impossible, say so and propose the alternative rather than quietly working around it.
- No em dashes in any output, including files written here.
- Small team of three working directly on `main`. Never create branches. Never suggest
  opening a PR.
- Write a session log to `ref_doc/sessions/YYYY-MM-DD.md` at the end of each phase.
- Keep `README.md` current with what actually exists.

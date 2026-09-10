# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository state

There is no application code yet. The repo holds planning documents only.

- `REQUIREMENTS.md` is the contract. It says WHAT the system must do, not HOW. Read it at the start of every session.
- `BUILD_PLAN.md` is the phase sequence: seven phases, one session each. Do not run more than one phase per session.

Both files are currently untracked; only `.gitignore` and `README.md` are committed.

The project is a web app for checking exercise posture with AI, covering exactly four
bodyweight exercises: Squat, Push-up, Lunge, Bicep curl. The requirements were written
for React Native plus FastAPI; the team switched to web. Behaviour, screens, data, and
rules still hold. Specific technologies are suggestions. The `.gitignore` is Next.js
shaped, and the team is leaning Next.js plus Supabase plus Postgres, but that is not
settled.

## Build, lint, and test commands

None exist. There is no `package.json`, test runner, or lint config. Phase 1 lands the
scaffolding; fill this section in then.

## The three-part AI structure

Three AI components are owned by specific people and **none of them is implemented in
this repo**. Each stays behind an explicit interface with a stub that returns believable
fake data, so one person can replace one file.

| Component | Owner | Lives where |
|---|---|---|
| Rule-based form checking plus FSM rep counting | owner not named in the planning docs | the research repo, see below |
| Motion similarity, six numbers per rep | Punnapat | their own component |
| LLM coaching plus RAG retrieval | Sujira | their own component |

Do not write similarity math, an LLM call, RAG, or vector search here. Do not port the
rule engine here without an ADR saying to.

## Invariants that are easy to violate

- **Client-side processing (NFR1).** Landmark extraction, angle math, and rule checking
  run on the user's device. No per-frame server round trip.
- **Per-user access control (NFR2).** Enforced at the database layer from the first
  migration, not added later. A user can only ever reach their own data.
- **Signed uploads (NFR3).** Video goes client to storage directly via a short-lived
  signed URL, never proxied through the application server.
- **PDPA consent (NFR4).** Explicit consent for camera access and for storing personal
  data. A stated design constraint, built in Phase 1, not bolted on.
- **Strict counting.** An incorrect rep does not increment the counter.
- **Show one, record all.** Display the single highest priority violation to the user
  while recording every violation in the session report.
- **Adding a fifth exercise is a data change, never a code change.** Thresholds, guidance
  messages, and state machine state names come from the `exercises.rule_based_logic`
  JSONB. If you write `if (exercise === 'squat')`, the design is wrong.
- **Medical history is a real field**, not profile trivia. It feeds the LLM so advice is
  safe. Stubs should visibly receive it.

## Open decisions, none of them settled

`REQUIREMENTS.md` section 9 documents two gaps, and `BUILD_PLAN.md` Phase 0 lists three
more. Every one of them needs an ADR before the code that depends on it. Do not pick a
side at random and do not paper over them.

**9.1 The per-rep schema.** The report's `reps_detail` shape and the research repo's
session report describe the same thing from different sides and do not match. Reconcile
them into one schema this app owns before creating any table that stores per-rep data.

**9.2 Sets versus sessions.** The UI collects reps per set and number of sets, but
`sessions` is one row per set with no workout entity grouping them. Section 9.2 lists six
downstream questions and four ways out, including dropping multi-set from v1. Answer them
together, not one at a time.

**Also open, per Phase 0:** where the rule engine runs (porting 53KB of Python to
TypeScript means two copies forever; keeping it in Python means a stateful connection per
session), whether video is stored at all or replaced by keypoint replay, and whether the
repair round extends the session row or creates a new one.

Use this vocabulary from the Python side, which is more precise than the report's:

- **attempt** - any movement the state machine opened
- **completed rep** - an attempt that finished the full range of motion
- **correct rep** - a completed rep that violated no form rules
- **abandoned attempt** - started, never reached depth, not counted, still recorded with
  its warnings (the report's `aborted_reps`)

## Research repo, reference only

`~/Documents/SeniorProject` is the Python research project, not a dependency of this repo.
Relevant for cross-checking behaviour:

- `src/rule_based/` and `src/fsm_counter/` - the existing rule and state machine logic
- `src/pipeline/session_report.py` - emits the versioned report at `SCHEMA_VERSION = 4`

## Working rules

- Work in steps within a phase, and pause between them to report what was done.
- Ask immediately when uncertain. Do not assume silently. If a requirement is wrong or
  impossible, say so and propose the alternative rather than quietly working around it.
- No em dashes in any output, including files written here.
- Small team of three working directly on `main`. Never create branches. Never suggest
  opening a PR.
- Write a session log to `ref_doc/sessions/YYYY-MM-DD.md` at the end of each phase.
- Keep `README.md` current with what actually exists.

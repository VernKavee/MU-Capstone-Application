# Build plan

Seven phases, **one session each**. Do not try to run more than one phase per session.
Each phase below contains a prompt you can paste directly.

Every phase assumes `REQUIREMENTS.md` is the contract. Read it at the start of every
session.

---

## Before phase 0: install the skills

Run these in the terminal, once:

```bash
npx skills add https://github.com/mattpocock/skills --skill grill-me
```

```bash
npx skills add https://github.com/mattpocock/skills --skill grill-with-docs
```

```bash
npx skills add https://github.com/vercel-labs/skills --skill find-skills
```

```bash
npx skills add https://github.com/anthropics/skills --skill frontend-design
```

What each one is for here:

- **grill-me** stress-tests a plan through relentless questioning. Use it in phase 0
  before any code exists, and at the start of any phase where the approach is unclear.
- **grill-with-docs** does the same but writes the outcome into `CONTEXT.md` and ADRs,
  and sharpens terminology as it goes. Better than grill-me once the repo has documents
  worth maintaining, so use it from phase 1 onward.
- **find-skills** discovers other skills from the ecosystem. Run it in phase 0 to see
  whether anything covers Supabase, auth, or testing better than working from scratch.
- **frontend-design** produces distinctive interfaces instead of generic AI-looking
  ones. Use it in phases 3, 5, and 6, the ones with real visual surface.

---

## Phase 0. Interrogate and decide. No code.

> Read `REQUIREMENTS.md` in full. Do not write any application code this session.
>
> This is a capstone project at Mahidol University. The requirements were written for a
> React Native mobile app with a FastAPI backend, but the team has decided to build a
> web application instead. They are leaning toward Next.js, Supabase, and Postgres. Your
> job this session is to pressure-test that and produce the decisions, not the code.
>
> Use the **grill-me** skill on me. Interrogate the plan properly. I would rather find
> the holes now than in phase 4.
>
> Areas I already know are unresolved, so push hardest here:
>
> 1. **Section 9.1**, the schema mismatch between the Python session report and the
>    report's `reps_detail`. This has to be settled before any table exists.
> 2. **Where the rule engine runs.** Pose detection must be client-side per NFR1. The
>    existing rule and state machine implementation is roughly 53KB of Python in the
>    research repo. Porting it to TypeScript means maintaining two copies forever.
>    Keeping it in Python means a stateful connection per active session. Neither is
>    obviously right.
> 3. **Video storage cost.** The requirements say record video and replay it in history.
>    A two-minute clip is 50 to 200MB. A free Supabase tier is 1GB. The evaluation plan
>    involves 15 students testing the app. Does the video get stored, downscaled, or
>    replaced by replaying the stored keypoints as a skeleton animation?
> 4. **The repair round.** Section 4.5. Does the retry round create a new session row or
>    extend the existing one? What does history show for a session that had a retry?
> 5. **Section 9.2, sets versus sessions.** The user picks reps per set AND number of
>    sets, but the data model stores one row per set with no workout entity grouping
>    them. Section 9.2 lists the six downstream questions and four ways out. Answer them
>    together, not one at a time. Option 4, dropping multi-set from v1, is a real option
>    and not a cop-out: read the argument there before dismissing it.
>
> Also run the **find-skills** skill to check whether the ecosystem already has skills
> worth adopting for this stack before we commit to anything.
>
> Deliverables for this session, as files:
>
> - `CONTEXT.md`, the domain model and the vocabulary we are agreeing to use
> - `docs/adr/` with one ADR per real decision, including the five above
> - `CLAUDE.md` for this repo, carrying: the three-part AI structure and who owns what,
>   the rule that no AI logic goes in this repo yet, no em dashes in output, small team
>   of three working directly on main, never create branches, never suggest PRs, session
>   logs under `ref_doc/sessions/YYYY-MM-DD.md`, and keep README.md current
>
> Ask me questions rather than assuming. Pause and report before you write each file.

---

## Phase 1. Foundation and identity

> Read `REQUIREMENTS.md`, `CONTEXT.md`, `CLAUDE.md`, and the ADRs in `docs/adr/`.
>
> Set up the project skeleton and everything to do with **who the user is**. Nothing
> about exercise yet.
>
> Scope:
>
> - Project scaffolding per the phase 0 decisions. The repo already has a `.gitignore`,
>   a `README.md`, and one commit. Extend them, do not clobber them.
> - Database schema for `users`, with per-user access control enforced at the database
>   level from the very first migration, not added later.
> - Enable pgvector in the first migration. Phase 6 needs it and it is free to do now.
> - Register and sign in.
> - Profile create, read, update: name, age, gender, weight, height, medical history.
>   FR1. Remember medical history feeds the LLM later, so it is a real field.
> - App shell and navigation: Home, History, Settings.
> - PDPA consent capture, NFR4. This is a stated design constraint, so build it now
>   rather than bolting it on.
>
> Use **grill-with-docs** if any of this turns out underspecified, and update the ADRs
> rather than deciding silently.
>
> Work in steps and pause between them to tell me what you did.

---

## Phase 2. Exercise catalog and session setup

> Read `REQUIREMENTS.md` sections 1, 4.1, 4.2, and 7.
>
> Everything from picking an exercise up to the moment the camera opens.
>
> Scope:
>
> - `exercises` table with the four exercises seeded as **data**: Squat, Push-up, Lunge,
>   Bicep curl. Including `guide_text`, `thumbnail_url`, `guide_video_url`, and the
>   `rule_based_logic` JSONB holding thresholds, warning messages, and the state machine
>   state names.
> - The exercise selection screen, the cards on Home.
> - The setup screen: reps per set, number of sets, per the phase 0 decision about how
>   sets are modelled.
> - The guide screen: guide text plus the demonstration video, shown before the camera
>   opens.
> - `expert_motions` table, empty. Punnapat's component fills it later.
>
> The hard requirement: **adding a fifth exercise must touch only data, never code.**
> If you find yourself writing `if (exercise === 'squat')` anywhere, the design is wrong.
> Prove it by adding a fake fifth exercise as a test, confirming it renders, and removing
> it.

---

## Phase 3. The live session screen

> Read `REQUIREMENTS.md` sections 2 (FR2), 3 (NFR1), and 4.3 to 4.4.
>
> This is the hardest and most important screen in the product. It gets its own session.
>
> Scope:
>
> - Camera permission, with a clear and recoverable denied state.
> - MediaPipe pose landmarks running **client-side**, 33 points, per NFR1.
> - Live skeleton overlay on the video.
> - The countdown before counting starts.
> - Rep counter, current state machine state, and a correction message area.
> - **Strict counting: an incorrect rep does not increment the counter.**
>
> The rule engine and state machine are **not implemented in this repo**. Define the
> interface and ship a **stub** that produces believable fake output: a rep roughly every
> two seconds, occasional canned warnings such as "Keep back straight", real state
> transitions. Believable fake data is what makes the UI honest to build against.
> Whoever implements the real engine replaces one file.
>
> Show one correction message at a time, not a list. The rule layer's policy is
> "show one, record all": display the single highest priority violation while recording
> every violation for the report.
>
> Keep the frame loop in a testable unit separate from the React component.
>
> Use the **frontend-design** skill. This screen is what gets demonstrated to the
> professors and it should not look like a default template.
>
> Note: `getUserMedia` works on localhost without HTTPS, but testing from a phone on the
> LAN needs HTTPS.

---

## Phase 4. Session completion and the AI seam

> Read `REQUIREMENTS.md` sections 4.5, 2 (FR3), 7, and 8.
>
> Everything from the last rep to a saved session.
>
> Scope:
>
> - **The repair round.** One or more rule errors during the set means exactly one retry
>   round, then the session ends regardless of the outcome. Zero errors means finish
>   immediately. Implement per the phase 0 ADR.
> - `sessions` table and the reconciled per-rep detail schema from phase 0.
> - Video upload direct to storage using a short-lived signed URL, NFR3, per the phase 0
>   decision on whether video is stored at all.
> - The set-complete screen showing the generated feedback.
> - The session-finished summary.
>
> Two more **stubs** behind explicit interfaces, same pattern as phase 3:
>
> - **Similarity**: returns six numbers per rep, an overall plus the five body regions
>   head_neck, back_core, hips_pelvis, knees, ankles_feet. Punnapat's component.
> - **LLM feedback**: takes the session record and returns coaching prose after a short
>   artificial delay. Sujira's component. The stub should visibly receive the user's
>   medical history so the seam for safe advice is real, even while the text is fake.
>
> No similarity math, no LLM call, no RAG, no vector search in this repo yet.

---

## Phase 5. History

> Read `REQUIREMENTS.md` section 5 and section 8.
>
> All four drill-down levels. The report is explicit that this is a **drill-down** design
> to avoid over-fetching, so each level loads only what it needs.
>
> Scope:
>
> - **Level 1**: the weekly bar chart on Home, last 7 days, Monday to Sunday.
> - **Level 2**: per-exercise weekly active days.
> - **Level 3**: session list for one exercise, newest first, date and similarity.
> - **Level 4**: the session deep-dive, with all four parts present: recorded video (or
>   the keypoint replay, per the phase 0 decision), accuracy score, the full list of
>   detected form errors, and the LLM feedback.
>
> Level 4 is called out in the report as the most important screen in the history system.
> Give it the most attention.
>
> Use the **frontend-design** skill for the chart and the deep-dive layout.

---

## Phase 6. Hardening and handover

> Read everything. This session is about making the app real rather than adding features.
>
> Scope:
>
> - Tests. Unit tests for the frame loop and the state handling, and one end-to-end test
>   walking sign-in, session, history.
> - Verify per-user data isolation actually holds. Try to read another user's session and
>   confirm it fails.
> - Loading, empty, and error states on every screen. An empty history is the first thing
>   a new user sees.
> - Responsive layout. The requirements were written for a phone, so it must work at
>   phone width even though this is a web app.
> - `knowledge_base` table with pgvector, empty, ready for Sujira.
> - A design pass with **frontend-design** across the whole app for consistency.
> - Update `README.md`, `CLAUDE.md`, `CONTEXT.md`, and the ADRs to match what was
>   actually built.
> - Write `docs/HANDOVER.md`: exactly which three files each teammate replaces, what
>   interface each must satisfy, and what fake data the stub currently returns.
>
> The end state: three people can each replace one stub and have a working product,
> without reading the rest of the codebase.

---

## Working rules for every phase

- Read `REQUIREMENTS.md` and `CLAUDE.md` at the start of the session.
- Work in steps within the phase, and **pause between steps** to report what you did and
  roughly how long it took.
- Ask immediately when uncertain. Do not assume silently.
- If a requirement turns out to be wrong or impossible, say so and propose the
  alternative. Do not quietly work around it.
- No em dashes in any output.
- Work directly on main. Do not create branches. Do not suggest opening PRs.
- Write a session log to `ref_doc/sessions/YYYY-MM-DD.md` at the end of each phase.
- **Do not implement any of the three AI parts.** Rule-based plus FSM, similarity, and
  LLM plus RAG are all owned by specific people and all stay stubbed in this repo.

---
status: accepted
---

# Exercise configuration is data, and a new check is one registered function

The requirements say adding a fifth exercise is a data change, never a code change. The research repo's rules are Python functions doing geometry (trunk tilt in 3D, a knee offset ratio across a rep, profile-view guards), and two of its four state machines override behaviour in code. A database row can hold a threshold, a message, and a state name; it cannot hold a computation. So the promise is restated. An exercise row carries its state-machine thresholds and state names, and for each rule the threshold, the message per locale, the priority, the scope, the debounce frames, the highlight joints, and the name of the check to run. Checks live in a registry in the engine. An exercise built from existing checks is data only. A new check is one registered function, added to the registry, never an `if` on the exercise name anywhere in the app.

## Example

A fifth exercise, plank, with the rule "hips must not sag". If it can be written as "the shoulder, hip, ankle angle must stay above 160", the check the push-up body-alignment rule already uses, plank is a row. If it needs a computation nobody has written, someone writes and registers that one function, and the row refers to it by name.

## Consequences

- The four seeded exercises name only checks the research repo already implements. Since the export of 2026-10-04 (SeniorProject `2695984`) each rule's check has the rule's name: squat `partial_squat`, `knee_valgus`, `knee_varus`, `rounded_back`; push-up `hip_sag_or_pike`, `partial_pushup`; lunge `shallow_lunge`, `excessive_front_knee_flexion`, `forward_trunk_lean`, `straight_back_leg`; bicep curl `elbow_flare`, `partial_curl`. The plank example above is `hip_sag_or_pike`.
- Phase 2 proves the property by adding a fake fifth exercise as a row, rendering it, and removing it.
- The engine key column (ADR-0002) is what selects a state machine until the state machines are themselves data-driven, which is a port concern, not an app concern.

## Two limits found at the port, 2026-10-04

- The rep-scope accumulator is chosen by engine key, like the state machine, not by check. It is stateful per exercise: the lunge one tracks both knees' minima and a bottom window, the squat one averages the knee angle inside a depth band.
- A rep-scope check can only be reused where its accumulator produces the statistic the check reads. `partial_squat` reads `min_knee`, which only the squat accumulator writes. Frame-scope checks read the current frame and reuse freely, so the plank example works.

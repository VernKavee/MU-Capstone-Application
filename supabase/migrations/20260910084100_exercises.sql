-- Phase 2: the exercise catalogue as data (ADR-0006) and the empty expert motions table
-- (ADR-0007). Adding an exercise built from existing checks is an insert here, never code.

-- The shape every rule_based_logic value must have. Enforced at insert so a bad row fails
-- in the database rather than on the guide screen. Rule fields per ADR-0006: check name,
-- threshold, priority, scope, debounce, message per locale, highlight joints.
-- A missing key makes jsonb_typeof null, and a null passes a check constraint, so every
-- comparison is forced to true or false with `is true`.
create function public.exercise_logic_valid(logic jsonb) returns boolean
language sql immutable set search_path = '' as $$
  select (jsonb_typeof(logic->'state_machine'->'states') = 'array') is true
     and (jsonb_typeof(logic->'state_machine'->'thresholds') = 'object') is true
     and case when jsonb_typeof(logic->'rules') = 'array' then coalesce((
       select bool_and((
             jsonb_typeof(r->'name') = 'string'
         and jsonb_typeof(r->'check') = 'string'
         and jsonb_typeof(r->'threshold') = 'object'
         and jsonb_typeof(r->'priority') = 'number'
         and r->>'scope' in ('frame', 'rep')
         and jsonb_typeof(r->'debounce_frames') = 'number'
         and jsonb_typeof(r->'messages'->'en') = 'string'
         and jsonb_typeof(r->'highlight_joints') = 'array') is true)
       from jsonb_array_elements(logic->'rules') as r), true)
     else false end
$$;

-- Section 7 of the requirements: exercise_id, name, guide_text, thumbnail_url,
-- guide_video_url, rule_based_logic. The id is the URL slug; four rows do not need a uuid.
-- engine_key is the research repo's registry name (ADR-0002).
-- thumbnail_url and guide_video_url are null until the media exists; the UI shows a
-- placeholder for null.
create table public.exercises (
  id text primary key check (id ~ '^[a-z0-9-]{1,40}$'),
  name text not null check (length(name) between 1 and 60),
  sort_order smallint not null unique,
  guide_text text not null check (length(guide_text) between 1 and 4000),
  thumbnail_url text,
  guide_video_url text,
  engine_key text not null check (engine_key ~ '^[a-z0-9_]{1,60}$'),
  rule_based_logic jsonb not null check (public.exercise_logic_valid(rule_based_logic))
);

-- 1:1 with exercises, kept apart so listing exercises never drags the motion along.
-- Filled by Punnapat's component over a direct database connection (ADR-0007); the app
-- never reads it, so no app role gets any privilege on it.
create table public.expert_motions (
  exercise_id text primary key references public.exercises (id) on delete cascade,
  motion_data bytea not null,
  updated_at timestamptz not null default now()
);

alter table public.exercises enable row level security;
alter table public.expert_motions enable row level security;

create policy "exercises: readable when signed in" on public.exercises
  for select to authenticated using (true);

revoke all on public.exercises, public.expert_motions from anon, authenticated;
grant select on public.exercises to authenticated;

-- Seed. Numbers TYPED BY HAND from ~/Documents/SeniorProject at commit c5fc57c
-- (2026-09-07): src/fsm_counter/exercise_fsms.py for state_machine and
-- src/rule_based/form_rules.py for rules and RULE_HIGHLIGHT_JOINTS. Threshold keys under
-- state_machine mirror the Python attribute names so the export script of ADR-0002 can
-- replace this block. Messages are verbatim from the Python. Guide text is a first draft
-- by the build session and has not been reviewed by the physiotherapy experts.
insert into public.exercises (id, name, sort_order, guide_text, engine_key, rule_based_logic) values
('squat', 'Squat', 1,
 'Stand with your feet shoulder-width apart and toes turned slightly out, arms out in front or crossed at the chest. Sit the hips back and down until the thighs are at least parallel to the floor, keeping the chest up and the knees tracking over the toes, then drive back up to standing. Face the camera front-on or at a slight angle so both knees are visible, with your whole body in frame.',
 'squat',
 '{
   "source": "typed by hand from SeniorProject c5fc57c: SquatFSM, SQUAT_RULESET",
   "state_machine": {
     "states": ["Idle", "Concentric", "Inflection", "Eccentric"],
     "thresholds": {"thr_standing": 160, "thr_inflection": 120, "thr_descending": 150,
                    "hysteresis_buffer": 10, "consecutive_frames_req": 3, "start_frames_req": null},
     "arming": {"joints": ["hip", "knee", "ankle"], "ready_tilt_min": null, "ready_tilt_max": 30}
   },
   "rules": [
     {"name": "knee_depth", "check": "knee_depth", "priority": 1, "scope": "rep", "debounce_frames": 1,
      "threshold": {"depth_target": 100},
      "messages": {"en": "Lower to 90 degrees"},
      "highlight_joints": ["left_hip", "right_hip", "left_knee", "right_knee", "left_ankle", "right_ankle"]},
     {"name": "knee_valgus", "check": "knee_valgus", "priority": 2, "scope": "rep", "debounce_frames": 1,
      "threshold": {"inward_max": 0.0, "profile_ratio_min": 0.85},
      "messages": {"en": "Push knees out"},
      "highlight_joints": ["left_hip", "right_hip", "left_knee", "right_knee", "left_ankle", "right_ankle"]},
     {"name": "back_straight", "check": "back_straight", "priority": 3, "scope": "frame", "debounce_frames": 10,
      "threshold": {"tilt_max": 55},
      "messages": {"en": "Keep back straight"},
      "highlight_joints": ["left_shoulder", "right_shoulder", "left_hip", "right_hip"]}
   ]
 }'),
('push-up', 'Push-up', 2,
 'Start in a high plank with the hands under the shoulders and the body in one straight line from head to heels. Lower until the elbows bend well past 90 degrees and the chest is near the floor, keeping the hips level with the shoulders, then press back up to straight arms. Place the camera low and to your side so your whole body is in frame from head to feet.',
 'pushup',
 '{
   "source": "typed by hand from SeniorProject c5fc57c: PushUpFSM, PUSHUP_RULESET",
   "state_machine": {
     "states": ["Idle", "Concentric", "Inflection", "Eccentric"],
     "thresholds": {"thr_standing": 150, "thr_inflection": 110, "thr_descending": 140,
                    "hysteresis_buffer": 15, "consecutive_frames_req": 3, "start_frames_req": null},
     "arming": {"joints": ["shoulder", "elbow", "wrist"], "ready_tilt_min": 60, "ready_tilt_max": null}
   },
   "rules": [
     {"name": "body_alignment", "check": "body_alignment", "priority": 1, "scope": "frame", "debounce_frames": 10,
      "threshold": {"align_min": 160},
      "messages": {"en": "Body not straight"},
      "highlight_joints": ["left_shoulder", "right_shoulder", "left_hip", "right_hip", "left_knee", "right_knee", "left_ankle", "right_ankle"]},
     {"name": "elbow_depth", "check": "elbow_depth", "priority": 2, "scope": "rep", "debounce_frames": 1,
      "threshold": {"elbow_target": 110},
      "messages": {"en": "Lower Your Chest"},
      "highlight_joints": ["left_shoulder", "right_shoulder", "left_elbow", "right_elbow", "left_wrist", "right_wrist"]}
   ]
 }'),
('lunge', 'Lunge', 3,
 'Stand tall, step one foot forward, and lower straight down until the front knee is bent to about 80 degrees and the back knee drops toward the floor. Keep the torso upright, then push through the front heel back to standing. You may alternate legs. Place the camera to your side or at 45 degrees so the front knee is clear; a front-on view cannot judge how upright you are.',
 'lunge',
 '{
   "source": "typed by hand from SeniorProject c5fc57c: LungeFSM, LUNGE_RULESET",
   "state_machine": {
     "states": ["Idle", "Concentric", "Inflection", "Eccentric"],
     "thresholds": {"thr_standing": 155, "thr_inflection": 80, "thr_descending": 145,
                    "hysteresis_buffer": 12, "consecutive_frames_req": 3, "start_frames_req": 10},
     "arming": {"joints": ["hip", "knee", "ankle"], "ready_tilt_min": null, "ready_tilt_max": 30}
   },
   "rules": [
     {"name": "front_knee_depth", "check": "front_knee_depth", "priority": 1, "scope": "rep", "debounce_frames": 1,
      "threshold": {"front_target": 80},
      "messages": {"en": "Front knee over toes"},
      "highlight_joints": ["left_hip", "right_hip", "left_knee", "right_knee", "left_ankle", "right_ankle"]},
     {"name": "torso_upright", "check": "torso_upright", "priority": 2, "scope": "frame", "debounce_frames": 10,
      "threshold": {"tilt_max": 25},
      "messages": {"en": "Keep Torso Upright"},
      "highlight_joints": ["left_shoulder", "right_shoulder", "left_hip", "right_hip"]},
     {"name": "back_knee_form", "check": "back_knee_form", "priority": 3, "scope": "rep", "debounce_frames": 1,
      "threshold": {"back_max_min": 135, "back_max_min_profile": 140, "profile_ratio_min": 0.85},
      "messages": {"en": "Bend your back knee toward the floor"},
      "highlight_joints": ["left_hip", "right_hip", "left_knee", "right_knee", "left_ankle", "right_ankle"]}
   ]
 }'),
('bicep-curl', 'Bicep curl', 4,
 'Stand with a dumbbell in each hand, arms straight, elbows pinned to your sides. Curl the weight until the elbow is fully bent, then lower all the way back to a straight arm before the next rep. Keep the elbow still and do not swing the shoulder. Face the camera, or turn side-on with the working arm nearest the camera.',
 'dumbbell_biceps_curls',
 '{
   "source": "typed by hand from SeniorProject c5fc57c: BicepCurlFSM, BICEP_CURL_RULESET",
   "state_machine": {
     "states": ["Idle", "Concentric", "Inflection", "Eccentric"],
     "thresholds": {"thr_standing": 155, "thr_inflection": 55, "thr_descending": 140,
                    "hysteresis_buffer": 15, "consecutive_frames_req": 3, "start_frames_req": null,
                    "start_descent_delta": 25, "min_side_score": 0.3},
     "arming": null
   },
   "rules": [
     {"name": "full_rom", "check": "full_rom", "priority": 1, "scope": "rep", "debounce_frames": 1,
      "threshold": {"flex_target": 55, "ext_target": 145},
      "messages": {"en": "Full range of motion"},
      "highlight_joints": ["left_shoulder", "right_shoulder", "left_elbow", "right_elbow", "left_wrist", "right_wrist"]},
     {"name": "elbow_fixed", "check": "elbow_fixed", "priority": 2, "scope": "frame", "debounce_frames": 10,
      "threshold": {"drift_max": 0.10},
      "messages": {"en": "Keep Elbows Fixed"},
      "highlight_joints": ["left_shoulder", "right_shoulder", "left_elbow", "right_elbow", "left_hip", "right_hip"]}
   ]
 }');

-- Run with `npm run test:db`. The catalogue is readable by signed-in users only, never
-- writable through the API, and expert motions are unreachable through the API.
begin;
select plan(9);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is((select count(*) from public.exercises), 4::bigint, 'a signed-in user sees the four exercises');
select is((select string_agg(id, ',' order by sort_order) from public.exercises),
  'squat,push-up,lunge,bicep-curl', 'in the order the requirements list them');
select throws_ok(
  $$ insert into public.exercises (id, name, sort_order, guide_text, engine_key, rule_based_logic)
     values ('x', 'X', 9, 'x', 'x', '{"state_machine":{"states":[],"thresholds":{}},"rules":[]}') $$,
  '42501', null, 'the catalogue cannot be extended through the API');
select throws_ok($$ update public.exercises set name = 'x' $$, '42501', null, 'nor edited');
select throws_ok($$ delete from public.exercises $$, '42501', null, 'nor deleted');
select throws_ok($$ select count(*) from public.expert_motions $$, '42501', null,
  'expert motions are not reachable through the API');

reset role;
set local role anon;
select throws_ok($$ select count(*) from public.exercises $$, '42501', null,
  'a signed-out visitor cannot read the catalogue');
reset role;

-- The shape constraint: a rule needs a check, a threshold, a priority, a scope, a
-- debounce, an English message, and highlight joints.
select throws_ok(
  $$ insert into public.exercises (id, name, sort_order, guide_text, engine_key, rule_based_logic)
     values ('bad', 'Bad', 8, 'x', 'bad', '{"state_machine":{"states":[],"thresholds":{}},
       "rules":[{"name":"r","check":"body_alignment","threshold":{"align_min":160},"priority":1,
                 "scope":"frame","debounce_frames":10,"messages":{},"highlight_joints":[]}]}') $$,
  '23514', null, 'a rule without an English message is rejected');
select lives_ok(
  $$ insert into public.exercises (id, name, sort_order, guide_text, engine_key, rule_based_logic)
     values ('plank', 'Plank', 9, 'Hold a straight line.', 'plank', '{"state_machine":{"states":["Idle"],"thresholds":{}},
       "rules":[{"name":"hip_sag","check":"body_alignment","threshold":{"align_min":160},"priority":1,
                 "scope":"frame","debounce_frames":10,"messages":{"en":"Lift your hips"},"highlight_joints":["left_hip","right_hip"]}]}') $$,
  'a fifth exercise built from an existing check is one row');

select * from finish();
rollback;

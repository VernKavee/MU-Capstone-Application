-- Run with `npm run test:db`. Workouts and sets reach only their owner, updates are
-- limited to the columns the app writes after saving, nothing is deleted, and the sets
-- bucket is one folder per user. User A tries to read B's workout, its sets, and its
-- files by id, and gets nothing.
begin;
select plan(22);

insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local'),
       ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local');

insert into public.workouts (id, user_id, exercise_id, target_reps, target_sets, rest_seconds)
values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'squat', 10, 3, 60),
       ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000002', 'lunge', 8, 2, 30);
insert into public.sets (id, workout_id, set_no, kind, ended_by, started_at, ended_at, totals, attempts, engine_report, engine_version)
values ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 1, 'initial', 'target_reached', now(), now(),
        '{"attempts":12,"completed_reps":11,"correct_reps":10,"abandoned_attempts":1}', '[]', '{"schema_version":4}', 'stub'),
       ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 1, 'initial', 'user_ended', now(), now(),
        '{"attempts":3,"completed_reps":3,"correct_reps":3,"abandoned_attempts":0}', '[]', '{"schema_version":4}', 'stub');
-- B's video, stored as the storage service would store it.
insert into storage.objects (bucket_id, name)
values ('sets', '00000000-0000-0000-0000-000000000002/20000000-0000-0000-0000-000000000002/video.webm');

-- Act as user A.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is((select count(*) from public.workouts), 1::bigint, 'A sees exactly one workout');
select is((select count(*) from public.sets), 1::bigint, 'and exactly one set');
select is((select exercise_id from public.workouts), 'squat', 'and it is their own');
select is((select count(*) from public.workouts where id = '10000000-0000-0000-0000-000000000002'), 0::bigint,
  'A cannot read B''s workout by its id');
select is((select count(*) from public.sets where workout_id = '10000000-0000-0000-0000-000000000002'), 0::bigint,
  'nor its sets');

select throws_ok(
  $$ insert into public.workouts (user_id, exercise_id, target_reps, target_sets, rest_seconds)
     values ('00000000-0000-0000-0000-000000000002', 'squat', 10, 3, 60) $$,
  '42501', null, 'A cannot start a workout for B');
select throws_ok(
  $$ insert into public.sets (workout_id, set_no, kind, ended_by, started_at, ended_at, totals, attempts, engine_report, engine_version)
     values ('10000000-0000-0000-0000-000000000002', 2, 'initial', 'user_ended', now(), now(), '{}', '[]', '{}', 'stub') $$,
  '42501', null, 'A cannot attach a set to B''s workout');
select lives_ok(
  $$ insert into public.sets (workout_id, set_no, kind, ended_by, started_at, ended_at, totals, attempts, engine_report, engine_version)
     values ('10000000-0000-0000-0000-000000000001', 1, 'repair', 'attempt_cap', now(), now(), '{}', '[]', '{}', 'stub') $$,
  'a repair set shares its set number with the set it repairs');
select throws_ok(
  $$ insert into public.sets (workout_id, set_no, kind, ended_by, started_at, ended_at, totals, attempts, engine_report, engine_version)
     values ('10000000-0000-0000-0000-000000000001', 1, 'repair', 'attempt_cap', now(), now(), '{}', '[]', '{}', 'stub') $$,
  '23505', null, 'but only one repair set per set');

select lives_ok(
  $$ update public.sets set similarity = '{"overall":90}', llm_feedback = 'Good', repair_declined = true,
       keypoints_url = 'x/keypoints.json.gz', video_url = 'x/video.webm', attempts = '[{"attempt_no":1}]'
     where id = '20000000-0000-0000-0000-000000000001' $$,
  'the analyse step and the uploads write their columns');
select lives_ok(
  $$ update public.sets set llm_feedback = 'overwritten' where id = '20000000-0000-0000-0000-000000000002' $$,
  'an update aimed at B''s set is filtered, not errored');
select throws_ok(
  $$ update public.sets set engine_report = '{}' where id = '20000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'the engine report is never rewritten');
select throws_ok(
  $$ update public.sets set totals = '{}' where id = '20000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'nor the totals');
select lives_ok(
  $$ update public.workouts set ended_at = now() where id = '10000000-0000-0000-0000-000000000001' $$,
  'a workout can be ended');
select throws_ok(
  $$ update public.workouts set target_reps = 1 where id = '10000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'but its setup is fixed');
select throws_ok($$ delete from public.sets $$, '42501', null, 'sets are never deleted through the API');
select throws_ok($$ delete from public.workouts $$, '42501', null, 'nor workouts');

-- The bucket: one folder per user.
select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('sets', '00000000-0000-0000-0000-000000000001/20000000-0000-0000-0000-000000000001/video.webm') $$,
  'A can upload into their own folder');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('sets', '00000000-0000-0000-0000-000000000002/20000000-0000-0000-0000-000000000002/video.webm') $$,
  '42501', null, 'but not into B''s');
select is((select count(*) from storage.objects where bucket_id = 'sets'), 1::bigint, 'A lists only their own file');
select is((select count(*) from storage.objects where name like '00000000-0000-0000-0000-000000000002/%'), 0::bigint,
  'and cannot read B''s video');

reset role;
select is((select llm_feedback from public.sets where id = '20000000-0000-0000-0000-000000000002'), null::text,
  'B''s set is unchanged');

select * from finish();
rollback;

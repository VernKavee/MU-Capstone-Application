-- Run with `npx supabase test db`. Proves a user can only reach their own rows.
begin;
select plan(10);

insert into auth.users (id, instance_id, aud, role, email)
values ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'a@test.local'),
       ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'b@test.local');

insert into public.profiles (user_id, display_name, age, gender, weight_kg, height_cm, medical_history)
values ('00000000-0000-0000-0000-000000000001', 'A', 30, 'female', 60, 165, 'none'),
       ('00000000-0000-0000-0000-000000000002', 'B', 31, 'male', 70, 175, 'broken leg 2024');
insert into public.consents (user_id, kind, version)
values ('00000000-0000-0000-0000-000000000001', 'camera', 1),
       ('00000000-0000-0000-0000-000000000002', 'camera', 1);

-- Act as user A.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000001","role":"authenticated"}', true);

select is((select count(*) from public.profiles), 1::bigint, 'A sees exactly one profile');
select is((select display_name from public.profiles), 'A', 'and it is their own');
select is((select count(*) from public.consents), 1::bigint, 'A sees only their own consents');

select lives_ok(
  $$ update public.profiles set display_name = 'hacked' where user_id = '00000000-0000-0000-0000-000000000002' $$,
  'an update aimed at B''s profile is filtered, not errored');
select throws_ok(
  $$ update public.profiles set user_id = '00000000-0000-0000-0000-000000000002' where user_id = '00000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'A cannot reassign their profile to B');
select throws_ok(
  $$ insert into public.consents (user_id, kind, version) values ('00000000-0000-0000-0000-000000000002', 'profile', 1) $$,
  '42501', null, 'A cannot record a consent for B');
select throws_ok(
  $$ delete from public.profiles where user_id = '00000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'nobody deletes a profile through the API');
select throws_ok(
  $$ update public.consents set version = 2 where user_id = '00000000-0000-0000-0000-000000000001' $$,
  '42501', null, 'consents are insert only');
select throws_ok(
  $$ insert into public.profiles (user_id, display_name, age, gender, weight_kg, height_cm, medical_history)
     values ('00000000-0000-0000-0000-000000000001', 'A', 30, 'female', 60, 165, '') $$,
  '23514', null, 'medical history cannot be empty');

reset role;
select is((select display_name from public.profiles where user_id = '00000000-0000-0000-0000-000000000002'), 'B', 'and B''s profile is unchanged');

select * from finish();
rollback;

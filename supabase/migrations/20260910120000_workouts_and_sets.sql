-- Phase 4: workouts own sets (ADR-0004). A set stores one merged record per attempt and
-- the engine's report verbatim (ADR-0003), the storage paths of its two files (ADR-0005),
-- and the similarity and feedback written after it is saved (ADR-0007), so both are null
-- until the analyse step has run.

-- One choice of exercise, rep target, set count, and rest length. Created when its first
-- set is saved, so an abandoned setup leaves no row. ended_at is null while the workout
-- is in progress and stays null if the user walks away.
create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  exercise_id text not null references public.exercises (id),
  target_reps integer not null check (target_reps between 1 and 100),
  target_sets integer not null check (target_sets between 1 and 10),
  rest_seconds integer not null check (rest_seconds between 0 and 600),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  check (ended_at is null or ended_at >= started_at)
);
create index workouts_user_started_at on public.workouts (user_id, started_at desc);

-- One continuous stretch of attempts at the target. The repair set has the same set_no
-- as the set it repairs and kind 'repair'. repair_declined is recorded on the initial set.
-- totals: attempts, completed_reps, correct_reps, abandoned_attempts.
-- attempts: ADR-0003 records in order. engine_report: schema version 4, verbatim.
-- keypoints_url and video_url are object paths in the 'sets' bucket, null if the upload
-- failed; the set itself is never lost over a file.
create table public.sets (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.workouts (id) on delete cascade,
  set_no integer not null check (set_no between 1 and 10),
  kind text not null check (kind in ('initial', 'repair')),
  ended_by text not null check (ended_by in ('target_reached', 'user_ended', 'attempt_cap')),
  repair_declined boolean not null default false,
  started_at timestamptz not null,
  ended_at timestamptz not null check (ended_at >= started_at),
  totals jsonb not null check (jsonb_typeof(totals) = 'object'),
  attempts jsonb not null check (jsonb_typeof(attempts) = 'array'),
  engine_report jsonb not null check (jsonb_typeof(engine_report) = 'object'),
  engine_version text not null check (length(engine_version) between 1 and 60),
  keypoints_url text,
  video_url text,
  similarity jsonb check (similarity is null or jsonb_typeof(similarity) = 'object'),
  llm_feedback text,
  created_at timestamptz not null default now(),
  unique (workout_id, set_no, kind)
);

alter table public.workouts enable row level security;
alter table public.sets enable row level security;

create policy "workouts: own rows" on public.workouts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "workouts: insert own rows" on public.workouts
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "workouts: update own rows" on public.workouts
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- A set belongs to the user through its workout. The check on insert and update stops a
-- set from being attached to someone else's workout.
create function public.owns_workout(workout uuid) returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists (select 1 from public.workouts w where w.id = workout and w.user_id = (select auth.uid()))
$$;

create policy "sets: own rows" on public.sets
  for select to authenticated using (public.owns_workout(workout_id));
create policy "sets: insert own rows" on public.sets
  for insert to authenticated with check (public.owns_workout(workout_id));
create policy "sets: update own rows" on public.sets
  for update to authenticated
  using (public.owns_workout(workout_id))
  with check (public.owns_workout(workout_id));

-- No delete anywhere: data is kept until the project ends (ADR-0005). Updates are limited
-- to the columns the app writes after the row exists: the workout's end, the decline,
-- the file paths once uploaded, and the analyse step's outputs.
revoke all on public.workouts, public.sets from anon, authenticated;
grant select, insert on public.workouts to authenticated;
grant update (ended_at) on public.workouts to authenticated;
grant select, insert on public.sets to authenticated;
grant update (repair_declined, keypoints_url, video_url, similarity, llm_feedback, attempts) on public.sets to authenticated;

-- The two files of a set (ADR-0005) live in one private bucket under
-- <user_id>/<set_id>/video.<ext> and <user_id>/<set_id>/keypoints.json.gz. Uploads go
-- from the browser straight to storage through a signed upload URL (NFR3); the policies
-- below are what that signature is checked against. Update exists only so a retried
-- upload can overwrite a half-written object. No delete.
insert into storage.buckets (id, name, public) values ('sets', 'sets', false);

create policy "sets bucket: read own folder" on storage.objects
  for select to authenticated
  using (bucket_id = 'sets' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "sets bucket: upload to own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'sets' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "sets bucket: overwrite own folder" on storage.objects
  for update to authenticated
  using (bucket_id = 'sets' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'sets' and (storage.foldername(name))[1] = (select auth.uid())::text);

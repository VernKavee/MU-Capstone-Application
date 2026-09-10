-- Phase 1 foundation: pgvector, the user's profile, and PDPA consent.
-- Per-user access control is enforced here with row-level security (NFR2).

create extension if not exists vector with schema extensions;

-- FR1. One row per auth user, created when the user completes the profile form.
-- Every column is required: a row existing means the profile is complete.
create table public.profiles (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null check (length(display_name) between 1 and 80),
  age integer not null check (age between 10 and 120),
  gender text not null check (gender in ('female', 'male', 'other')),
  weight_kg numeric(5, 1) not null check (weight_kg between 20 and 400),
  height_cm numeric(4, 1) not null check (height_cm between 100 and 250),
  -- Feeds the LLM so advice is safe. "none" is a valid answer; empty is not.
  medical_history text not null check (length(medical_history) between 1 and 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- NFR4. Three separate consents, each recorded with version and time. Insert only.
create table public.consents (
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null check (kind in ('camera', 'recording', 'profile')),
  version integer not null check (version > 0),
  granted_at timestamptz not null default now(),
  primary key (user_id, kind, version)
);

alter table public.profiles enable row level security;
alter table public.consents enable row level security;

create policy "profiles: own row" on public.profiles
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "profiles: insert own row" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "profiles: update own row" on public.profiles
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "consents: own rows" on public.consents
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "consents: insert own rows" on public.consents
  for insert to authenticated with check ((select auth.uid()) = user_id);

-- No delete on either table: data is kept until the project ends (ADR-0005).
-- No update on consents: a consent is a fact with a time, not a setting.
-- Supabase's default privileges grant everything on new public tables to anon and
-- authenticated. Revoke and grant only what the app uses, so a missing policy fails
-- loudly with a privilege error instead of silently touching zero rows.
revoke all on public.profiles, public.consents from anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select, insert on public.consents to authenticated;

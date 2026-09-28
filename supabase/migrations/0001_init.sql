-- VozLook InterviewAI — Supabase schema (production mode)
-- Mirrors server/src/db/schema.ts. Run in the Supabase SQL editor or via `supabase db push`.
--
-- Notes
--  * The Express backend talks to Postgres with the service-role key (server-side only).
--  * Row Level Security is enabled on every table so that even direct PostgREST/anon access
--    (for example from the browser using the anon key) can only ever read or write the
--    signed-in user's own rows.

create extension if not exists "pgcrypto";

/* ------------------------------- core tables ------------------------------- */

-- Local (email + password) accounts created by the backend. Accounts created through
-- Supabase Auth reuse auth.users.id as users.id and are mirrored here automatically.
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  password_hash text not null default '',
  auth_provider text not null default 'password',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.password_resets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  token_hash text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users(id) on delete cascade,
  full_name text,
  email text,
  avatar_url text,
  target_role text,
  company text,
  experience_level text,
  preferred_mode text,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.resumes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  file_name text,
  file_url text,
  mime_type text,
  size_bytes bigint,
  extracted_text text,
  parsed_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.job_descriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text,
  company text,
  description text,
  parsed_requirements jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.interviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  resume_id uuid references public.resumes(id) on delete set null,
  job_description_id uuid references public.job_descriptions(id) on delete set null,
  job_role text not null,
  interview_type text not null,
  difficulty text not null,
  interview_mode text not null,
  question_count integer not null default 10,
  settings jsonb,
  status text not null default 'created',
  current_question_id uuid,
  started_at timestamptz,
  completed_at timestamptz,
  overall_score numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.interview_questions (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null references public.interviews(id) on delete cascade,
  question_number integer not null,
  question text not null,
  question_type text not null,
  difficulty text not null,
  expected_topics jsonb,
  resume_anchor text,
  is_follow_up boolean not null default false,
  parent_question_id uuid,
  created_at timestamptz not null default now()
);

create table if not exists public.interview_answers (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null unique references public.interview_questions(id) on delete cascade,
  interview_id uuid not null references public.interviews(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  answer_text text,
  audio_url text,
  video_url text,
  duration_seconds numeric,
  media_metrics jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.answer_evaluations (
  id uuid primary key default gen_random_uuid(),
  answer_id uuid not null references public.interview_answers(id) on delete cascade,
  interview_id uuid not null references public.interviews(id) on delete cascade,
  relevance_score numeric,
  technical_score numeric,
  completeness_score numeric,
  clarity_score numeric,
  structure_score numeric,
  communication_score numeric,
  problem_solving_score numeric,
  confidence_score numeric,
  coverage jsonb,
  feedback text,
  strengths jsonb,
  improvements jsonb,
  signals jsonb,
  engine text,
  created_at timestamptz not null default now()
);

create table if not exists public.interview_reports (
  id uuid primary key default gen_random_uuid(),
  interview_id uuid not null unique references public.interviews(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  overall_score numeric,
  technical_score numeric,
  communication_score numeric,
  problem_solving_score numeric,
  relevance_score numeric,
  confidence_score numeric,
  role_alignment_score numeric,
  summary text,
  strengths jsonb,
  weaknesses jsonb,
  recommendations jsonb,
  improvement_plan jsonb,
  recommended_topics jsonb,
  question_reviews jsonb,
  scoring_methodology jsonb,
  report_json jsonb,
  engine text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.interview_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  interview_id uuid not null references public.interviews(id) on delete cascade,
  metric_name text not null,
  metric_value numeric not null,
  created_at timestamptz not null default now()
);

/* --------------------------------- indexes -------------------------------- */

create index if not exists idx_resumes_user on public.resumes(user_id, created_at desc);
create index if not exists idx_jobs_user on public.job_descriptions(user_id, created_at desc);
create index if not exists idx_interviews_user on public.interviews(user_id, created_at desc);
create index if not exists idx_questions_interview on public.interview_questions(interview_id, question_number);
create index if not exists idx_answers_interview on public.interview_answers(interview_id);
create index if not exists idx_evaluations_interview on public.answer_evaluations(interview_id);
create index if not exists idx_progress_user on public.interview_progress(user_id, created_at);

/* ------------------------------ updated_at -------------------------------- */

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['users','profiles','resumes','job_descriptions','interviews','interview_reports']
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', t);
    execute format('create trigger set_updated_at before update on public.%I for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;

/* -------------------------------- RLS setup ------------------------------- */

-- The authenticated Supabase user id. Falls back to NULL when unauthenticated, which makes
-- every policy below evaluate to false.
create or replace function public.current_user_id() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

alter table public.users              enable row level security;
alter table public.password_resets    enable row level security;
alter table public.profiles           enable row level security;
alter table public.resumes            enable row level security;
alter table public.job_descriptions   enable row level security;
alter table public.interviews         enable row level security;
alter table public.interview_questions enable row level security;
alter table public.interview_answers  enable row level security;
alter table public.answer_evaluations enable row level security;
alter table public.interview_reports  enable row level security;
alter table public.interview_progress enable row level security;

-- users: a signed-in user may read/update only their own account row.
drop policy if exists users_select_own on public.users;
create policy users_select_own on public.users for select using (id = public.current_user_id());

drop policy if exists users_update_own on public.users;
create policy users_update_own on public.users for update using (id = public.current_user_id()) with check (id = public.current_user_id());

-- password_resets: never exposed to clients. Only the service role (backend) may touch it.
drop policy if exists password_resets_none on public.password_resets;
create policy password_resets_none on public.password_resets for select using (false);

-- profiles
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles for select using (user_id = public.current_user_id());
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles for insert with check (user_id = public.current_user_id());
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles for update using (user_id = public.current_user_id()) with check (user_id = public.current_user_id());
drop policy if exists profiles_delete_own on public.profiles;
create policy profiles_delete_own on public.profiles for delete using (user_id = public.current_user_id());

-- resumes
drop policy if exists resumes_own on public.resumes;
create policy resumes_own on public.resumes for all using (user_id = public.current_user_id()) with check (user_id = public.current_user_id());

-- job_descriptions
drop policy if exists jobs_own on public.job_descriptions;
create policy jobs_own on public.job_descriptions for all using (user_id = public.current_user_id()) with check (user_id = public.current_user_id());

-- interviews
drop policy if exists interviews_own on public.interviews;
create policy interviews_own on public.interviews for all using (user_id = public.current_user_id()) with check (user_id = public.current_user_id());

-- interview_progress
drop policy if exists progress_own on public.interview_progress;
create policy progress_own on public.interview_progress for all using (user_id = public.current_user_id()) with check (user_id = public.current_user_id());

-- interview_reports
drop policy if exists reports_own on public.interview_reports;
create policy reports_own on public.interview_reports for all using (user_id = public.current_user_id()) with check (user_id = public.current_user_id());

-- child tables: ownership is derived from the parent interview (never trusted from the client).
drop policy if exists questions_via_interview on public.interview_questions;
create policy questions_via_interview on public.interview_questions for all
  using (exists (select 1 from public.interviews i where i.id = interview_id and i.user_id = public.current_user_id()))
  with check (exists (select 1 from public.interviews i where i.id = interview_id and i.user_id = public.current_user_id()));

drop policy if exists answers_via_interview on public.interview_answers;
create policy answers_via_interview on public.interview_answers for all
  using (exists (select 1 from public.interviews i where i.id = interview_id and i.user_id = public.current_user_id()))
  with check (
    user_id = public.current_user_id()
    and exists (select 1 from public.interviews i where i.id = interview_id and i.user_id = public.current_user_id())
  );

drop policy if exists evaluations_via_interview on public.answer_evaluations;
create policy evaluations_via_interview on public.answer_evaluations for all
  using (exists (select 1 from public.interviews i where i.id = interview_id and i.user_id = public.current_user_id()))
  with check (exists (select 1 from public.interviews i where i.id = interview_id and i.user_id = public.current_user_id()));

/* ------------------------------ storage policies --------------------------- */

insert into storage.buckets (id, name, public, file_size_limit)
values ('resumes', 'resumes', false, 10485760), ('media', 'media', false, 10485760)
on conflict (id) do nothing;

drop policy if exists storage_own_folder_select on storage.objects;
create policy storage_own_folder_select on storage.objects for select
  using (bucket_id in ('resumes', 'media') and (storage.foldername(name))[1] = public.current_user_id()::text);

drop policy if exists storage_own_folder_insert on storage.objects;
create policy storage_own_folder_insert on storage.objects for insert
  with check (bucket_id in ('resumes', 'media') and (storage.foldername(name))[1] = public.current_user_id()::text);

drop policy if exists storage_own_folder_update on storage.objects;
create policy storage_own_folder_update on storage.objects for update
  using (bucket_id in ('resumes', 'media') and (storage.foldername(name))[1] = public.current_user_id()::text);

drop policy if exists storage_own_folder_delete on storage.objects;
create policy storage_own_folder_delete on storage.objects for delete
  using (bucket_id in ('resumes', 'media') and (storage.foldername(name))[1] = public.current_user_id()::text);

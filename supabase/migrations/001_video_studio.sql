-- Jimmy AI Video Studio - Supabase schema
-- Run this migration in the Supabase SQL editor or via Supabase CLI.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  credits integer not null default 1000 check (credits >= 0),
  monthly_quota_credits integer not null default 5000 check (monthly_quota_credits >= 0),
  monthly_used_credits integer not null default 0 check (monthly_used_credits >= 0),
  quota_period_start date not null default date_trunc('month', now())::date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  parent_generation_id uuid references public.generations(id) on delete set null,
  prompt text not null,
  mode text not null default 'text-to-video'
    check (mode in ('text-to-video','image-to-video','interpolation','reference','extend')),
  model_tier text not null
    check (model_tier in ('standard','fast','lite')),
  model_id text not null,
  status text not null default 'draft'
    check (status in ('draft','queued','processing','completed','failed')),
  operation_name text unique,
  aspect_ratio text not null check (aspect_ratio in ('16:9','9:16')),
  duration_seconds integer not null,
  resolution text not null check (resolution in ('720p','1080p','4k')),
  credits_reserved integer not null default 0 check (credits_reserved >= 0),
  provider_video_uri text,
  video_storage_path text,
  source_storage_path text,
  last_frame_storage_path text,
  reference_storage_paths text[] not null default '{}',
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  generation_id uuid references public.generations(id) on delete set null,
  amount integer not null,
  reason text not null,
  created_at timestamptz not null default now()
);

create index if not exists projects_user_id_idx on public.projects(user_id);
create index if not exists generations_user_id_created_idx
  on public.generations(user_id, created_at desc);
create index if not exists generations_project_id_idx on public.generations(project_id);
create index if not exists credit_ledger_user_id_created_idx
  on public.credit_ledger(user_id, created_at desc);

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.generations enable row level security;
alter table public.credit_ledger enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select
to authenticated
using (id = auth.uid());

drop policy if exists "projects_all_own" on public.projects;
create policy "projects_all_own"
on public.projects for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "generations_all_own" on public.generations;
create policy "generations_all_own"
on public.generations for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "credit_ledger_select_own" on public.credit_ledger;
create policy "credit_ledger_select_own"
on public.credit_ledger for select
to authenticated
using (user_id = auth.uid());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles(id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();

create or replace function public.reserve_generation_credits(
  p_generation_id uuid,
  p_amount integer
)
returns table(credits integer, monthly_used_credits integer, monthly_quota_credits integer)
language plpgsql
security definer set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_generation public.generations%rowtype;
begin
  if p_amount <= 0 then
    raise exception 'INVALID_CREDIT_AMOUNT';
  end if;

  select * into v_generation
  from public.generations
  where id = p_generation_id and user_id = auth.uid()
  for update;

  if not found then
    raise exception 'GENERATION_NOT_FOUND';
  end if;

  select * into v_profile
  from public.profiles
  where id = auth.uid()
  for update;

  if not found then
    raise exception 'PROFILE_NOT_FOUND';
  end if;

  if v_profile.quota_period_start < date_trunc('month', now())::date then
    update public.profiles
    set monthly_used_credits = 0,
        quota_period_start = date_trunc('month', now())::date,
        updated_at = now()
    where id = auth.uid()
    returning * into v_profile;
  end if;

  if v_profile.credits < p_amount then
    raise exception 'INSUFFICIENT_CREDITS';
  end if;

  if v_profile.monthly_used_credits + p_amount > v_profile.monthly_quota_credits then
    raise exception 'MONTHLY_QUOTA_EXCEEDED';
  end if;

  update public.profiles
  set credits = profiles.credits - p_amount,
      monthly_used_credits = profiles.monthly_used_credits + p_amount,
      updated_at = now()
  where id = auth.uid()
  returning * into v_profile;

  update public.generations
  set credits_reserved = p_amount,
      updated_at = now()
  where id = p_generation_id;

  insert into public.credit_ledger(user_id, generation_id, amount, reason)
  values(auth.uid(), p_generation_id, -p_amount, 'generation_reservation');

  return query
  select v_profile.credits, v_profile.monthly_used_credits, v_profile.monthly_quota_credits;
end;
$$;

create or replace function public.refund_generation_credits(p_generation_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_amount integer;
begin
  select credits_reserved into v_amount
  from public.generations
  where id = p_generation_id and user_id = auth.uid()
  for update;

  if not found or coalesce(v_amount, 0) = 0 then
    return;
  end if;

  update public.profiles
  set credits = credits + v_amount,
      monthly_used_credits = greatest(0, monthly_used_credits - v_amount),
      updated_at = now()
  where id = auth.uid();

  update public.generations
  set credits_reserved = 0,
      updated_at = now()
  where id = p_generation_id;

  insert into public.credit_ledger(user_id, generation_id, amount, reason)
  values(auth.uid(), p_generation_id, v_amount, 'generation_refund');
end;
$$;

grant execute on function public.reserve_generation_credits(uuid, integer) to authenticated;
grant execute on function public.refund_generation_credits(uuid) to authenticated;

insert into storage.buckets(id, name, public)
values ('video-assets', 'video-assets', false)
on conflict (id) do update set public = false;

drop policy if exists "video_assets_select_own" on storage.objects;
create policy "video_assets_select_own"
on storage.objects for select
to authenticated
using (
  bucket_id = 'video-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "video_assets_insert_own" on storage.objects;
create policy "video_assets_insert_own"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'video-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "video_assets_delete_own" on storage.objects;
create policy "video_assets_delete_own"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'video-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
);


-- Backfill profiles if Auth already had users before this migration.
insert into public.profiles(id)
select id from auth.users
on conflict (id) do nothing;

drop policy if exists "video_assets_update_own" on storage.objects;
create policy "video_assets_update_own"
on storage.objects for update
to authenticated
using (
  bucket_id = 'video-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'video-assets'
  and (storage.foldername(name))[1] = auth.uid()::text
);

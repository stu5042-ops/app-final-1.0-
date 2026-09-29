-- My Dashboard + Supabase schema (idempotent)
-- Safe to re-run from the SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.schools (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text,
  region text,
  homepage_url text,
  meal_url text not null,
  schedule_url text not null,
  notice_url text not null,
  latitude double precision,
  longitude double precision,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The old version used a partial unique index here. PostgreSQL cannot infer
-- that partial index from ON CONFLICT (code), which caused 42P10.
drop index if exists public.schools_code_unique;
create unique index if not exists schools_code_unique on public.schools(code);
create index if not exists schools_active_idx on public.schools(active);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  school_id uuid references public.schools(id) on delete set null,
  theme text not null default 'light' check (theme in ('light','dark')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists profiles_school_idx on public.profiles(school_id);

create table if not exists public.schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  date date not null,
  end_date date,
  start_time time,
  end_time time,
  description text,
  color text not null default 'indigo',
  is_checklist boolean not null default false,
  completed boolean not null default false,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
create index if not exists schedules_user_date_idx on public.schedules(user_id, date);

create table if not exists public.homework (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  date date not null,
  subject text,
  type text not null default '숙제',
  notes text,
  completed boolean not null default false,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
create index if not exists homework_user_date_idx on public.homework(user_id, date);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '새 노트',
  content text not null default '',
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
create index if not exists notes_user_updated_idx on public.notes(user_id, updated_date desc);

create table if not exists public.timetables (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  day text not null,
  period integer not null,
  start_time time,
  end_time time,
  subject text,
  detail text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  unique(user_id, day, period)
);
create index if not exists timetables_user_created_idx on public.timetables(user_id, created_date desc);

create table if not exists public.bookmark_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  parent_id uuid references public.bookmark_folders(id) on delete set null,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
create index if not exists bookmark_folders_user_idx on public.bookmark_folders(user_id);

create table if not exists public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  url text not null,
  folder_id uuid references public.bookmark_folders(id) on delete set null,
  icon_url text,
  "order" bigint not null default 0,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);
create index if not exists bookmarks_user_created_idx on public.bookmarks(user_id, created_date desc);
create index if not exists bookmarks_folder_idx on public.bookmarks(user_id, folder_id);

create table if not exists public.school_schedules (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  source_key text not null,
  title text not null,
  date date not null,
  end_date date,
  start_time time,
  end_time time,
  description text,
  source_url text,
  fetched_at timestamptz not null default now(),
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique(school_id, source_key)
);
create index if not exists school_schedules_school_date_idx on public.school_schedules(school_id, date);
create index if not exists school_schedules_active_idx on public.school_schedules(school_id, active, date);

create table if not exists public.school_event_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  school_schedule_id uuid not null references public.school_schedules(id) on delete cascade,
  title text,
  date date,
  end_date date,
  start_time time,
  end_time time,
  description text,
  color text not null default 'emerald',
  deleted boolean not null default false,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  unique(user_id, school_schedule_id)
);
create index if not exists school_event_overrides_user_idx on public.school_event_overrides(user_id);

create table if not exists public.school_meals (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  meal_date date not null,
  breakfast text,
  lunch text,
  dinner text,
  snack text,
  fetched_at timestamptz not null default now(),
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique(school_id, meal_date)
);
create index if not exists school_meals_school_date_idx on public.school_meals(school_id, meal_date);

create table if not exists public.school_notices (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id) on delete cascade,
  source_key text not null,
  title text not null,
  link text not null,
  notice_date date,
  fetched_at timestamptz not null default now(),
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  unique(school_id, source_key)
);
create index if not exists school_notices_school_date_idx on public.school_notices(school_id, notice_date desc);

-- Default school used by the original dashboard's school pages.
insert into public.schools (
  name, code, region, homepage_url, meal_url, schedule_url, notice_url, latitude, longitude, active
) values (
  'GVCS-음성캠퍼스',
  'GVCS-EUMSEONG',
  '충청북도 음성군 원남면',
  'https://gvcs-es.org/',
  'https://www.gvcs-es.org/CST/CST0400/CST0401S.aspx?MENU_ID=44',
  'https://www.gvcs-es.org/CMN/CMN0400/CMN0412S.aspx?MENU_ID=42',
  'https://www.gvcs-es.org/CMN/CMN0100/CMN0101S.aspx?BOARD_MST_NO=1&MENU_ID=95',
  36.9407,
  127.4525,
  true
) on conflict (code) do update set
  name = excluded.name,
  region = excluded.region,
  homepage_url = excluded.homepage_url,
  meal_url = excluded.meal_url,
  schedule_url = excluded.schedule_url,
  notice_url = excluded.notice_url,
  latitude = excluded.latitude,
  longitude = excluded.longitude,
  active = excluded.active,
  updated_at = now();

-- Updated-at helper used by future server-side writes as well.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Keep updated_at correct even when a client/server update omits it.
drop trigger if exists schools_set_updated_at on public.schools;
create trigger schools_set_updated_at before update on public.schools for each row execute function public.set_updated_at();
drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
drop trigger if exists school_schedules_set_updated_at on public.school_schedules;
create trigger school_schedules_set_updated_at before update on public.school_schedules for each row execute function public.set_updated_at();
drop trigger if exists school_event_overrides_set_updated_at on public.school_event_overrides;
create trigger school_event_overrides_set_updated_at before update on public.school_event_overrides for each row execute function public.set_updated_at();
drop trigger if exists school_meals_set_updated_at on public.school_meals;
create trigger school_meals_set_updated_at before update on public.school_meals for each row execute function public.set_updated_at();
drop trigger if exists school_notices_set_updated_at on public.school_notices;
create trigger school_notices_set_updated_at before update on public.school_notices for each row execute function public.set_updated_at();

-- Automatically create the profile as soon as Supabase Auth creates a user.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, school_id, theme)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(coalesce(new.email, ''), '@', 1), ''),
    (
      select s.id
      from public.schools s
      where s.active = true
        and s.id::text = new.raw_user_meta_data ->> 'school_id'
      limit 1
    ),
    'light'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- RLS: personal data is isolated by auth.uid().
alter table public.profiles enable row level security;
alter table public.schedules enable row level security;
alter table public.homework enable row level security;
alter table public.notes enable row level security;
alter table public.timetables enable row level security;
alter table public.bookmark_folders enable row level security;
alter table public.bookmarks enable row level security;
alter table public.school_event_overrides enable row level security;
alter table public.schools enable row level security;
alter table public.school_schedules enable row level security;
alter table public.school_meals enable row level security;
alter table public.school_notices enable row level security;

-- Reset only this project's policies so the script can be safely re-run.
drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists schedules_select_own on public.schedules;
drop policy if exists schedules_insert_own on public.schedules;
drop policy if exists schedules_update_own on public.schedules;
drop policy if exists schedules_delete_own on public.schedules;
drop policy if exists homework_select_own on public.homework;
drop policy if exists homework_insert_own on public.homework;
drop policy if exists homework_update_own on public.homework;
drop policy if exists homework_delete_own on public.homework;
drop policy if exists notes_select_own on public.notes;
drop policy if exists notes_insert_own on public.notes;
drop policy if exists notes_update_own on public.notes;
drop policy if exists notes_delete_own on public.notes;
drop policy if exists timetables_select_own on public.timetables;
drop policy if exists timetables_insert_own on public.timetables;
drop policy if exists timetables_update_own on public.timetables;
drop policy if exists timetables_delete_own on public.timetables;
drop policy if exists bookmark_folders_select_own on public.bookmark_folders;
drop policy if exists bookmark_folders_insert_own on public.bookmark_folders;
drop policy if exists bookmark_folders_update_own on public.bookmark_folders;
drop policy if exists bookmark_folders_delete_own on public.bookmark_folders;
drop policy if exists bookmarks_select_own on public.bookmarks;
drop policy if exists bookmarks_insert_own on public.bookmarks;
drop policy if exists bookmarks_update_own on public.bookmarks;
drop policy if exists bookmarks_delete_own on public.bookmarks;
drop policy if exists school_event_overrides_select_own on public.school_event_overrides;
drop policy if exists school_event_overrides_insert_own on public.school_event_overrides;
drop policy if exists school_event_overrides_update_own on public.school_event_overrides;
drop policy if exists school_event_overrides_delete_own on public.school_event_overrides;
drop policy if exists schools_select_public on public.schools;
drop policy if exists schools_select_authenticated on public.schools;
drop policy if exists school_schedules_select_authenticated on public.school_schedules;
drop policy if exists school_meals_select_authenticated on public.school_meals;
drop policy if exists school_notices_select_authenticated on public.school_notices;

create policy profiles_select_own on public.profiles for select to authenticated using ((select auth.uid()) = id);
create policy profiles_insert_own on public.profiles for insert to authenticated with check ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create policy schedules_select_own on public.schedules for select to authenticated using ((select auth.uid()) = user_id);
create policy schedules_insert_own on public.schedules for insert to authenticated with check ((select auth.uid()) = user_id);
create policy schedules_update_own on public.schedules for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy schedules_delete_own on public.schedules for delete to authenticated using ((select auth.uid()) = user_id);

create policy homework_select_own on public.homework for select to authenticated using ((select auth.uid()) = user_id);
create policy homework_insert_own on public.homework for insert to authenticated with check ((select auth.uid()) = user_id);
create policy homework_update_own on public.homework for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy homework_delete_own on public.homework for delete to authenticated using ((select auth.uid()) = user_id);

create policy notes_select_own on public.notes for select to authenticated using ((select auth.uid()) = user_id);
create policy notes_insert_own on public.notes for insert to authenticated with check ((select auth.uid()) = user_id);
create policy notes_update_own on public.notes for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy notes_delete_own on public.notes for delete to authenticated using ((select auth.uid()) = user_id);

create policy timetables_select_own on public.timetables for select to authenticated using ((select auth.uid()) = user_id);
create policy timetables_insert_own on public.timetables for insert to authenticated with check ((select auth.uid()) = user_id);
create policy timetables_update_own on public.timetables for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy timetables_delete_own on public.timetables for delete to authenticated using ((select auth.uid()) = user_id);

create policy bookmark_folders_select_own on public.bookmark_folders for select to authenticated using ((select auth.uid()) = user_id);
create policy bookmark_folders_insert_own on public.bookmark_folders for insert to authenticated with check ((select auth.uid()) = user_id);
create policy bookmark_folders_update_own on public.bookmark_folders for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy bookmark_folders_delete_own on public.bookmark_folders for delete to authenticated using ((select auth.uid()) = user_id);

create policy bookmarks_select_own on public.bookmarks for select to authenticated using ((select auth.uid()) = user_id);
create policy bookmarks_insert_own on public.bookmarks for insert to authenticated with check ((select auth.uid()) = user_id);
create policy bookmarks_update_own on public.bookmarks for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy bookmarks_delete_own on public.bookmarks for delete to authenticated using ((select auth.uid()) = user_id);

create policy school_event_overrides_select_own on public.school_event_overrides for select to authenticated using ((select auth.uid()) = user_id);
create policy school_event_overrides_insert_own on public.school_event_overrides for insert to authenticated with check ((select auth.uid()) = user_id);
create policy school_event_overrides_update_own on public.school_event_overrides for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy school_event_overrides_delete_own on public.school_event_overrides for delete to authenticated using ((select auth.uid()) = user_id);

-- School names are safe to show before login because the signup screen needs them.
create policy schools_select_public on public.schools for select to anon using (active = true);
create policy schools_select_authenticated on public.schools for select to authenticated using (active = true);
create policy school_schedules_select_authenticated on public.school_schedules for select to authenticated using (active = true);
create policy school_meals_select_authenticated on public.school_meals for select to authenticated using (active = true);
create policy school_notices_select_authenticated on public.school_notices for select to authenticated using (active = true);

-- Explicit API grants. RLS still controls which rows are visible/writable.
revoke all on public.profiles, public.schedules, public.homework, public.notes, public.timetables, public.bookmark_folders, public.bookmarks, public.school_event_overrides from anon;
revoke all on public.school_schedules, public.school_meals, public.school_notices from anon;
grant select on public.schools to anon, authenticated;
grant select, insert, update, delete on public.profiles, public.schedules, public.homework, public.notes, public.timetables, public.bookmark_folders, public.bookmarks, public.school_event_overrides to authenticated;
grant select on public.schools, public.school_schedules, public.school_meals, public.school_notices to authenticated;

-- Service-role access used by the Next.js server sync route.
grant all on public.schools, public.school_schedules, public.school_meals, public.school_notices, public.profiles to service_role;

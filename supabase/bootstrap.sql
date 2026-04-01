-- ParkPulse MVP bootstrap (schema + seed)
-- Run this in Supabase SQL Editor.
-- Safe to re-run while iterating on the MVP.

create extension if not exists pgcrypto;

create table if not exists public.places (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  latitude double precision not null,
  longitude double precision not null,
  current_status text not null default 'unknown'
    check (current_status in ('available', 'full', 'closed', 'unknown')),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists places_name_idx on public.places (name);
create index if not exists places_geo_idx on public.places (latitude, longitude);

alter table public.places enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'places'
      and policyname = 'places_select_public'
  ) then
    create policy places_select_public
      on public.places
      for select
      to anon, authenticated
      using (true);
  end if;
end $$;

grant select on public.places to anon, authenticated;

create table if not exists public.place_reports (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places(id) on delete cascade,
  reporter_user_id uuid null references auth.users(id) on delete set null,
  reporter_session_id text null,
  report_status text not null
    check (report_status in ('available', 'full', 'closed')),
  note text null,
  reported_latitude double precision null,
  reported_longitude double precision null,
  reported_distance_meters integer null check (reported_distance_meters is null or reported_distance_meters >= 0),
  metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint place_reports_reporter_check
    check (reporter_user_id is not null or nullif(trim(reporter_session_id), '') is not null)
);

create index if not exists place_reports_place_created_idx
  on public.place_reports (place_id, created_at desc);

create index if not exists place_reports_created_idx
  on public.place_reports (created_at desc);

create index if not exists place_reports_reporter_session_idx
  on public.place_reports (reporter_session_id, created_at desc);

create index if not exists place_reports_active_idx
  on public.place_reports (place_id, expires_at desc, created_at desc);

alter table public.place_reports enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'place_reports'
      and policyname = 'place_reports_select_public'
  ) then
    create policy place_reports_select_public
      on public.place_reports
      for select
      to anon, authenticated
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'place_reports'
      and policyname = 'place_reports_insert_public'
  ) then
    create policy place_reports_insert_public
      on public.place_reports
      for insert
      to anon, authenticated
      with check (
        report_status in ('available', 'full', 'closed')
        and (reporter_user_id is null or reporter_user_id = auth.uid())
        and (reporter_user_id is not null or nullif(trim(reporter_session_id), '') is not null)
      );
  end if;
end $$;

grant select, insert on public.place_reports to anon, authenticated;

create or replace function public.place_report_ttl_minutes(input_status text)
returns integer
language sql
immutable
as $$
  select case lower(coalesce(input_status, ''))
    when 'available' then 15
    when 'full' then 30
    when 'closed' then 720
    else 15
  end;
$$;

create or replace function public.place_reports_fill_defaults()
returns trigger
language plpgsql
as $$
begin
  new.created_at := coalesce(new.created_at, now());
  new.report_status := lower(new.report_status);
  new.reporter_session_id := nullif(trim(new.reporter_session_id), '');

  if new.expires_at is null then
    new.expires_at := new.created_at
      + make_interval(mins => public.place_report_ttl_minutes(new.report_status));
  end if;

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'place_reports_fill_defaults_trigger'
  ) then
    create trigger place_reports_fill_defaults_trigger
      before insert on public.place_reports
      for each row
      execute function public.place_reports_fill_defaults();
  end if;
end $$;

create or replace view public.place_live_status as
with latest_active_report as (
  select distinct on (report.place_id)
    report.place_id,
    report.id as active_report_id,
    report.report_status,
    report.created_at,
    report.expires_at
  from public.place_reports as report
  where report.expires_at > now()
  order by report.place_id, report.created_at desc
),
report_stats as (
  select
    report.place_id,
    count(*)::integer as total_report_count,
    count(*) filter (where report.expires_at > now())::integer as active_report_count,
    max(report.created_at) as last_reported_at
  from public.place_reports as report
  group by report.place_id
)
select
  place.id,
  place.name,
  place.latitude,
  place.longitude,
  coalesce(active_report.report_status, place.current_status) as current_status,
  coalesce(active_report.created_at, place.updated_at) as updated_at,
  stats.last_reported_at,
  coalesce(stats.active_report_count, 0) as active_report_count,
  coalesce(stats.total_report_count, 0) as total_report_count,
  active_report.active_report_id
from public.places as place
left join latest_active_report as active_report
  on active_report.place_id = place.id
left join report_stats as stats
  on stats.place_id = place.id;

grant select on public.place_live_status to anon, authenticated;

create or replace view public.place_report_feed as
select
  report.id,
  report.place_id,
  place.name as place_name,
  report.report_status as status,
  report.note,
  report.reported_latitude,
  report.reported_longitude,
  report.reported_distance_meters,
  report.reporter_user_id,
  report.reporter_session_id,
  report.expires_at,
  report.created_at
from public.place_reports as report
join public.places as place
  on place.id = report.place_id;

grant select on public.place_report_feed to anon, authenticated;

insert into public.places (name, latitude, longitude, current_status, updated_at)
select seed.name, seed.latitude, seed.longitude, seed.current_status, seed.updated_at
from (
  values
    ('Centro - Plaza Patria', 21.8817, -102.2961, 'available', now()),
    ('Zona Feria - Estadio', 21.8728, -102.3091, 'full', now()),
    ('Av. Universidad', 21.9143, -102.3096, 'closed', now()),
    ('Altaria Mall', 21.9209, -102.3025, 'available', now()),
    ('San Marcos', 21.8795, -102.2914, 'unknown', now())
) as seed(name, latitude, longitude, current_status, updated_at)
where not exists (
  select 1
  from public.places as place
  where place.name = seed.name
    and place.latitude = seed.latitude
    and place.longitude = seed.longitude
);

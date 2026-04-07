-- ParkPulse bootstrap
-- Run this file in Supabase SQL Editor.
-- It is designed to be safe to re-run while iterating.

create extension if not exists pgcrypto;

drop view if exists public.place_report_feed cascade;
drop view if exists public.place_live_status cascade;
drop view if exists public.place_rating_summary cascade;
drop view if exists public.place_review_feed cascade;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.normalize_search_text(input text)
returns text
language sql
immutable
as $$
  select regexp_replace(lower(coalesce(trim(input), '')), '\s+', ' ', 'g');
$$;

create or replace function public.geo_distance_meters(
  latitude_a double precision,
  longitude_a double precision,
  latitude_b double precision,
  longitude_b double precision
)
returns double precision
language sql
immutable
as $$
  select
    2 * 6371000 * asin(
      sqrt(
        power(sin(radians((latitude_b - latitude_a) / 2)), 2)
        + cos(radians(latitude_a))
        * cos(radians(latitude_b))
        * power(sin(radians((longitude_b - longitude_a) / 2)), 2)
      )
    );
$$;

create or replace function public.report_actor_matches(
  left_user_id uuid,
  left_session_id text,
  right_user_id uuid,
  right_session_id text
)
returns boolean
language sql
immutable
as $$
  select
    (
      left_user_id is not null
      and right_user_id is not null
      and left_user_id = right_user_id
    )
    or (
      left_user_id is null
      and right_user_id is null
      and nullif(trim(left_session_id), '') is not null
      and nullif(trim(right_session_id), '') is not null
      and nullif(trim(left_session_id), '') = nullif(trim(right_session_id), '')
    );
$$;

create or replace function public.is_valid_hour_text(input text)
returns boolean
language sql
immutable
as $$
  select coalesce(input ~ '^(?:[01]\d|2[0-3]):[0-5]\d$', false);
$$;

create or replace function public.is_valid_weekly_hour_map(input jsonb)
returns boolean
language sql
immutable
as $$
  select
    input is null
    or (
      jsonb_typeof(input) = 'object'
      and not exists (
        select 1
        from jsonb_each(input) as entry(day_name, day_value)
        where day_name not in (
          'monday',
          'tuesday',
          'wednesday',
          'thursday',
          'friday',
          'saturday',
          'sunday'
        )
          or (
            jsonb_typeof(day_value) <> 'null'
            and (
              jsonb_typeof(day_value) <> 'string'
              or not public.is_valid_hour_text(day_value #>> '{}')
            )
          )
      )
    );
$$;

create or replace function public.are_valid_place_hours(
  input_opening_hours jsonb,
  input_closing_hours jsonb
)
returns boolean
language plpgsql
immutable
as $$
declare
  day_name text;
  opening_exists boolean;
  closing_exists boolean;
  opening_value text;
  closing_value text;
begin
  if input_opening_hours is null and input_closing_hours is null then
    return true;
  end if;

  if input_opening_hours is null or input_closing_hours is null then
    return false;
  end if;

  if jsonb_typeof(input_opening_hours) <> 'object' then
    return false;
  end if;

  if jsonb_typeof(input_closing_hours) <> 'object' then
    return false;
  end if;

  for day_name in
    select unnest(
      array[
        'monday',
        'tuesday',
        'wednesday',
        'thursday',
        'friday',
        'saturday',
        'sunday'
      ]::text[]
    )
  loop
    opening_exists := input_opening_hours ? day_name;
    closing_exists := input_closing_hours ? day_name;

    if opening_exists <> closing_exists then
      return false;
    end if;

    if not opening_exists then
      continue;
    end if;

    opening_value := input_opening_hours ->> day_name;
    closing_value := input_closing_hours ->> day_name;

    if opening_value is null and closing_value is null then
      continue;
    end if;

    if opening_value is null or closing_value is null then
      return false;
    end if;

    if opening_value >= closing_value then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  phone text null,
  full_name text null,
  preferred_name text null,
  avatar_url text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists user_profiles_email_idx
  on public.user_profiles (lower(email));

create or replace function public.sync_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_full_name text;
begin
  resolved_full_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(
      trim(
        concat_ws(
          ' ',
          nullif(trim(new.raw_user_meta_data ->> 'first_name'), ''),
          nullif(trim(new.raw_user_meta_data ->> 'last_name'), '')
        )
      ),
      ''
    )
  );

  insert into public.user_profiles (
    user_id,
    email,
    phone,
    full_name,
    preferred_name,
    avatar_url,
    created_at,
    updated_at
  )
  values (
    new.id,
    coalesce(nullif(trim(new.email), ''), format('user-%s@parkpulse.local', new.id)),
    coalesce(
      nullif(trim(new.phone), ''),
      nullif(trim(new.raw_user_meta_data ->> 'phone'), '')
    ),
    resolved_full_name,
    nullif(trim(new.raw_user_meta_data ->> 'preferred_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'avatar_url'), ''),
    now(),
    now()
  )
  on conflict (user_id) do update
  set
    email = excluded.email,
    phone = excluded.phone,
    full_name = coalesce(excluded.full_name, public.user_profiles.full_name),
    preferred_name = coalesce(excluded.preferred_name, public.user_profiles.preferred_name),
    avatar_url = coalesce(excluded.avatar_url, public.user_profiles.avatar_url),
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists sync_auth_user_profile_trigger on auth.users;

create trigger sync_auth_user_profile_trigger
  after insert or update on auth.users
  for each row
  execute function public.sync_auth_user_profile();

insert into public.user_profiles (
  user_id,
  email,
  phone,
  full_name,
  preferred_name,
  avatar_url,
  created_at,
  updated_at
)
select
  auth_user.id,
  coalesce(nullif(trim(auth_user.email), ''), format('user-%s@parkpulse.local', auth_user.id)),
  coalesce(
    nullif(trim(auth_user.phone), ''),
    nullif(trim(auth_user.raw_user_meta_data ->> 'phone'), '')
  ),
  coalesce(
    nullif(trim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(auth_user.raw_user_meta_data ->> 'name'), ''),
    nullif(
      trim(
        concat_ws(
          ' ',
          nullif(trim(auth_user.raw_user_meta_data ->> 'first_name'), ''),
          nullif(trim(auth_user.raw_user_meta_data ->> 'last_name'), '')
        )
      ),
      ''
    )
  ),
  nullif(trim(auth_user.raw_user_meta_data ->> 'preferred_name'), ''),
  nullif(trim(auth_user.raw_user_meta_data ->> 'avatar_url'), ''),
  now(),
  now()
from auth.users as auth_user
on conflict (user_id) do update
set
  email = excluded.email,
  phone = excluded.phone,
  full_name = coalesce(excluded.full_name, public.user_profiles.full_name),
  preferred_name = coalesce(excluded.preferred_name, public.user_profiles.preferred_name),
  avatar_url = coalesce(excluded.avatar_url, public.user_profiles.avatar_url),
  updated_at = now();

drop trigger if exists user_profiles_set_updated_at_trigger on public.user_profiles;

create trigger user_profiles_set_updated_at_trigger
  before update on public.user_profiles
  for each row
  execute function public.set_updated_at();

alter table public.user_profiles enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_profiles'
      and policyname = 'user_profiles_select_own'
  ) then
    create policy user_profiles_select_own
      on public.user_profiles
      for select
      to authenticated
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_profiles'
      and policyname = 'user_profiles_insert_own'
  ) then
    create policy user_profiles_insert_own
      on public.user_profiles
      for insert
      to authenticated
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'user_profiles'
      and policyname = 'user_profiles_update_own'
  ) then
    create policy user_profiles_update_own
      on public.user_profiles
      for update
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

grant select, insert, update on public.user_profiles to authenticated;

create table if not exists public.places (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text null,
  address text null,
  opening_hours jsonb null,
  closing_hours jsonb null,
  latitude double precision not null,
  longitude double precision not null,
  cost_type text not null default 'unknown'
    check (cost_type in ('free', 'paid', 'mixed', 'unknown')),
  currency_code text not null default 'MXN',
  hourly_cost_min numeric(10, 2) null
    check (hourly_cost_min is null or hourly_cost_min >= 0),
  hourly_cost_max numeric(10, 2) null
    check (
      hourly_cost_max is null
      or (
        hourly_cost_max >= 0
        and (
          hourly_cost_min is null
          or hourly_cost_max >= hourly_cost_min
        )
      )
    ),
  cost_notes text null,
  capacity_min integer null
    check (capacity_min is null or capacity_min >= 0),
  capacity_max integer null
    check (
      capacity_max is null
      or (
        capacity_max >= 0
        and (
          capacity_min is null
          or capacity_max >= capacity_min
        )
      )
    ),
  capacity_confidence text not null default 'unknown'
    check (capacity_confidence in ('exact', 'estimated', 'range', 'unknown')),
  access_type text not null default 'public'
    check (access_type in ('public', 'private', 'mixed', 'unknown')),
  created_by_user_id uuid null references auth.users(id) on delete set null,
  created_by_session_id text null,
  current_status text not null default 'unknown'
    check (current_status in ('available', 'full', 'closed', 'unknown')),
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.places
  add column if not exists description text null;

alter table public.places
  add column if not exists address text null;

alter table public.places
  add column if not exists opening_hours jsonb null;

alter table public.places
  add column if not exists closing_hours jsonb null;

alter table public.places
  add column if not exists cost_type text not null default 'unknown';

alter table public.places
  add column if not exists currency_code text not null default 'MXN';

alter table public.places
  add column if not exists hourly_cost_min numeric(10, 2) null;

alter table public.places
  add column if not exists hourly_cost_max numeric(10, 2) null;

alter table public.places
  add column if not exists cost_notes text null;

alter table public.places
  add column if not exists capacity_min integer null;

alter table public.places
  add column if not exists capacity_max integer null;

alter table public.places
  add column if not exists capacity_confidence text not null default 'unknown';

alter table public.places
  add column if not exists access_type text not null default 'public';

alter table public.places
  add column if not exists created_by_user_id uuid null references auth.users(id) on delete set null;

alter table public.places
  add column if not exists created_by_session_id text null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'places_cost_type_check'
      and conrelid = 'public.places'::regclass
  ) then
    alter table public.places
      add constraint places_cost_type_check
      check (cost_type in ('free', 'paid', 'mixed', 'unknown'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'places_capacity_confidence_check'
      and conrelid = 'public.places'::regclass
  ) then
    alter table public.places
      add constraint places_capacity_confidence_check
      check (capacity_confidence in ('exact', 'estimated', 'range', 'unknown'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'places_access_type_check'
      and conrelid = 'public.places'::regclass
  ) then
    alter table public.places
      add constraint places_access_type_check
      check (access_type in ('public', 'private', 'mixed', 'unknown'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'places_opening_hours_check'
      and conrelid = 'public.places'::regclass
  ) then
    alter table public.places
      add constraint places_opening_hours_check
      check (public.is_valid_weekly_hour_map(opening_hours));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'places_closing_hours_check'
      and conrelid = 'public.places'::regclass
  ) then
    alter table public.places
      add constraint places_closing_hours_check
      check (public.is_valid_weekly_hour_map(closing_hours));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'places_hours_consistency_check'
      and conrelid = 'public.places'::regclass
  ) then
    alter table public.places
      add constraint places_hours_consistency_check
      check (public.are_valid_place_hours(opening_hours, closing_hours));
  end if;
end $$;

create index if not exists places_name_idx on public.places (name);
create index if not exists places_geo_idx on public.places (latitude, longitude);
create index if not exists places_created_by_user_idx on public.places (created_by_user_id);

create or replace function public.places_fill_defaults()
returns trigger
language plpgsql
as $$
begin
  new.name := nullif(trim(new.name), '');
  if new.name is null then
    raise exception 'place_name_required';
  end if;

  new.description := nullif(trim(new.description), '');
  new.address := nullif(trim(new.address), '');
  new.cost_notes := nullif(trim(new.cost_notes), '');
  new.created_by_session_id := nullif(trim(new.created_by_session_id), '');
  new.cost_type := lower(coalesce(nullif(trim(new.cost_type), ''), 'unknown'));
  new.capacity_confidence := lower(coalesce(nullif(trim(new.capacity_confidence), ''), 'unknown'));
  new.access_type := lower(coalesce(nullif(trim(new.access_type), ''), 'public'));
  new.current_status := lower(coalesce(nullif(trim(new.current_status), ''), 'unknown'));
  new.currency_code := upper(coalesce(nullif(trim(new.currency_code), ''), 'MXN'));
  new.created_at := coalesce(new.created_at, now());
  new.updated_at := coalesce(new.updated_at, new.created_at);

  return new;
end;
$$;

drop trigger if exists places_fill_defaults_trigger on public.places;

create trigger places_fill_defaults_trigger
  before insert or update on public.places
  for each row
  execute function public.places_fill_defaults();

drop trigger if exists places_set_updated_at_trigger on public.places;

create trigger places_set_updated_at_trigger
  before update on public.places
  for each row
  execute function public.set_updated_at();

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
  reported_distance_meters integer null
    check (reported_distance_meters is null or reported_distance_meters >= 0),
  actor_trust_score numeric(6, 2) not null default 1.00
    check (actor_trust_score >= 0),
  actor_trust_level text not null default 'low'
    check (actor_trust_level in ('low', 'medium', 'high')),
  metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint place_reports_reporter_check
    check (
      reporter_user_id is not null
      or nullif(trim(reporter_session_id), '') is not null
    )
);

alter table public.place_reports
  add column if not exists actor_trust_score numeric(6, 2) not null default 1.00;

alter table public.place_reports
  add column if not exists actor_trust_level text not null default 'low';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'place_reports_actor_trust_level_check'
      and conrelid = 'public.place_reports'::regclass
  ) then
    alter table public.place_reports
      add constraint place_reports_actor_trust_level_check
      check (actor_trust_level in ('low', 'medium', 'high'));
  end if;
end $$;

create index if not exists place_reports_place_created_idx
  on public.place_reports (place_id, created_at desc);

create index if not exists place_reports_created_idx
  on public.place_reports (created_at desc);

create index if not exists place_reports_reporter_session_idx
  on public.place_reports (reporter_session_id, created_at desc);

create index if not exists place_reports_active_idx
  on public.place_reports (place_id, expires_at desc, created_at desc);

create index if not exists place_reports_place_actor_created_idx
  on public.place_reports (place_id, reporter_user_id, reporter_session_id, created_at desc);

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

create or replace function public.classify_actor_trust_level(input_score numeric)
returns text
language sql
immutable
as $$
  select case
    when coalesce(input_score, 0) >= 2.25 then 'high'
    when coalesce(input_score, 0) >= 1.35 then 'medium'
    else 'low'
  end;
$$;

create table if not exists public.place_report_feedback (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.place_reports(id) on delete cascade,
  reactor_user_id uuid null references auth.users(id) on delete set null,
  reactor_session_id text null,
  reactor_identity text generated always as (
    coalesce(reactor_user_id::text, nullif(trim(reactor_session_id), ''))
  ) stored,
  reaction text not null
    check (reaction in ('confirm', 'dispute')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint place_report_feedback_actor_check
    check (
      reactor_user_id is not null
      or nullif(trim(reactor_session_id), '') is not null
    )
);

create or replace function public.compute_actor_report_trust(
  actor_user_id uuid,
  actor_session_id text
)
returns numeric
language sql
stable
set search_path = public
as $$
  with actor_reports as (
    select report.*
    from public.place_reports as report
    where public.report_actor_matches(
      report.reporter_user_id,
      report.reporter_session_id,
      actor_user_id,
      actor_session_id
    )
  ),
  actor_report_stats as (
    select
      count(*)::numeric as total_reports,
      count(*) filter (
        where exists (
          select 1
          from public.place_reports as confirmation
          where confirmation.place_id = report.place_id
            and confirmation.created_at > report.created_at
            and confirmation.created_at <= least(
              coalesce(report.expires_at, report.created_at + interval '2 hours'),
              report.created_at + interval '2 hours'
            )
            and confirmation.report_status = report.report_status
            and not public.report_actor_matches(
              confirmation.reporter_user_id,
              confirmation.reporter_session_id,
              report.reporter_user_id,
              report.reporter_session_id
            )
        )
      )::numeric as confirmed_reports,
      count(*) filter (
        where exists (
          select 1
          from public.place_reports as contradiction
          where contradiction.place_id = report.place_id
            and contradiction.created_at > report.created_at
            and contradiction.created_at <= report.created_at + interval '90 minutes'
            and contradiction.report_status <> report.report_status
            and not public.report_actor_matches(
              contradiction.reporter_user_id,
              contradiction.reporter_session_id,
              report.reporter_user_id,
              report.reporter_session_id
            )
        )
      )::numeric as contradicted_reports
    from actor_reports as report
  ),
  actor_feedback_stats as (
    select
      count(*) filter (where feedback.reaction = 'confirm')::numeric as direct_confirms,
      count(*) filter (where feedback.reaction = 'dispute')::numeric as direct_disputes
    from public.place_report_feedback as feedback
    join public.place_reports as report
      on report.id = feedback.report_id
    where public.report_actor_matches(
      report.reporter_user_id,
      report.reporter_session_id,
      actor_user_id,
      actor_session_id
    )
  ),
  actor_rating_stats as (
    select count(*)::numeric as total_ratings
    from public.place_ratings as rating
    where (
      actor_user_id is not null
      and rating.rater_user_id = actor_user_id
    ) or (
      actor_user_id is null
      and actor_session_id is not null
      and rating.rater_user_id is null
      and rating.rater_session_id = actor_session_id
    )
  ),
  actor_place_stats as (
    select count(*)::numeric as total_places
    from public.places as place
    where (
      actor_user_id is not null
      and place.created_by_user_id = actor_user_id
    ) or (
      actor_user_id is null
      and actor_session_id is not null
      and place.created_by_user_id is null
      and place.created_by_session_id = actor_session_id
    )
  )
  select round(least(greatest(
    (case when actor_user_id is not null then 1.10 else 0.80 end)
    + least(coalesce(report_stats.total_reports, 0) * 0.03, 0.75)
    + least(coalesce(rating_stats.total_ratings, 0) * 0.02, 0.20)
    + least(coalesce(place_stats.total_places, 0) * 0.05, 0.25)
    + least(coalesce(report_stats.confirmed_reports, 0) * 0.05, 0.60)
    + least(coalesce(feedback_stats.direct_confirms, 0) * 0.04, 0.40)
    - least(coalesce(report_stats.contradicted_reports, 0) * 0.08, 0.80)
    - least(coalesce(feedback_stats.direct_disputes, 0) * 0.06, 0.45),
    0.35
  ), 3.20)::numeric, 2)
  from actor_report_stats as report_stats
  cross join actor_feedback_stats as feedback_stats
  cross join actor_rating_stats as rating_stats
  cross join actor_place_stats as place_stats;
$$;

create or replace function public.place_reports_fill_defaults()
returns trigger
language plpgsql
as $$
begin
  new.created_at := coalesce(new.created_at, now());
  new.note := nullif(trim(new.note), '');
  new.report_status := lower(new.report_status);
  new.reporter_session_id := nullif(trim(new.reporter_session_id), '');
  new.actor_trust_level := public.classify_actor_trust_level(new.actor_trust_score);

  if new.expires_at is null then
    new.expires_at := new.created_at
      + make_interval(mins => public.place_report_ttl_minutes(new.report_status));
  end if;

  return new;
end;
$$;

drop trigger if exists place_reports_fill_defaults_trigger on public.place_reports;

create trigger place_reports_fill_defaults_trigger
  before insert on public.place_reports
  for each row
  execute function public.place_reports_fill_defaults();

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
end $$;

grant select on public.place_reports to anon, authenticated;

create table if not exists public.place_report_feedback (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.place_reports(id) on delete cascade,
  reactor_user_id uuid null references auth.users(id) on delete set null,
  reactor_session_id text null,
  reactor_identity text generated always as (
    coalesce(reactor_user_id::text, nullif(trim(reactor_session_id), ''))
  ) stored,
  reaction text not null
    check (reaction in ('confirm', 'dispute')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint place_report_feedback_actor_check
    check (
      reactor_user_id is not null
      or nullif(trim(reactor_session_id), '') is not null
    )
);

create unique index if not exists place_report_feedback_report_identity_idx
  on public.place_report_feedback (report_id, reactor_identity);

create index if not exists place_report_feedback_report_updated_idx
  on public.place_report_feedback (report_id, updated_at desc);

create or replace function public.place_report_feedback_fill_defaults()
returns trigger
language plpgsql
as $$
begin
  new.reactor_session_id := nullif(trim(new.reactor_session_id), '');
  new.reaction := lower(new.reaction);
  new.created_at := coalesce(new.created_at, now());
  new.updated_at := coalesce(new.updated_at, new.created_at);
  return new;
end;
$$;

drop trigger if exists place_report_feedback_fill_defaults_trigger on public.place_report_feedback;

create trigger place_report_feedback_fill_defaults_trigger
  before insert or update on public.place_report_feedback
  for each row
  execute function public.place_report_feedback_fill_defaults();

drop trigger if exists place_report_feedback_set_updated_at_trigger on public.place_report_feedback;

create trigger place_report_feedback_set_updated_at_trigger
  before update on public.place_report_feedback
  for each row
  execute function public.set_updated_at();

alter table public.place_report_feedback enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'place_report_feedback'
      and policyname = 'place_report_feedback_select_public'
  ) then
    create policy place_report_feedback_select_public
      on public.place_report_feedback
      for select
      to anon, authenticated
      using (true);
  end if;
end $$;

grant select on public.place_report_feedback to anon, authenticated;

create table if not exists public.place_ratings (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places(id) on delete cascade,
  rater_user_id uuid null references auth.users(id) on delete set null,
  rater_session_id text null,
  rater_identity text generated always as (
    coalesce(rater_user_id::text, nullif(trim(rater_session_id), ''))
  ) stored,
  rating integer not null check (rating between 1 and 5),
  comment text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint place_ratings_actor_check
    check (
      rater_user_id is not null
      or nullif(trim(rater_session_id), '') is not null
    )
);

create unique index if not exists place_ratings_place_identity_idx
  on public.place_ratings (place_id, rater_identity);

create index if not exists place_ratings_place_updated_idx
  on public.place_ratings (place_id, updated_at desc);

create or replace function public.place_ratings_fill_defaults()
returns trigger
language plpgsql
as $$
begin
  new.comment := nullif(trim(new.comment), '');
  new.rater_session_id := nullif(trim(new.rater_session_id), '');
  new.created_at := coalesce(new.created_at, now());
  new.updated_at := coalesce(new.updated_at, new.created_at);
  return new;
end;
$$;

drop trigger if exists place_ratings_fill_defaults_trigger on public.place_ratings;

create trigger place_ratings_fill_defaults_trigger
  before insert or update on public.place_ratings
  for each row
  execute function public.place_ratings_fill_defaults();

drop trigger if exists place_ratings_set_updated_at_trigger on public.place_ratings;

create trigger place_ratings_set_updated_at_trigger
  before update on public.place_ratings
  for each row
  execute function public.set_updated_at();

alter table public.place_ratings enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'place_ratings'
      and policyname = 'place_ratings_select_public'
  ) then
    create policy place_ratings_select_public
      on public.place_ratings
      for select
      to anon, authenticated
      using (true);
  end if;
end $$;

grant select on public.place_ratings to anon, authenticated;

create view public.place_rating_summary as
select
  rating.place_id,
  round(avg(rating.rating)::numeric, 2) as average_rating,
  count(*)::integer as rating_count
from public.place_ratings as rating
group by rating.place_id;

grant select on public.place_rating_summary to anon, authenticated;

create view public.place_live_status as
with active_reports as (
  select
    report.place_id,
    report.id,
    report.report_status,
    report.created_at,
    report.expires_at,
    report.actor_trust_score
  from public.place_reports as report
  where report.expires_at > now()
),
status_scores as (
  select
    report.place_id,
    report.report_status,
    count(*)::integer as report_count,
    round(sum(report.actor_trust_score)::numeric, 2) as trust_score,
    max(report.created_at) as latest_report_at
  from active_reports as report
  group by report.place_id, report.report_status
),
ranked_status_scores as (
  select
    score.*,
    row_number() over (
      partition by score.place_id
      order by
        score.trust_score desc,
        score.report_count desc,
        score.latest_report_at desc
    ) as status_rank,
    lead(score.trust_score) over (
      partition by score.place_id
      order by
        score.trust_score desc,
        score.report_count desc,
        score.latest_report_at desc
    ) as runner_up_trust_score
  from status_scores as score
),
consensus_status as (
  select
    ranked.place_id,
    ranked.report_status,
    ranked.report_count,
    ranked.trust_score,
    ranked.latest_report_at,
    case
      when ranked.trust_score >= 3.00 or ranked.report_count >= 3 then 'high'
      when ranked.trust_score >= 1.75 or ranked.report_count >= 2 then 'medium'
      else 'low'
    end as status_confidence,
    case
      when ranked.trust_score >= 3.00 or ranked.report_count >= 3 then 240
      when ranked.trust_score >= 1.75 or ranked.report_count >= 2 then 120
      else 60
    end as recommended_refresh_seconds
  from ranked_status_scores as ranked
  where ranked.status_rank = 1
    and ranked.trust_score >= 1.00
    and (
      ranked.runner_up_trust_score is null
      or ranked.trust_score - ranked.runner_up_trust_score >= 0.35
      or ranked.report_count >= 2
    )
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
  place.description,
  place.address,
  place.opening_hours,
  place.closing_hours,
  place.latitude,
  place.longitude,
  place.cost_type,
  place.currency_code,
  place.hourly_cost_min,
  place.hourly_cost_max,
  place.cost_notes,
  place.capacity_min,
  place.capacity_max,
  place.capacity_confidence,
  place.access_type,
  case
    when stats.active_report_count > 0 and consensus.place_id is null then 'unknown'
    else coalesce(consensus.report_status, place.current_status)
  end as current_status,
  coalesce(consensus.latest_report_at, place.updated_at) as updated_at,
  stats.last_reported_at,
  coalesce(stats.active_report_count, 0) as active_report_count,
  coalesce(stats.total_report_count, 0) as total_report_count,
  rating.average_rating,
  coalesce(rating.rating_count, 0) as rating_count,
  consensus.status_confidence,
  coalesce(consensus.report_count, 0) as status_report_count,
  consensus.trust_score as status_trust_score,
  case
    when stats.active_report_count = 0 then 300
    else consensus.recommended_refresh_seconds
  end as recommended_refresh_seconds,
  place.created_at,
  place.created_by_user_id,
  place.created_by_session_id,
  null::uuid as active_report_id
from public.places as place
left join consensus_status as consensus
  on consensus.place_id = place.id
left join report_stats as stats
  on stats.place_id = place.id
left join public.place_rating_summary as rating
  on rating.place_id = place.id;

grant select on public.place_live_status to anon, authenticated;

create view public.place_report_feed as
with feedback_stats as (
  select
    feedback.report_id,
    count(*) filter (where feedback.reaction = 'confirm')::integer as confirm_count,
    count(*) filter (where feedback.reaction = 'dispute')::integer as dispute_count
  from public.place_report_feedback as feedback
  group by feedback.report_id
)
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
  coalesce(
    nullif(profile.preferred_name, ''),
    nullif(profile.full_name, ''),
    'Comunidad'
  ) as reporter_display_name,
  report.expires_at,
  report.created_at,
  coalesce(feedback.confirm_count, 0) as confirm_count,
  coalesce(feedback.dispute_count, 0) as dispute_count
from public.place_reports as report
join public.places as place
  on place.id = report.place_id
left join public.user_profiles as profile
  on profile.user_id = report.reporter_user_id
left join feedback_stats as feedback
  on feedback.report_id = report.id;

grant select on public.place_report_feed to anon, authenticated;

create view public.place_review_feed as
select
  rating.id,
  rating.place_id,
  place.name as place_name,
  rating.rating,
  rating.comment,
  rating.created_at,
  rating.updated_at,
  rating.rater_user_id as reviewer_user_id,
  coalesce(
    nullif(profile.preferred_name, ''),
    nullif(profile.full_name, ''),
    'Comunidad'
  ) as reviewer_display_name
from public.place_ratings as rating
join public.places as place
  on place.id = rating.place_id
left join public.user_profiles as profile
  on profile.user_id = rating.rater_user_id;

grant select on public.place_review_feed to anon, authenticated;

create or replace function public.upsert_place_rating(
  input_place_id uuid,
  input_rating integer,
  input_comment text default null,
  input_rater_session_id text default null
)
returns table (
  place_id uuid,
  average_rating numeric,
  rating_count integer,
  my_rating integer
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  actor_user_id uuid;
  actor_session_id text;
begin
  actor_user_id := auth.uid();
  actor_session_id := nullif(trim(input_rater_session_id), '');

  if input_rating is null or input_rating < 1 or input_rating > 5 then
    raise exception 'rating_out_of_range';
  end if;

  if not exists (
    select 1
    from public.places as place
    where place.id = input_place_id
  ) then
    raise exception 'place_not_found';
  end if;

  if actor_user_id is null and actor_session_id is null then
    raise exception 'rating_actor_required';
  end if;

  insert into public.place_ratings (
    place_id,
    rater_user_id,
    rater_session_id,
    rating,
    comment
  )
  values (
    input_place_id,
    actor_user_id,
    actor_session_id,
    input_rating,
    input_comment
  )
  on conflict (place_id, rater_identity) do update
  set
    rating = excluded.rating,
    comment = excluded.comment,
    updated_at = now();

  return query
  select
    summary.place_id as place_id,
    summary.average_rating as average_rating,
    summary.rating_count as rating_count,
    input_rating as my_rating
  from public.place_rating_summary as summary
  where summary.place_id = input_place_id;
end;
$$;

grant execute on function public.upsert_place_rating(uuid, integer, text, text) to anon, authenticated;

drop function if exists public.create_place(
  text,
  double precision,
  double precision,
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  text,
  integer,
  integer,
  text,
  text,
  text
);

create or replace function public.create_place(
  input_name text,
  input_latitude double precision,
  input_longitude double precision,
  input_description text default null,
  input_address text default null,
  input_opening_hours jsonb default null,
  input_closing_hours jsonb default null,
  input_cost_type text default 'unknown',
  input_currency_code text default 'MXN',
  input_hourly_cost_min numeric default null,
  input_hourly_cost_max numeric default null,
  input_cost_notes text default null,
  input_capacity_min integer default null,
  input_capacity_max integer default null,
  input_capacity_confidence text default 'unknown',
  input_access_type text default 'public',
  input_created_by_session_id text default null
)
returns setof public.place_live_status
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid;
  actor_session_id text;
  created_place_id uuid;
  recent_place_count integer;
begin
  actor_user_id := auth.uid();
  actor_session_id := nullif(trim(input_created_by_session_id), '');

  if actor_user_id is null and actor_session_id is null then
    raise exception 'place_creator_required';
  end if;

  select count(*)::integer
  into recent_place_count
  from public.places as place
  where place.created_at >= now() - interval '24 hours'
    and (
      (actor_user_id is not null and place.created_by_user_id = actor_user_id)
      or (
        actor_user_id is null
        and actor_session_id is not null
        and place.created_by_user_id is null
        and place.created_by_session_id = actor_session_id
      )
    );

  if recent_place_count >= 4 then
    raise exception 'place_creation_rate_limited';
  end if;

  if exists (
    select 1
    from public.places as existing_place
    where public.geo_distance_meters(
      existing_place.latitude,
      existing_place.longitude,
      input_latitude,
      input_longitude
    ) <= 45
      or (
        public.normalize_search_text(existing_place.name) = public.normalize_search_text(input_name)
        and public.geo_distance_meters(
          existing_place.latitude,
          existing_place.longitude,
          input_latitude,
          input_longitude
        ) <= 120
      )
  ) then
    raise exception 'place_likely_duplicate';
  end if;

  insert into public.places (
    name,
    description,
    address,
    opening_hours,
    closing_hours,
    latitude,
    longitude,
    cost_type,
    currency_code,
    hourly_cost_min,
    hourly_cost_max,
    cost_notes,
    capacity_min,
    capacity_max,
    capacity_confidence,
    access_type,
    created_by_user_id,
    created_by_session_id,
    current_status
  )
  values (
    input_name,
    input_description,
    input_address,
    input_opening_hours,
    input_closing_hours,
    input_latitude,
    input_longitude,
    input_cost_type,
    input_currency_code,
    input_hourly_cost_min,
    input_hourly_cost_max,
    input_cost_notes,
    input_capacity_min,
    input_capacity_max,
    input_capacity_confidence,
    input_access_type,
    actor_user_id,
    actor_session_id,
    'unknown'
  )
  returning id into created_place_id;

  return query
  select *
  from public.place_live_status
  where id = created_place_id;
end;
$$;

grant execute on function public.create_place(text, double precision, double precision, text, text, jsonb, jsonb, text, text, numeric, numeric, text, integer, integer, text, text, text) to anon, authenticated;

create or replace function public.create_place_report(
  input_place_id uuid,
  input_report_status text,
  input_note text default null,
  input_reported_latitude double precision default null,
  input_reported_longitude double precision default null,
  input_reported_distance_meters integer default null,
  input_reporter_session_id text default null,
  input_rating integer default null
)
returns setof public.place_report_feed
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid;
  actor_session_id text;
  created_report_id uuid;
  actor_trust_score numeric;
  actor_trust_level text;
  max_reports_per_window integer;
begin
  actor_user_id := auth.uid();
  actor_session_id := nullif(trim(input_reporter_session_id), '');

  if actor_user_id is null and actor_session_id is null then
    raise exception 'reporter_required';
  end if;

  if input_report_status is null
    or lower(input_report_status) not in ('available', 'full', 'closed') then
    raise exception 'invalid_report_status';
  end if;

  if not exists (
    select 1
    from public.places as place
    where place.id = input_place_id
  ) then
    raise exception 'place_not_found';
  end if;

  if input_reported_distance_meters is not null
    and input_reported_distance_meters > 250 then
    raise exception 'report_too_far';
  end if;

  actor_trust_score := public.compute_actor_report_trust(actor_user_id, actor_session_id);
  actor_trust_level := public.classify_actor_trust_level(actor_trust_score);

  max_reports_per_window := case actor_trust_level
    when 'high' then 10
    when 'medium' then 7
    else 5
  end;

  if exists (
    select 1
    from public.place_reports as recent_place_report
    where recent_place_report.place_id = input_place_id
      and recent_place_report.created_at >= now() - interval '3 minutes'
      and public.report_actor_matches(
        recent_place_report.reporter_user_id,
        recent_place_report.reporter_session_id,
        actor_user_id,
        actor_session_id
      )
  ) then
    raise exception 'report_place_cooldown_active';
  end if;

  if (
    select count(*)::integer
    from public.place_reports as recent_report
    where recent_report.created_at >= now() - interval '10 minutes'
      and public.report_actor_matches(
        recent_report.reporter_user_id,
        recent_report.reporter_session_id,
        actor_user_id,
        actor_session_id
      )
  ) >= max_reports_per_window then
    raise exception 'report_rate_limited';
  end if;

  insert into public.place_reports (
    place_id,
    reporter_user_id,
    reporter_session_id,
    report_status,
    note,
    reported_latitude,
    reported_longitude,
    reported_distance_meters,
    actor_trust_score,
    actor_trust_level,
    metadata
  )
  values (
    input_place_id,
    actor_user_id,
    actor_session_id,
    input_report_status,
    input_note,
    input_reported_latitude,
    input_reported_longitude,
    input_reported_distance_meters,
    actor_trust_score,
    actor_trust_level,
    jsonb_build_object(
      'trust_score', actor_trust_score,
      'trust_level', actor_trust_level,
      'source', case when actor_user_id is not null then 'authenticated' else 'session' end
    )
  )
  returning id into created_report_id;

  if input_rating is not null then
    perform *
    from public.upsert_place_rating(
      input_place_id,
      input_rating,
      null,
      actor_session_id
    );
  end if;

  return query
  select *
  from public.place_report_feed
  where id = created_report_id;
end;
$$;

grant execute on function public.create_place_report(uuid, text, text, double precision, double precision, integer, text, integer) to anon, authenticated;

create or replace function public.react_to_place_report(
  input_report_id uuid,
  input_reaction text,
  input_actor_session_id text default null
)
returns setof public.place_report_feed
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_user_id uuid;
  actor_session_id text;
  report_owner_user_id uuid;
  report_owner_session_id text;
begin
  actor_user_id := auth.uid();
  actor_session_id := nullif(trim(input_actor_session_id), '');

  if actor_user_id is null and actor_session_id is null then
    raise exception 'reaction_actor_required';
  end if;

  if input_reaction is null
    or lower(input_reaction) not in ('confirm', 'dispute') then
    raise exception 'invalid_report_reaction';
  end if;

  select
    report.reporter_user_id,
    report.reporter_session_id
  into
    report_owner_user_id,
    report_owner_session_id
  from public.place_reports as report
  where report.id = input_report_id;

  if report_owner_user_id is null and report_owner_session_id is null then
    raise exception 'report_not_found';
  end if;

  if public.report_actor_matches(
    report_owner_user_id,
    report_owner_session_id,
    actor_user_id,
    actor_session_id
  ) then
    raise exception 'report_self_reaction_not_allowed';
  end if;

  insert into public.place_report_feedback (
    report_id,
    reactor_user_id,
    reactor_session_id,
    reaction
  )
  values (
    input_report_id,
    actor_user_id,
    actor_session_id,
    lower(input_reaction)
  )
  on conflict (report_id, reactor_identity) do update
  set
    reaction = excluded.reaction,
    updated_at = now();

  return query
  select *
  from public.place_report_feed
  where id = input_report_id;
end;
$$;

grant execute on function public.react_to_place_report(uuid, text, text) to anon, authenticated;

drop function if exists public.get_place_report_history(integer, uuid);
drop function if exists public.get_place_report_history(uuid, integer);

create or replace function public.get_place_report_history(
  input_place_id uuid,
  input_limit integer default 25
)
returns setof public.place_report_feed
language sql
security invoker
set search_path = public
as $$
  select *
  from public.place_report_feed
  where place_id = input_place_id
  order by created_at desc
  limit greatest(coalesce(input_limit, 25), 1);
$$;

grant execute on function public.get_place_report_history(uuid, integer) to anon, authenticated;

insert into public.places (
  name,
  description,
  address,
  opening_hours,
  closing_hours,
  latitude,
  longitude,
  cost_type,
  hourly_cost_min,
  hourly_cost_max,
  cost_notes,
  capacity_min,
  capacity_max,
  capacity_confidence,
  access_type,
  current_status,
  updated_at
)
select
  seed.name::text,
  seed.description::text,
  seed.address::text,
  hours.opening_hours::jsonb,
  hours.closing_hours::jsonb,
  seed.latitude::double precision,
  seed.longitude::double precision,
  seed.cost_type::text,
  seed.hourly_cost_min::numeric(10, 2),
  seed.hourly_cost_max::numeric(10, 2),
  seed.cost_notes::text,
  seed.capacity_min::integer,
  seed.capacity_max::integer,
  seed.capacity_confidence::text,
  seed.access_type::text,
  seed.current_status::text,
  now()
from (
  values
    ('Centro Comercial Altaria', 'Centro comercial al norte de la ciudad con estacionamiento para visitantes.', 'Boulevard a Zacatecas Km. 537, Trojes de Alonso, 20116 Aguascalientes, Ags.', 21.9237481, -102.2892982, 'mixed', 0.00, 25.00, 'Primeras 2 horas gratis con compra; despues aplica tarifa progresiva.', 850, 1200, 'range', 'mixed', 'unknown', 'mall_premium'),
    ('Plaza Patria', 'Plaza comercial del centro historico con estacionamiento de uso comercial.', 'Centro Comercial Plaza Patria, 5 de Mayo, Zona Centro, 20000 Aguascalientes, Ags.', 21.8790925, -102.2965229, 'paid', 18.00, 28.00, 'Tarifa por hora en estacionamiento del centro con alta rotacion.', 220, 320, 'range', 'mixed', 'unknown', 'downtown_commercial'),
    ('Plaza Universidad', 'Plaza comercial sobre Av. Universidad con estacionamiento para visitantes.', 'Avenida Universidad 935, Bosques del Prado, Aguascalientes, Ags.', 21.9152932, -102.3121020, 'mixed', 0.00, 22.00, 'Primeros 90 minutos sin costo durante horario comercial.', 180, 260, 'range', 'mixed', 'unknown', 'university_plaza'),
    ('Plaza Vestir', 'Plaza comercial textil con estacionamiento de superficie.', 'Avenida Jose Maria Chavez 1940, Ciudad Industrial, 20290 Aguascalientes, Ags.', 21.8395818, -102.2890587, 'paid', 15.00, 25.00, 'Tarifa preferente para visitas cortas con tope por jornada.', 140, 220, 'range', 'mixed', 'unknown', 'textile_market'),
    ('Centro Comercial El Dorado', 'Centro comercial de servicios al sur-oriente con estacionamiento para clientes.', 'Avenida Las Americas 1701, Valle Dorado, 20235 Aguascalientes, Ags.', 21.8627607, -102.3046255, 'mixed', 0.00, 20.00, 'Primer tramo gratis para clientes; despues cobro moderado.', 160, 240, 'range', 'mixed', 'unknown', 'neighborhood_plaza'),
    ('Centro Comercial El Parian', 'Plaza comercial del centro con estacionamiento rotativo.', 'Rivero y Gutierrez 29, Zona Centro, 20000 Aguascalientes, Ags.', 21.8831891, -102.2956326, 'paid', 17.00, 27.00, 'Cobro por hora con demanda alta en fines de semana.', 90, 140, 'range', 'mixed', 'unknown', 'downtown_commercial'),
    ('ExpoPlaza', 'Plaza y recinto comercial junto a la zona ferial.', 'Barrio de San Marcos, 20070 Aguascalientes, Ags.', 21.8760782, -102.3058642, 'paid', 25.00, 40.00, 'Tarifa variable por evento y temporada ferial.', 260, 420, 'estimated', 'mixed', 'unknown', 'fair_commercial'),
    ('Centro Comercial Galerias', 'Centro comercial con estacionamiento de alta afluencia al norte.', 'Avenida Independencia 2351, Trojes de Alonso, 20311 Aguascalientes, Ags.', 21.9235343, -102.2949220, 'mixed', 0.00, 24.00, 'Primeras 2 horas gratis con consumo en varias zonas comerciales.', 700, 950, 'range', 'mixed', 'unknown', 'mall_premium'),
    ('Patio Aguascalientes', 'Centro comercial sobre Jose Maria Chavez con estacionamiento amplio.', 'Calle Jose Maria Chavez 1531, Agricultura, 20234 Aguascalientes, Ags.', 21.8584720, -102.2940333, 'mixed', 0.00, 22.00, 'Primeros 90 minutos sin costo; despues tarifa fija por hora.', 380, 560, 'range', 'mixed', 'unknown', 'mall_standard'),
    ('Plaza Boreal', 'Plaza comercial al sur de la ciudad con estacionamiento de superficie.', 'Carretera Panamericana Sur Km. 11, Ejido Penuelas, 20349 Aguascalientes, Ags.', 21.7304301, -102.2784343, 'mixed', 0.00, 20.00, 'Primeras 2 horas gratis; tarifa reducida el resto del dia.', 240, 360, 'range', 'mixed', 'unknown', 'highway_plaza'),
    ('Soriana Plaza San Marcos', 'Centro comercial con supermercado y estacionamiento para visitantes.', 'Avenida Convencion esq. Fundicion 2301, San Cayetano, 20010 Aguascalientes, Ags.', 21.8965746, -102.3105326, 'mixed', 0.00, 18.00, 'Tiempo de cortesia para clientes; cobro en estancias largas.', 280, 420, 'range', 'mixed', 'unknown', 'supermarket_center'),
    ('Plaza de Toros Monumental de Aguascalientes', 'Recinto de espectaculos con estacionamiento para eventos.', 'Rafael Rodriguez Dominguez, Barrio de San Marcos, 20070 Aguascalientes, Ags.', 21.8749812, -102.3068258, 'paid', 30.00, 50.00, 'Cobro por evento; sube durante feria y fines de semana.', 450, 700, 'estimated', 'public', 'unknown', 'event_venue'),
    ('Chedraui Villa Asuncion', 'Tienda ancla con estacionamiento dentro de Villa Asuncion.', 'Avenida Mahatma Gandhi, Centro Comercial Villa Asuncion, 20288 Aguascalientes, Ags.', 21.8552107, -102.2938853, 'mixed', 0.00, 18.00, 'Tiempo de cortesia para compras con tope diario accesible.', 260, 380, 'range', 'mixed', 'unknown', 'supermarket_center'),
    ('Costco Aguascalientes', 'Tienda mayorista con estacionamiento amplio para socios y visitantes.', 'Avenida Aguascalientes Norte, 20350 Aguascalientes, Ags.', 21.9160424, -102.2879966, 'free', 0.00, 0.00, 'Sin costo dentro del horario de tienda para socios y visitantes autorizados.', 500, 750, 'range', 'mixed', 'unknown', 'wholesale_store'),
    ('Centro Comercial Agropecuario', 'Centro comercial y de abasto con estacionamiento y alto flujo diario.', 'Calle Manzano, 20135 Aguascalientes, Ags.', 21.9148913, -102.2930212, 'paid', 12.00, 20.00, 'Cobro economico con alta rotacion en horas pico.', 600, 900, 'estimated', 'mixed', 'unknown', 'wholesale_market'),
    ('Isla San Marcos', 'Recinto ferial y de eventos con estacionamiento de superficie.', 'Isla San Marcos, Aguascalientes, Ags.', 21.8613583, -102.3214750, 'paid', 30.00, 60.00, 'Tarifa por evento; en temporada alta se habilitan bolsas adicionales.', 900, 1400, 'estimated', 'public', 'unknown', 'fairgrounds_event'),
    ('Foro de Las Estrellas', 'Foro de conciertos de la feria con estacionamiento por evento.', 'Bulevar San Marcos 504, Colonia Espana, 20210 Aguascalientes, Ags.', 21.8717049, -102.3099982, 'paid', 35.00, 60.00, 'Tarifa por concierto o evento con permanencia limitada.', 700, 1100, 'estimated', 'public', 'unknown', 'concert_venue'),
    ('Estadio Victoria', 'Estadio de futbol con estacionamiento para dias de partido y eventos.', 'Calle Privada Jose Marin Iglesias, Colonia Heroes, 20259 Aguascalientes, Ags.', 21.8806558, -102.2754788, 'paid', 30.00, 55.00, 'Tarifa de evento; en dias sin partido opera con acceso restringido.', 600, 950, 'estimated', 'public', 'unknown', 'stadium_event'),
    ('Museo Descubre', 'Museo interactivo con estacionamiento para visitantes.', 'Avenida del Parque, 20277 Aguascalientes, Ags.', 21.8561749, -102.2892588, 'paid', 10.00, 18.00, 'Tarifa baja para visitas familiares y recorridos de media estancia.', 120, 200, 'range', 'public', 'unknown', 'museum_schedule'),
    ('Teatro Aguascalientes', 'Teatro y centro cultural con estacionamiento para funciones.', 'Avenida Jose Maria Chavez, 20284 Aguascalientes, Ags.', 21.8570590, -102.2912076, 'paid', 18.00, 30.00, 'Tarifa por funcion y eventos culturales nocturnos.', 180, 280, 'range', 'public', 'unknown', 'theater_schedule')
) as seed(
  name,
  description,
  address,
  latitude,
  longitude,
  cost_type,
  hourly_cost_min,
  hourly_cost_max,
  cost_notes,
  capacity_min,
  capacity_max,
  capacity_confidence,
  access_type,
  current_status,
  hours_profile
)
cross join lateral (
  select
    case seed.hours_profile
      when 'mall_premium' then jsonb_build_object(
        'monday', '10:00',
        'tuesday', '10:00',
        'wednesday', '10:00',
        'thursday', '10:00',
        'friday', '10:00',
        'saturday', '10:00',
        'sunday', '11:00'
      )
      when 'downtown_commercial' then jsonb_build_object(
        'monday', '08:00',
        'tuesday', '08:00',
        'wednesday', '08:00',
        'thursday', '08:00',
        'friday', '08:00',
        'saturday', '08:00',
        'sunday', '09:00'
      )
      when 'university_plaza' then jsonb_build_object(
        'monday', '08:00',
        'tuesday', '08:00',
        'wednesday', '08:00',
        'thursday', '08:00',
        'friday', '08:00',
        'saturday', '09:00',
        'sunday', '10:00'
      )
      when 'textile_market' then jsonb_build_object(
        'monday', '09:00',
        'tuesday', '09:00',
        'wednesday', '09:00',
        'thursday', '09:00',
        'friday', '09:00',
        'saturday', '09:00',
        'sunday', null
      )
      when 'neighborhood_plaza' then jsonb_build_object(
        'monday', '09:00',
        'tuesday', '09:00',
        'wednesday', '09:00',
        'thursday', '09:00',
        'friday', '09:00',
        'saturday', '09:00',
        'sunday', '10:00'
      )
      when 'fair_commercial' then jsonb_build_object(
        'monday', '10:00',
        'tuesday', '10:00',
        'wednesday', '10:00',
        'thursday', '10:00',
        'friday', '10:00',
        'saturday', '10:00',
        'sunday', '10:00'
      )
      when 'mall_standard' then jsonb_build_object(
        'monday', '09:00',
        'tuesday', '09:00',
        'wednesday', '09:00',
        'thursday', '09:00',
        'friday', '09:00',
        'saturday', '09:00',
        'sunday', '10:00'
      )
      when 'highway_plaza' then jsonb_build_object(
        'monday', '09:00',
        'tuesday', '09:00',
        'wednesday', '09:00',
        'thursday', '09:00',
        'friday', '09:00',
        'saturday', '09:00',
        'sunday', '09:00'
      )
      when 'supermarket_center' then jsonb_build_object(
        'monday', '07:00',
        'tuesday', '07:00',
        'wednesday', '07:00',
        'thursday', '07:00',
        'friday', '07:00',
        'saturday', '07:00',
        'sunday', '08:00'
      )
      when 'event_venue' then jsonb_build_object(
        'monday', null,
        'tuesday', null,
        'wednesday', null,
        'thursday', null,
        'friday', '18:00',
        'saturday', '16:00',
        'sunday', '13:00'
      )
      when 'wholesale_store' then jsonb_build_object(
        'monday', '10:00',
        'tuesday', '10:00',
        'wednesday', '10:00',
        'thursday', '10:00',
        'friday', '10:00',
        'saturday', '09:30',
        'sunday', '10:00'
      )
      when 'wholesale_market' then jsonb_build_object(
        'monday', '05:00',
        'tuesday', '05:00',
        'wednesday', '05:00',
        'thursday', '05:00',
        'friday', '05:00',
        'saturday', '05:00',
        'sunday', '06:00'
      )
      when 'fairgrounds_event' then jsonb_build_object(
        'monday', null,
        'tuesday', null,
        'wednesday', null,
        'thursday', null,
        'friday', '17:00',
        'saturday', '12:00',
        'sunday', '12:00'
      )
      when 'concert_venue' then jsonb_build_object(
        'monday', null,
        'tuesday', null,
        'wednesday', null,
        'thursday', null,
        'friday', '18:00',
        'saturday', '18:00',
        'sunday', '18:00'
      )
      when 'stadium_event' then jsonb_build_object(
        'monday', null,
        'tuesday', null,
        'wednesday', null,
        'thursday', null,
        'friday', '17:00',
        'saturday', '15:00',
        'sunday', '12:00'
      )
      when 'museum_schedule' then jsonb_build_object(
        'monday', null,
        'tuesday', '09:00',
        'wednesday', '09:00',
        'thursday', '09:00',
        'friday', '09:00',
        'saturday', '10:00',
        'sunday', '10:00'
      )
      when 'theater_schedule' then jsonb_build_object(
        'monday', null,
        'tuesday', '16:00',
        'wednesday', '16:00',
        'thursday', '16:00',
        'friday', '16:00',
        'saturday', '15:00',
        'sunday', '15:00'
      )
      else null
    end as opening_hours,
    case seed.hours_profile
      when 'mall_premium' then jsonb_build_object(
        'monday', '22:00',
        'tuesday', '22:00',
        'wednesday', '22:00',
        'thursday', '22:00',
        'friday', '23:00',
        'saturday', '23:00',
        'sunday', '21:00'
      )
      when 'downtown_commercial' then jsonb_build_object(
        'monday', '22:00',
        'tuesday', '22:00',
        'wednesday', '22:00',
        'thursday', '22:00',
        'friday', '22:00',
        'saturday', '22:00',
        'sunday', '20:00'
      )
      when 'university_plaza' then jsonb_build_object(
        'monday', '21:00',
        'tuesday', '21:00',
        'wednesday', '21:00',
        'thursday', '21:00',
        'friday', '21:00',
        'saturday', '21:00',
        'sunday', '19:00'
      )
      when 'textile_market' then jsonb_build_object(
        'monday', '20:00',
        'tuesday', '20:00',
        'wednesday', '20:00',
        'thursday', '20:00',
        'friday', '20:00',
        'saturday', '18:00',
        'sunday', null
      )
      when 'neighborhood_plaza' then jsonb_build_object(
        'monday', '21:00',
        'tuesday', '21:00',
        'wednesday', '21:00',
        'thursday', '21:00',
        'friday', '21:00',
        'saturday', '21:00',
        'sunday', '19:00'
      )
      when 'fair_commercial' then jsonb_build_object(
        'monday', '20:00',
        'tuesday', '20:00',
        'wednesday', '20:00',
        'thursday', '20:00',
        'friday', '23:00',
        'saturday', '23:00',
        'sunday', '22:00'
      )
      when 'mall_standard' then jsonb_build_object(
        'monday', '22:00',
        'tuesday', '22:00',
        'wednesday', '22:00',
        'thursday', '22:00',
        'friday', '22:00',
        'saturday', '22:00',
        'sunday', '20:00'
      )
      when 'highway_plaza' then jsonb_build_object(
        'monday', '21:00',
        'tuesday', '21:00',
        'wednesday', '21:00',
        'thursday', '21:00',
        'friday', '21:00',
        'saturday', '21:00',
        'sunday', '20:00'
      )
      when 'supermarket_center' then jsonb_build_object(
        'monday', '22:00',
        'tuesday', '22:00',
        'wednesday', '22:00',
        'thursday', '22:00',
        'friday', '22:00',
        'saturday', '22:00',
        'sunday', '21:00'
      )
      when 'event_venue' then jsonb_build_object(
        'monday', null,
        'tuesday', null,
        'wednesday', null,
        'thursday', null,
        'friday', '23:30',
        'saturday', '23:30',
        'sunday', '22:00'
      )
      when 'wholesale_store' then jsonb_build_object(
        'monday', '20:30',
        'tuesday', '20:30',
        'wednesday', '20:30',
        'thursday', '20:30',
        'friday', '20:30',
        'saturday', '21:00',
        'sunday', '17:00'
      )
      when 'wholesale_market' then jsonb_build_object(
        'monday', '17:00',
        'tuesday', '17:00',
        'wednesday', '17:00',
        'thursday', '17:00',
        'friday', '17:00',
        'saturday', '16:00',
        'sunday', '14:00'
      )
      when 'fairgrounds_event' then jsonb_build_object(
        'monday', null,
        'tuesday', null,
        'wednesday', null,
        'thursday', null,
        'friday', '23:00',
        'saturday', '23:30',
        'sunday', '21:00'
      )
      when 'concert_venue' then jsonb_build_object(
        'monday', null,
        'tuesday', null,
        'wednesday', null,
        'thursday', null,
        'friday', '23:30',
        'saturday', '23:30',
        'sunday', '22:30'
      )
      when 'stadium_event' then jsonb_build_object(
        'monday', null,
        'tuesday', null,
        'wednesday', null,
        'thursday', null,
        'friday', '23:00',
        'saturday', '23:00',
        'sunday', '22:00'
      )
      when 'museum_schedule' then jsonb_build_object(
        'monday', null,
        'tuesday', '18:00',
        'wednesday', '18:00',
        'thursday', '18:00',
        'friday', '18:00',
        'saturday', '18:00',
        'sunday', '18:00'
      )
      when 'theater_schedule' then jsonb_build_object(
        'monday', null,
        'tuesday', '22:00',
        'wednesday', '22:00',
        'thursday', '22:00',
        'friday', '22:00',
        'saturday', '22:00',
        'sunday', '21:00'
      )
      else null
    end as closing_hours
) as hours
where not exists (
  select 1
  from public.places as place
  where place.name = seed.name
    and place.latitude = seed.latitude
    and place.longitude = seed.longitude
);

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update
set public = excluded.public;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'avatars_upload_own'
  ) then
    create policy avatars_upload_own
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'avatars_update_own'
  ) then
    create policy avatars_update_own
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      )
      with check (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'avatars_delete_own'
  ) then
    create policy avatars_delete_own
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'avatars'
        and (storage.foldername(name))[1] = auth.uid()::text
      );
  end if;
end $$;

notify pgrst, 'reload schema';

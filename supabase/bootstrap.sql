-- ParkPulse MVP bootstrap (schema + seed)
-- Run this in Supabase SQL Editor.

-- Optional extension for UUID generation.
create extension if not exists pgcrypto;

-- Places table used by the current app query in src/lib/places.ts.
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

-- Enable RLS and allow public read for MVP map markers.
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

-- Seed data for Aguascalientes pilot zone.
insert into public.places (name, latitude, longitude, current_status, updated_at)
values
  ('Centro - Plaza Patria', 21.8817, -102.2961, 'available', now()),
  ('Zona Feria - Estadio', 21.8728, -102.3091, 'full', now()),
  ('Av. Universidad', 21.9143, -102.3096, 'closed', now()),
  ('Altaria Mall', 21.9209, -102.3025, 'available', now()),
  ('San Marcos', 21.8795, -102.2914, 'unknown', now())
on conflict do nothing;

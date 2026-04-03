# Supabase Setup

## 1) Create project
- Go to Supabase and create a new project.

## 2) Run SQL bootstrap
- Open `SQL Editor`.
- Paste and run the full file:
  - `supabase/bootstrap.sql`

This script now creates:
- `user_profiles` for personal user data (`email`, `phone`, `full_name`, `preferred_name`, `avatar_url`)
- `places` as the persistent parking catalog with coordinates, pricing and capacity ranges
- `place_reports` as the parking availability history table
- `place_ratings` as the parking rating table
- `place_live_status` as the frontend-friendly live status view
- `place_report_feed` as the recent-history feed with reporter display name

It also creates these RPC endpoints:
- `create_place(...)`
- `create_place_report(...)`
- `upsert_place_rating(place_id, rating, comment, session_id)`

Optional SQL helper:
- `get_place_report_history(place_id, limit)`

## 3) Add app env vars
Create `.env` in the project root:

```bash
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_ANON_KEY
```

Where to find values:
- `URL`: Project Settings -> API -> Project URL
- `ANON KEY`: Project Settings -> API -> Project API keys -> `anon public`

## 4) Start app
```bash
npm run start
```

If `.env` values are valid:
- markers load from `place_live_status`
- new parking places are persisted through `create_place`
- reports are persisted through `create_place_report`
- place history loads from `place_report_feed`

If `.env` values are missing, the app falls back to local demo reads only. Persistent writes require Supabase to be configured.

## 5) Suggested verification in SQL Editor
Run a quick smoke test after the bootstrap:

```sql
select * from public.place_live_status order by name;
select * from public.place_report_feed order by created_at desc limit 5;
select * from public.user_profiles limit 5;
```

If you already have users in `auth.users`, `user_profiles` will be backfilled automatically by the bootstrap.

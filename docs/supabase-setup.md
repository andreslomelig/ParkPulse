# Supabase Setup (MVP)

## 1) Create project
- Go to Supabase and create a new project.

## 2) Run SQL bootstrap
- Open `SQL Editor`.
- Paste and run the full file:
  - `supabase/bootstrap.sql`

This script now creates:
- `places` as the base parking catalog
- `place_reports` as the report history/event table
- `place_live_status` as the frontend-friendly live status view
- `place_report_feed` as the simple recent-history feed

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

If `.env` values are valid, markers load from Supabase.
If not, app falls back to local demo markers and local report history.

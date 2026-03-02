# Supabase Setup (MVP)

## 1) Create project
- Go to Supabase and create a new project.

## 2) Run SQL bootstrap
- Open `SQL Editor`.
- Paste and run:
  - `supabase/bootstrap.sql`

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
If not, app falls back to local demo markers.

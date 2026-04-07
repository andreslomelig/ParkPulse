# ParkPulse

Community-powered parking discovery for **Aguascalientes (pilot)**.

ParkPulse is a map-first mobile app for finding and validating parking with
community input. Users can sign in, explore parking places, report real-time
availability, save favorite places, rate and review parking lots, and maintain
their own profile with theme and avatar customization.

## What The App Does Now

- Email/password authentication with Supabase Auth
- Map-first parking exploration for Aguascalientes
- Rich place detail sheet with:
  - live status
  - last update
  - report activity summary
  - rating summary
  - hours, pricing, capacity, and access details
- Search overlay with local filtering
- Parking place creation flow backed by Supabase RPCs
- Report submission flow with proximity information and TTL-based status expiry
- Review composer with star rating and optional comment
- Review list modal per parking place
- Saved places list per signed-in user
- Personal report history screen
- Editable profile/settings screen with:
  - preferred name
  - full name
  - phone
  - avatar URL
  - profile photo upload from device to Supabase Storage
  - local theme preference

## Current Product Status

Implemented:

- Authenticated app shell
- Persistent `places`, `place_reports`, `place_ratings`, and `user_profiles`
- Storage bucket for user avatars
- Frontend flows for create place, report, save, review, and profile editing
- Data-layer test coverage across `src/lib`
- UI tests for key app flows

Still pending or intentionally incomplete:

- OTP / phone auth
- Admin moderation tools
- Stricter server-side reputation and anti-abuse controls
- Bot resistance and contributor reliability scoring
- Realtime subscriptions
- Reservations / payments

## Core Domain Model

The current Supabase bootstrap creates and uses:

- `user_profiles`
  - profile data tied to `auth.users`
  - fields include `email`, `phone`, `full_name`, `preferred_name`, `avatar_url`
- `places`
  - persistent parking lot catalog
  - coordinates, description, pricing, hours, capacity, access type, and status
- `place_reports`
  - availability reports from users or session actors
  - TTL-based expiration per status
- `place_ratings`
  - one rating/comment identity per place
- `place_live_status`
  - frontend-friendly live place read model
- `place_report_feed`
  - frontend-friendly report history read model
- `place_review_feed`
  - frontend-friendly review feed
- `avatars` storage bucket
  - profile images uploaded from the app

RPCs:

- `create_place(...)`
- `create_place_report(...)`
- `upsert_place_rating(...)`
- optional helper: `get_place_report_history(...)`

## Pilot Rules In The Current App

- Pilot city: Aguascalientes
- Parking status options:
  - `available`
  - `full`
  - `closed`
- TTL defaults:
  - `available`: 15 minutes
  - `full`: 30 minutes
  - `closed`: 12 hours
- Report proximity target:
  - 200 meters in the current frontend flow

## Tech Stack

- Expo
- React Native
- TypeScript
- `react-native-maps`
- `@gorhom/bottom-sheet`
- `react-native-gesture-handler`
- `react-native-reanimated`
- Supabase
  - Auth
  - Postgres
  - Storage
- Jest
- React Native Testing Library

## Project Structure

```text
src/
  components/
  i18n/
  lib/
  navigation/
  screens/
docs/
supabase/
assets/
```

Important areas:

- [App.tsx](./App.tsx): app root
- [src/navigation/AppNavigator.tsx](./src/navigation/AppNavigator.tsx): auth-aware navigation
- [src/screens/MapScreen.tsx](./src/screens/MapScreen.tsx): main product flow
- [src/screens/ProfileSettingsScreen.tsx](./src/screens/ProfileSettingsScreen.tsx): profile/theme/avatar settings
- [src/lib/places.ts](./src/lib/places.ts): places API and normalization
- [src/lib/reports.ts](./src/lib/reports.ts): reports API and normalization
- [src/lib/reviews.ts](./src/lib/reviews.ts): review feed reads
- [src/lib/ratings.ts](./src/lib/ratings.ts): rating writes
- [src/lib/profiles.ts](./src/lib/profiles.ts): profile reads/writes
- [src/lib/avatarUploads.ts](./src/lib/avatarUploads.ts): device image picker + avatar upload
- [supabase/bootstrap.sql](./supabase/bootstrap.sql): database and storage bootstrap

## Getting Started

### Prerequisites

- Node.js 22 recommended
- npm
- Expo CLI through `npx`
- Optional:
  - Android Studio
  - Xcode

If you use `nvm`:

```bash
nvm use
```

### Install

```bash
npm install
```

### Environment Variables

Create a `.env` file from `.env.example` and set:

```env
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
```

Do not commit `.env`.

### Run The App

```bash
npm run start
```

If native packages changed, use a clean Expo cache:

```bash
npx expo start -c
```

## Supabase Setup

Run the SQL in [supabase/bootstrap.sql](./supabase/bootstrap.sql) inside Supabase SQL Editor.

Full setup guide:

- [docs/supabase-setup.md](./docs/supabase-setup.md)

The bootstrap sets up:

- profile sync from `auth.users`
- places schema and seed data
- report and rating tables
- frontend-oriented views
- avatar storage bucket
- RLS policies for profile data and avatar uploads

## Avatar Upload Setup

The app now supports picking a profile picture from the device and uploading it
to Supabase Storage.

Requirements in Supabase:

- bucket name must be exactly `avatars`
- bucket can be public for simple profile images
- storage policies must allow authenticated uploads

Current app upload path format:

```text
<auth.uid()>/avatar.<ext>
```

The uploaded public URL is saved into:

```text
public.user_profiles.avatar_url
```

If you migrated or rebuilt your Supabase project, rerun the latest
[supabase/bootstrap.sql](./supabase/bootstrap.sql) so Storage policies and the
bucket match the current app code.

## Available Scripts

- `npm run start`: start Expo / Metro
- `npm run android`: open Android target
- `npm run ios`: open iOS target
- `npm run web`: open web target
- `npm run lint`: run ESLint
- `npm run typecheck`: run TypeScript checks
- `npm test`: run Jest

## Testing

Current automated testing covers:

- normalized data and API behavior in `src/lib`
- navigation behavior
- key screen flows such as:
  - map loading
  - search
  - save place
  - create place
  - submit report
  - open reviews
  - profile settings
  - avatar upload helper

Important test files include:

- `src/lib/*.test.ts`
- `src/navigation/AppNavigator.test.tsx`
- `src/screens/MapScreen.test.tsx`
- `src/screens/ProfileSettingsScreen.test.tsx`

## Known Product Gaps

These are the main areas still needing work:

- stronger server-side rate limiting
- anti-troll review/report moderation
- reliability scoring for contributors
- bot detection / abuse prevention
- admin review tools
- better conflict resolution for place edits

## Troubleshooting

### Uploads Fail With RLS Errors

If profile picture upload fails with:

```text
new row violates row-level security policy
```

then the problem is usually in Supabase Storage setup, not the app UI.

Check:

- the `avatars` bucket exists
- old conflicting storage policies are removed
- the latest bootstrap SQL has been applied

### Native / Node Setup Problems

If `npm` or `node` fails before install, repair your Node environment or use
the version declared by `.nvmrc`.

## Contributing

- Create one branch per ticket
- Use conventional commits

Example:

```text
feat(profile): add avatar upload flow
```

## License

Proprietary for now.

# ParkPulse

Community-powered parking availability for **Aguascalientes (pilot)**.\
Think **"Waze for parking"**: users report **Disponible / Lleno /
Cerrado** in real time with expiration (TTL), proximity checks, and
anti-spam rules.

------------------------------------------------------------------------

## Current App Status

-   Map-first pilot experience for Aguascalientes
-   Required email/password authentication before entering the app
-   Parking place bottom sheet with richer place details, rating summary and recent history
-   Search overlay with local client-side filtering
-   Session-aware menu with user identity and sign out
-   Editable profile settings with theme selection and profile photo support
-   Persistent parking creation flow backed by Supabase RPCs
-   Report flow with proximity validation connected to Supabase
-   Supabase schema integrated for `user_profiles`, `places`, `place_reports` and `place_ratings`

OTP auth and stricter server-side rate limits are still pending.

------------------------------------------------------------------------

## MVP (Pilot Scope)

-   Map with parking places (pilot zone)
-   Place details: status, last updated, confidence
-   Email/password login required to use the app
-   Reports expire automatically (TTL)
-   Proximity validation + rate limiting

------------------------------------------------------------------------

## Tech Stack

-   **Expo + React Native (TypeScript)**
-   **react-native-maps**
-   **@gorhom/bottom-sheet**
-   **react-native-gesture-handler**
-   **react-native-reanimated**
-   **Supabase (Postgres + PostGIS)** *(backend planned / in progress)*
-   **GitHub Actions (CI)**
-   **Jest + React Native Testing Library**
-   **EAS Build (release pipeline)**

------------------------------------------------------------------------

## Getting Started

### Prerequisites

-   Node.js 22 recommended (`.nvmrc` included)
-   npm
-   Expo CLI (via `npx`)
-   (Optional) Android Studio / Xcode for simulators

If you use `nvm`:

``` bash
nvm use
```

------------------------------------------------------------------------

### Install

``` bash
npm install
```

------------------------------------------------------------------------

### Run (Development)

``` bash
npm run start
```

Use a clean cache if native UI packages were added or updated:

``` bash
npx expo start -c
```

------------------------------------------------------------------------

## Troubleshooting

### `node` or `npm` fails before install

If you see an error similar to:

    Library not loaded: ... libsimdjson ...

your local Homebrew Node installation is broken, so the app cannot start yet.

Fix it by reinstalling Node, or by using `nvm` with the version in `.nvmrc`.

Example with Homebrew:

``` bash
brew reinstall simdjson
brew reinstall node
```

Example with `nvm`:

``` bash
nvm install 22
nvm use 22
npm install
npm run start
```

------------------------------------------------------------------------

## Environment Variables

Create a `.env` file based on `.env.example`.

### Required

    EXPO_PUBLIC_SUPABASE_URL=
    EXPO_PUBLIC_SUPABASE_ANON_KEY=

Never commit `.env`.\
Use `.env.example` for placeholders only.

------------------------------------------------------------------------

## Supabase Bootstrap (Now Available)

- Run the SQL in [supabase/bootstrap.sql](supabase/bootstrap.sql) inside Supabase SQL Editor.
- Full setup guide: [docs/supabase-setup.md](docs/supabase-setup.md)

This creates:

- `user_profiles` for personal user data synced from `auth.users`
- `avatars` storage bucket for profile pictures
- `places` for parking metadata, pricing, coordinates and capacity ranges
- `place_reports` for availability history with timestamps and reporter identity
- `place_ratings` for community ratings per parking place
- `place_live_status` and `place_report_feed` for frontend-friendly reads
- RPC endpoints: `create_place`, `create_place_report`, `upsert_place_rating`
- Optional SQL helper: `get_place_report_history(place_id, limit)`

------------------------------------------------------------------------

## Scripts

-   `npm run start` --- Start Metro bundler
-   `npm run lint` --- Run ESLint
-   `npm run typecheck` --- Run TypeScript checks
-   `npm test` --- Run frontend Jest tests
-   `npm test -- --coverage --runInBand` --- Enforce 100% coverage for `src/lib`
-   `npx expo start -c` --- To erase the local mobile cache (to restart all information in-device)

------------------------------------------------------------------------

## Project Structure (WIP)

    src/
      navigation/
      screens/
      components/
      lib/
      i18n/
    docs/
    .github/workflows/

------------------------------------------------------------------------

## CI

GitHub Actions runs on Pull Requests:

-   expo-doctor
-   lint
-   typecheck
-   test

------------------------------------------------------------------------

## Frontend Testing

Testing now covers two levels:

-   100% coverage enforced for the data/API layer in `src/lib`
-   UI interaction tests for the map flows that matter most to the product

Current UI coverage focuses on stable frontend behavior instead of gesture feel:

-   search overlay opens and filters places
-   menu shell opens
-   parking place creation calls the persistent API
-   report flow opens from the place sheet
-   nearby report submission shows confirmation

Files:

-   `jest.config.js`
-   `jest.setup.ts`
-   `src/lib/*.test.ts`
-   `src/screens/MapScreen.test.tsx`

------------------------------------------------------------------------

## Contributing

-   Create a branch per Jira ticket:

        feature/PD-XX-short-title

-   Use Conventional Commits:

        feat(scope): message (PD-XX)

------------------------------------------------------------------------

## License

Proprietary (for now).\
Update when ready.

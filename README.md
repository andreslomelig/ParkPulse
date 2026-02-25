# ParkPulse

Community-powered parking availability for **Aguascalientes (pilot)**.\
Think **"Waze for parking"**: users report **Disponible / Lleno /
Cerrado** in real time with expiration (TTL), proximity checks, and
anti-spam rules.

------------------------------------------------------------------------

## MVP (Pilot Scope)

-   Map with parking places (pilot zone)
-   Place details: status, last updated, confidence
-   Phone login required to report
-   Reports expire automatically (TTL)
-   Proximity validation + rate limiting

------------------------------------------------------------------------

## Tech Stack

-   **Expo + React Native (TypeScript)**
-   **react-native-maps**
-   **Supabase (Postgres + PostGIS)** *(backend planned / in progress)*
-   **GitHub Actions (CI)**
-   **EAS Build (release pipeline)**

------------------------------------------------------------------------

## Getting Started

### Prerequisites

-   Node.js 18+
-   npm
-   Expo CLI (via `npx`)
-   (Optional) Android Studio / Xcode for simulators

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

------------------------------------------------------------------------

## Environment Variables

Create a `.env` file based on `.env.example`.

### Required

    EXPO_PUBLIC_SUPABASE_URL=
    EXPO_PUBLIC_SUPABASE_ANON_KEY=

Never commit `.env`.\
Use `.env.example` for placeholders only.

------------------------------------------------------------------------

## Scripts

-   `npm run start` --- Start Metro bundler
-   `npm run lint` --- Run ESLint
-   `npm run typecheck` --- Run TypeScript checks

------------------------------------------------------------------------

## 🗂 Project Structure (WIP)

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

------------------------------------------------------------------------

# Pro Repo Extras (High Value, Low Effort)

## 1️⃣ `.env.example`

Create a file named `.env.example`:

    EXPO_PUBLIC_SUPABASE_URL=
    EXPO_PUBLIC_SUPABASE_ANON_KEY=

------------------------------------------------------------------------

## 2️⃣ Ensure `.env` is Ignored

Make sure your `.gitignore` includes:

    .env
    .env.*

------------------------------------------------------------------------

## 3️⃣ Pull Request Template (Optional but Recommended)

Create:

    .github/pull_request_template.md

With:

``` md
## What
- 

## Why
- 

## How to test
- 

## Jira
- PD-XX
```

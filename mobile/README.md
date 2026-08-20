# VAIVIA iOS Phase 1

This directory is a separate Vite/React entry point for the locally bundled
Capacitor iOS application. The existing Next.js application remains the web UI
and hosted backend at `https://vaivia.app`.

## Browser-safe environment

The mobile build reads only these browser-safe values from the repository root
environment files:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

Optional mobile-specific overrides are:

- `VITE_MOBILE_SUPABASE_URL`
- `VITE_MOBILE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_MOBILE_API_BASE_URL`

The production API base defaults to `https://vaivia.app`. Never provide a
Supabase secret/service-role key to the mobile build.

## Commands

```bash
npm install
npm run mobile:build
npm run mobile:sync
npm run mobile:ios
```

`mobile:sync` builds the Vite application before copying it into the native iOS
project. `mobile:ios` also syncs before opening the project in Xcode.

Capacitor 8 requires Xcode 26 or newer. In Xcode, select the `App` target,
choose a development team under Signing & Capabilities, select an iPhone or
simulator, and run the app.

## Phase 1 scope

The native bundle includes email/password authentication, active trip lists,
trip itinerary details, and local client navigation. It intentionally does not
register a service worker or include PWA install/Web Push behavior. OAuth,
native push, Maps/Places, wallet/download handling, and deep links are later
phases.

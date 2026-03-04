# ParkPulse UX/UI Research Notes (Maps-First MVP)

Date: 2026-03-04

## Goal
Build a clean, map-first UX inspired by leading map apps while staying focused on ParkPulse's core action: community parking status updates.

## What We Borrowed (and Why)
1. Fast single-tap primary action (Waze/Material FAB pattern)
- Keep a high-emphasis `+` action visible to reduce friction for contributions.
- Source: Android Developers FAB guidance and Waze reporting direction.

2. Marker-first map with a persistent details panel
- Keep the map visible and show place context in a bottom sheet instead of full-screen transitions.
- Source: Material bottom sheet guidance.

3. Pin placement for user-submitted locations
- Let users drop/adjust a pin on map for better location accuracy.
- Source: Uber pickup pin edit pattern and Google Maps contribute behavior.

4. Permission timing and trust
- Request location permission only when useful and explain value clearly.
- Source: Apple HIG/privacy and Apple location authorization docs.

## Implemented in this pass
- Top map card with clear pilot context.
- Status legend (Disponible/Lleno/Cerrado).
- Two map FABs:
  - `+` toggle add-place mode.
  - recenter button.
- Add-place flow:
  - Tap `+`.
  - Tap map to place draft marker.
  - Save/cancel from bottom sheet.
- Place details sheet:
  - Name, status pill, updated time.
  - `Reportar` (stub for next sprint), `Navegar` (opens map app).

## Design principles for next iterations
1. Keep one dominant action per state.
2. Never hide critical context behind multiple taps.
3. Preserve map continuity (avoid screen jumps).
4. Use status color + text together (not color only).
5. Make contribution flow complete in <= 2 taps after selecting a place.

## Suggested brand direction (starter)
- Primary action color: cyan/blue (`#0ea5e9`) for trust + visibility.
- Semantic status colors:
  - Available: green
  - Full: red
  - Closed: slate
- Base surfaces: white and slate neutrals for map contrast.

## Sources
- https://developer.android.com/guide/topics/ui/floating-action-button
- https://developer.android.com/develop/ui/compose/components/fab
- https://m1.material.io/components/bottom-sheets.html
- https://developer.apple.com/design/human-interface-guidelines/privacy
- https://developer.apple.com/documentation/bundleresources/choosing-the-location-services-authorization-to-request
- https://www.uber.com/hr/en/ride/how-it-works/change-location/
- https://maps.google.com/localguides/home/
- https://blog.google/waze/conversational-reporting-waze/

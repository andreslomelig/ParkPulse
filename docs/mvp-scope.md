# ParkPulse MVP Scope (Pilot: Aguascalientes)

## Goal
Help drivers find parking faster using community real-time reports (available/full/closed) in a pilot zone.

## Pilot Zone
- City: Aguascalientes
- Zone type: geo-fenced bounding box (configurable)
- MVP only returns/accepts reports inside pilot zone.

## MVP Features (IN)
- Map view with parking places markers (seeded list)
- Place details sheet: status, last updated, confidence label
- Email/password login required to report
- Report status: Disponible / Lleno / Cerrado
- Reports expire (TTL)
- Proximity check to report (must be near place)
- Rate limiting per user (anti-spam)
- Manual refresh / periodic refresh (if no realtime)
- Basic privacy/legal screen

## Demo Assumptions
- Supabase is configured for the live demo.
- The pilot database is seeded with three base places in Aguascalientes.
- The demo uses manual refresh as the operator-visible way to confirm new reports between devices.

## OUT (Not in MVP)
- Reservations / payments
- Predictive availability / heatmaps
- Full admin dashboard (use Supabase dashboard manually)
- Real-time subscriptions by tile (optional later)
- Street segment modeling (polylines) (later)

## Success Metrics (Pilot)
- ≥ 30 reports/day in pilot zone
- ≥ 30% of reports confirmed (later metric)
- Crash-free sessions > 99% (after adding crash reporting)

## Default Rules
- TTL:
  - Disponible: 15 min
  - Lleno: 30 min
  - Cerrado: 12 h
- Proximity to report: 200 m
- Rate limit: 5 reports / 10 min / user

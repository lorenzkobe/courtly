# API Optimization Verification (Phase 2)

## Automated Checks Run

- `npx tsc --noEmit` passed.
- `npx eslint` across edited Phase 2 files passed.

## Pagination Rollout Completed

- Added cursor contract (`cursor`, `limit`) with server-side limits for:
  - `GET /api/notifications`
  - `GET /api/me/bookings-overview`
  - `GET /api/bookings` (paged mode when cursor/limit supplied)
  - `GET /api/superadmin/directory`
  - `GET /api/admin/flagged-reviews`
- Added load-more UI via React Query infinite queries for:
  - `src/components/notifications/NotificationBell.tsx`
  - `src/app/(app)/my-bookings/page.tsx`
  - `src/app/(app)/admin/bookings/page.tsx`
  - `src/app/(app)/superadmin/users/page.tsx`
  - `src/app/(app)/superadmin/venues/page.tsx`
  - `src/app/(app)/superadmin/moderation/page.tsx`

## DB/Query Cost Hardening Completed

- Added paged helper reads in `src/lib/data/courtly-db.ts` to avoid loading full lists.
- Added index migration: `supabase/migrations/0010_phase2_cost_indexes.sql` for high-volume filter/sort paths.

## Observability Guardrails Added

- Added structured endpoint logs (`route`, `duration_ms`, `limit`, `cursor`, `payload_bytes`, `row_counts`) for priority paged routes through:
  - `src/lib/observability/api-metrics.ts`

## Notes

- `GET /api/bookings` remains backward-compatible: existing consumers still receive full arrays unless `cursor` or `limit` is provided.
- `next_cursor` is offset-backed and opaque to clients (encoded token), keeping the contract consistent for frontend pagination.

# API Optimization Verification

## Automated Checks Run

- `npx tsc --noEmit` passed.
- `npx eslint` across all changed files passed.

## Request Count Improvements (per page load)


| Page                                            | Before                                                 | After                             | Delta |
| ----------------------------------------------- | ------------------------------------------------------ | --------------------------------- | ----- |
| `src/app/(app)/courts/[id]/book/page.tsx`       | 3 reads (`court context` + `availability` + `reviews`) | 1 read (`booking surface`)        | -2    |
| `src/app/(app)/my-bookings/[id]/page.tsx`       | 3 reads (`booking` + `court` + `reviews`)              | 1 read (`booking detail context`) | -2    |
| `src/app/(app)/my-bookings/page.tsx`            | 2 reads (`bookings` + `registrations`)                 | 1 read (`me/bookings-overview`)   | -1    |
| `src/app/(app)/admin/venues/[venueId]/page.tsx` | 2 reads (`manageable courts` + `venue detail`)         | 1 read (`admin venue workspace`)  | -1    |
| `src/app/(app)/superadmin/users/page.tsx`       | 2 reads (`managed users` + `venues`)                   | 1 read (`superadmin directory`)   | -1    |
| `src/app/(app)/superadmin/venues/page.tsx`      | 2 reads (`venues` + `managed users`)                   | 1 read (`superadmin directory`)   | -1    |


## Mutation Fanout Improvements

- Admin venue closure apply changed from N x M individual POST calls (`courts` x `time ranges`) to one bulk API call:
  - before: repeated `POST /api/courts/:courtId/closures`
  - after: single `POST /api/admin/venues/:venueId/closures/bulk`

## Backend Scoping Improvements

- Replaced broad full-list scans and in-memory joins in core routes with scoped helper reads:
  - courts listing now scoped by manageable/public filters with review summaries by venue ids.
  - venue detail/write flows now query by `venueId` and scoped assignments.
  - dashboard overview now queries per-user/per-date and limited tournament/open-play lists.
  - revenue now uses billable booking query scoped by selected courts/date range.
  - flagged reviews now fetch only flagged rows and scoped related bookings/courts/venues.

## Authorization/Boundary Checks Applied

- New aggregate routes enforce existing role checks and venue scope checks:
  - `canMutateVenue` for admin venue workspace and bulk closures.
  - `superadmin` gate for directory aggregate route.
  - existing booking access control (`canReadBooking`) retained in booking detail context route.


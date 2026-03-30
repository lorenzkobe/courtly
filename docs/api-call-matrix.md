# API Call Matrix and Waste Audit

This matrix maps app pages to API calls and labels each call as:

- `required`: needed for rendered UI and actions.
- `conditional`: required only in specific states.
- `wasteful`: avoidable call or oversized payload for page needs.

## User Pages

| Page | Endpoint calls | Classification | Notes |
| --- | --- | --- | --- |
| `src/app/(app)/dashboard/page.tsx` | `GET /api/dashboard/overview` | required | Single endpoint per page already. |
| `src/app/(app)/courts/page.tsx` | `GET /api/courts` | required | Needs list cards and filters. |
| `src/app/(app)/courts/[id]/book/page.tsx` | `GET /api/courts/:id?include_context=true`, `GET /api/courts/:id/availability`, `GET /api/venues/:venueId/reviews` | wasteful | Three read calls for one screen and response overlap. |
| `src/app/(app)/my-bookings/page.tsx` | `GET /api/bookings`, `GET /api/tournament-registrations` | conditional | Registrations query only needed for tournaments tab. |
| `src/app/(app)/my-bookings/[id]/page.tsx` | `GET /api/bookings/:id?include_group=true`, `GET /api/courts/:id`, `GET /api/venues/:venueId/reviews` | wasteful | Chained reads for single detail view. |
| `src/app/(app)/open-play/page.tsx` | `GET /api/open-play` | required | Main list query. |
| `src/app/(app)/tournaments/[id]/page.tsx` | `GET /api/tournaments/:id` | required | Detail fetch. |
| `src/components/notifications/NotificationBell.tsx` | `GET /api/notifications` | required | Active query required for realtime badge updates. |

## Admin and Superadmin Pages

| Page | Endpoint calls | Classification | Notes |
| --- | --- | --- | --- |
| `src/app/(app)/admin/venues/page.tsx` | `GET /api/admin/assigned-venues` | required | Good single endpoint. |
| `src/app/(app)/admin/venues/[venueId]/page.tsx` | `GET /api/courts?manageable=true`, `GET /api/venues/:venueId` | wasteful | Two reads where one workspace read is enough; current query key collision risk. |
| `src/app/(app)/admin/bookings/page.tsx` | `GET /api/bookings?manageable=true`, `GET /api/bookings/:id?include_group=true` | conditional | Detail read only when dialog opens. |
| `src/app/(app)/admin/revenue/page.tsx` | `GET /api/admin/revenue` | required | One endpoint but backend implementation needed scoping improvements. |
| `src/app/(app)/superadmin/venues/page.tsx` | `GET /api/venues`, `GET /api/admin/managed-users` | wasteful | Two independent reads loaded every visit. |
| `src/app/(app)/superadmin/users/page.tsx` | `GET /api/admin/managed-users`, `GET /api/venues` | wasteful | Same pair as venues page; duplicate network + cache invalidation work. |
| `src/app/(app)/superadmin/revenue/page.tsx` | `GET /api/admin/revenue` | required | One endpoint. |
| `src/app/(app)/superadmin/moderation/page.tsx` | `GET /api/admin/flagged-reviews` | required | One endpoint but backend implementation needed scoped joins. |

## Planned and Implemented Fix Direction

1. Replace broad `list*` plus in-memory filtering in key API routes with scoped DB queries.
2. Introduce aggregate endpoints for booking and admin/superadmin high-fanout screens.
3. Migrate pages to aggregate endpoints and remove redundant query keys/calls.

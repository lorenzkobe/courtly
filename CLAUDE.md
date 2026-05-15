# CLAUDE.md

Reference for Claude Code and other AI coding assistants working in this repo.
Humans are welcome too — but everything here is written so an AI without prior
context can pick up the work safely.

---

## 1. What Courtly is

Courtly is a Next.js App Router web app for **court discovery, booking,
tournaments, open-play sessions, and venue administration**, primarily targeted
at pickleball/tennis/badminton/padel venues in the Philippines (payment
defaults are GCash / Maya in PHP).

Three primary user roles, gated by `public.profiles.role`:

- `user` — books courts, joins tournaments / open-play, leaves reviews.
- `admin` — manages one or more venues they are assigned to (via
  `public.venue_admin_assignments`). Sees only their venues' data.
- `superadmin` — platform operator. Sees every venue, manages billing, approves
  venue requests, manages users, moderates flagged reviews.

A separate **feature-preview allowlist** (`src/lib/auth/feature-preview.ts`)
gates not-yet-launched surfaces (Tournaments, certain venues) to a small set of
emails regardless of role.

---

## 2. Tech stack

- **Next.js 16** App Router, React 19, TypeScript 5, React Compiler enabled
  (`next.config.ts: reactCompiler: true`).
- **Tailwind v4** + shadcn-style primitives in `src/components/ui/`.
- **Supabase** for auth, Postgres, storage, and realtime (`@supabase/ssr` +
  `@supabase/supabase-js`).
- **TanStack Query v5** for client data fetching/caching.
- **Zustand** for small client stores.
- **Resend** for transactional email.
- **Sonner** for toasts; **Radix** primitives under shadcn UI; **Lucide**
  icons; **Leaflet** + Google Maps types for venue maps.
- **Vercel** for hosting + cron (`vercel.json` defines the hourly job).
- **PayMongo** scaffolding exists (`src/lib/paymongo/`) but the active payment
  flow is **manual GCash/Maya proof upload**, not card payments.

Quality checks: `npm run lint` and `npm run build`. There is no test suite.

---

## 3. Repo layout

```
src/
  app/
    (app)/              authenticated app shell (dashboard, courts, my-bookings,
                        open-play, tournaments, admin, superadmin)
    (public)/           unauthenticated booking surfaces
      b/                public booking link landing
      book/             public guest booking flow
    api/                80+ route handlers; mirrors UI surfaces
    auth/, login/       auth pages
    layout.tsx, page.tsx, globals.css, not-found.tsx
  components/
    ui/                 shared primitives (button, card, dialog, table, ...)
    admin/ auth/ booking/ courts/ layout/ notifications/ payments/
    providers/ shared/
  hooks/
  lib/
    api/                http client + error helpers used by route handlers
    auth/               session + feature-preview helpers
    bookings/           booking-specific utilities (numbers, payloads, realtime)
    data/courtly-db.ts  THE central data-access module (2.4k lines, server-only)
    email/              Resend wrappers + templates
    notifications/      notification emitter + types
    payments/ paymongo/ manual proof + (scaffolded) provider
    open-play/
    query/ stores/      TanStack Query keys + Zustand stores
    supabase/           client.ts, server.ts, admin.ts, middleware.ts, env.ts,
                        storage.ts, database.types.ts (untyped placeholder)
    types/courtly.ts    ~56 exported domain types — the source of truth
    validation/
middleware.ts           runs updateSupabaseSession on every non-API route
supabase/migrations/    append-only SQL; 0001..0048 + _TEMPLATE.sql
docs/                   engineering notes (api-call-matrix, optimization results,
                        hourly job behavior). Retained intentionally.
scripts/                ad-hoc SQL (e.g. delete_test_venue.sql)
vercel.json             Vercel config (cron)
next.config.ts          reactCompiler: true
eslint.config.mjs       next/typescript + per-folder id-length rules
```

---

## 4. Supabase data model (high level)

Schema lives in `supabase/migrations/*.sql`, treated as **append-only**. Never
edit a past migration — write a new one with the next number.

### Tables (all `public`)

| Table | Purpose |
| --- | --- |
| `profiles` | Mirrors `auth.users`. Has `role` (app_role enum), `is_active`, `mobile_number`, DUPR rating, optional preview flags. |
| `venues` | Establishments. Photos, location, hourly_rate_windows (jsonb), GCash/Maya account info, booking-fee override, status. |
| `venue_admin_assignments` | M:N profile ↔ venue for the `admin` role. |
| `courts` | Physical courts inside a venue. Type/surface kept for legacy. |
| `venue_closures`, `court_closures` | Maintenance/event holds; block bookings. |
| `bookings` | Reservation segments. `booking_group_id` ties segments split around unavailable hours in one checkout. `status` ∈ pending_payment, pending_confirmation, confirmed, cancelled, completed, refund, refunded. `hold_expires_at` powers the pending-payment lock. |
| `court_reviews` | Tied to a specific booking; flaggable for moderation. |
| `tournaments`, `tournament_registrations` | Tournament feature (preview-gated). |
| `open_play_sessions`, `open_play_join_requests`, `open_play_comments` | Open-play feature. |
| `notifications` | In-app notification feed; realtime-enabled. |
| `payment_transactions` | Audit trail for payments (manual + future providers). |
| `outbound_emails` | Queue for transactional email retries. |
| `favorite_venues` | User favourites. |
| `venue_requests` | Pending new-venue submissions; superadmin workflow. |
| `booking_admin_notes` | Internal notes between admins/superadmin per booking. |
| `user_change_audits` | Superadmin audit of role/status edits. |
| `venue_billing_cycles` | Monthly invoicing of platform booking fees to venues. |
| `platform_payment_methods` | Where venues pay Courtly (GCash/Maya). |
| `platform_settings` | Singleton-style config (e.g. default booking fee). |

Postgres enums (in `public`): `app_role`, `booking_status`, `court_status`,
`notification_type`, `open_play_skill`, `open_play_status`,
`open_play_join_request_status`, `registration_status`, `tournament_format`,
`tournament_skill`, `tournament_status`, `venue_request_status`, `venue_status`.

### Key DB helpers

- `public.is_superadmin()` — security-definer function added in migration
  `0004_is_superadmin_security_definer.sql`. Use this inside RLS policies
  rather than re-querying `profiles` from the policy (which loops).
- Hourly cron at `/api/internal/jobs/bookings/complete-hourly` (see
  `vercel.json`, `docs/hourly-booking-completion.md`) auto-confirms expired
  `pending_confirmation` bookings and completes finished `confirmed` ones.

---

## 5. CRITICAL: New tables in `public` need explicit GRANTs

> Starting **May 30, 2026** (new projects) and **October 30, 2026** (existing
> projects, including this one), Supabase no longer auto-grants Data API
> access to tables created in `public`. Without explicit `GRANT`s, supabase-js
> / PostgREST / GraphQL return a `42501` error.

**Use `supabase/migrations/_TEMPLATE.sql`** as the starting point for any
migration that creates a new table. It includes:

1. `create table public.<name> (...)`
2. `grant select on public.<name> to anon;` (omit if never read while logged out)
3. `grant select, insert, update, delete on public.<name> to authenticated;`
4. `grant select, insert, update, delete on public.<name> to service_role;`
5. `alter table public.<name> enable row level security;`
6. Per-operation policies — typically scoped with `auth.uid()` or
   `public.is_superadmin()`.

**Existing 0001..0048 tables retain their grants** because they were created
before the Oct 30, 2026 cutover. Do not backfill grants on those unless the
Supabase Security Advisor explicitly flags them.

The RLS pattern used throughout the codebase:

```sql
create policy "<table> read own or superadmin"
  on public.<table>
  for select to authenticated
  using (user_id = auth.uid() or public.is_superadmin());
```

Always include `to authenticated` (or `to anon`) on the policy so it doesn't
silently apply to `public` (the role, not the schema).

---

## 6. Supabase client usage rules

Three clients, do not mix them:

| File | When to use | Auth context |
| --- | --- | --- |
| `src/lib/supabase/client.ts` | Browser/client components only. | Uses anon key + the user's session cookie. |
| `src/lib/supabase/server.ts` → `createSupabaseServerClient()` | Server components, server actions, route handlers acting **as the user**. | Reads/writes the session cookie via `next/headers`. RLS applies. |
| `src/lib/supabase/admin.ts` → `createSupabaseAdminClient()` | Route handlers / cron jobs that must bypass RLS (privileged writes, cross-user reads). | Service-role key. **Never import into client code.** Singleton, cached per Lambda instance. |

Other rules:

- Public env reads go through `getSupabasePublicEnv()`. **Do not call
  `process.env[someKey]`** — Next only inlines literal `process.env.NEXT_PUBLIC_*`
  references at build time; dynamic lookups are `undefined` in the browser.
- `database.types.ts` is currently a stub; do not cast the client to `any` at
  call sites. Prefer `as unknown as <Type>` when you must narrow row shapes.
- `middleware.ts` runs `updateSupabaseSession` on every non-API path; do not
  bypass it.

---

## 7. Auth & roles

- Login pages live under `src/app/login/` and `src/app/auth/`.
- Session is cookie-based via `@supabase/ssr`.
- `src/lib/auth/auth-context.tsx` exposes the current user/profile to client
  components. Server code should fetch profile via `createSupabaseServerClient`
  or `createSupabaseAdminClient` rather than re-reading the cookie.
- **Feature preview**: `src/lib/auth/feature-preview.ts` holds
  `FEATURE_PREVIEW_EMAILS` and `PREVIEW_ONLY_VENUE_NAMES`. Use
  `isFeaturePreviewUser(email)` and `isPreviewOnlyVenueName(name)` to gate UI
  and data. Always gate **both** the UI surface (tab/link) and the data path
  (API filter) — never rely on UI hiding alone.
- Role checks in route handlers go through the loaded profile, not direct
  cookie inspection. Superadmin checks at the DB level use
  `public.is_superadmin()`.

---

## 8. Data access conventions

### `src/lib/data/courtly-db.ts` is the canonical DB layer

- 2.4k lines, server-only. Imports `createSupabaseServerClient` and
  `createSupabaseAdminClient`. Every route handler that touches Postgres should
  call into this module rather than running raw queries inline — keep query
  shapes consolidated for cache/index tuning.
- Returns rows mapped to types from `src/lib/types/courtly.ts`. Mapping
  functions (e.g. `mapCourtRow`) hydrate derived fields from joined venue rows.
- Many fields on `Court` are "derived on read from linked venue" — they are
  not columns on `courts`. Don't try to write them.

### TanStack Query

- Query keys live in `src/lib/query/`. Reuse keys for cache hits across pages
  rather than inventing parallel keys (see `docs/api-call-matrix.md` for known
  duplication).
- Realtime: bookings have a dedicated hook
  (`src/lib/bookings/use-bookings-realtime.ts`); notifications and bookings
  tables have `_realtime` migrations enabling Supabase realtime.

### Bookings specifics

- One checkout can create **multiple booking rows** sharing a
  `booking_group_id` when the requested range crosses unavailable hours.
- `pending_payment` rows hold the slot via `hold_expires_at`. The
  **`GlobalPendingPaymentGate`** component (mounted in the app shell) renders
  the `PaymentLockOverlay` on most authenticated pages — but the booking and
  cart pages render their own overlay variant, so don't double-mount.
- `pending_confirmation` rows are auto-confirmed at slot start by the hourly
  cron (this replaced an older auto-decline flow). See
  `docs/hourly-booking-completion.md`.
- Booking numbers (`booking_number`) are generated in
  `src/lib/bookings/booking-number.ts`.

---

## 9. UI conventions

- shadcn-style primitives only — extend `src/components/ui/`, don't pull in
  new component libraries.
- Tailwind v4. No CSS modules. Global tokens in `src/app/globals.css`.
- Currency formatting via `src/lib/format-currency.ts` (PHP, `₱`).
- Date/time via `date-fns`. Database stores times as `text` (e.g. "07:00") and
  dates as `date` — be deliberate about timezone handling; the user base is
  GMT+8.
- Toasts via `sonner`. Don't add ad-hoc toast libraries.
- For UI/UX changes: if there is a paired **public** and **authenticated**
  surface (e.g. public booking page vs. authenticated booking page), any
  change to one must be applied to the other. (See user memory
  `feedback_sync_public_auth_pages`.)

---

## 10. Notifications & email

- `src/lib/notifications/` defines the emitter API. New notification kinds need
  a new value in the `notification_type` enum (a new migration) AND a
  corresponding entry in the in-code switch that maps `NotificationEventType` →
  category. Missing the second half silently drops the notification.
- Outbound email goes through Resend; templates live in `supabase/templates/`
  for Supabase-managed flows and `src/lib/email/` for app-emitted email.
- `outbound_emails` is a retry queue.

---

## 11. Payments

- Active flow: **manual GCash / Maya**. User uploads a proof image; venue
  admin reviews and confirms. Tables: `payment_transactions`, plus payment
  fields on `bookings`.
- Storage bucket `payment-proofs` (private) — fetched through signed URLs from
  `/api/bookings/[id]/payment-proof-url` etc. Never expose the raw path.
- Billing cycles: Courtly bills venues monthly for the platform booking fee.
  Generation, payment proof, mark-paid all flow through superadmin endpoints
  under `/api/superadmin/billing/`.
- `paymongo/` scaffolding is present but not currently the primary flow.

---

## 12. Cron / background jobs

Defined in `vercel.json`:

- `0 18 * * *` (18:00 UTC = 02:00 GMT+8) →
  `/api/internal/jobs/bookings/complete-hourly`. Despite the name, this is now
  a daily run that processes hourly transitions: auto-confirm
  `pending_confirmation` bookings whose slot start has passed, mark expired
  pending-payment holds, complete past confirmed bookings. See
  `docs/hourly-booking-completion.md` for the latest behavior.

Internal job endpoints should always verify they're being called by Vercel cron
or a service-role token before mutating data.

---

## 13. Coding rules for AI assistants in this repo

These are not hypothetical preferences — they reflect actual past corrections:

1. **Mirror public ↔ auth booking pages.** Any change applied to a public
   booking page must also be applied to its authenticated counterpart, and
   vice versa.
2. **New `public` tables MUST include the GRANT block** — see
   `_TEMPLATE.sql` and section 5 of this doc.
3. **No new migrations that edit a past migration.** Append-only. Use the next
   number (currently `0049`).
4. **Don't add backwards-compat shims** for code you can simply update — no
   re-exports, no `// removed` comments, no renamed `_unused` vars.
5. **No comments that restate what the code does or who calls it.** Only
   document non-obvious *why*: hidden constraints, subtle invariants,
   workarounds for specific bugs.
6. **Don't introduce new state-management or data-fetching libraries.** Use
   TanStack Query + Zustand. Don't reach for Redux, SWR, Jotai, etc.
7. **Don't bypass `courtly-db.ts`** with inline raw SQL in a route handler.
   Add a new function there instead.
8. **Don't read `process.env` dynamically in client bundles.** Always reference
   `NEXT_PUBLIC_*` literally so Next can inline.
9. **Don't import `createSupabaseAdminClient` into a client component.** It
   uses the service-role key and would leak it into the bundle if it weren't
   server-only by happenstance.
10. **Don't add a notification type without updating the category-emit switch**
    that maps the new enum to a delivery category — half-wired notification
    types drop silently.
11. **Don't run destructive git or DB commands without confirming.** That
    includes `drop table`, `truncate`, force-push, `git reset --hard`.
12. **For UI/feature changes, actually run `npm run dev` and click through**
    before claiming the task is done. Lint+build don't catch UX bugs.
13. **Use `public.is_superadmin()` inside RLS policies**, not a subquery on
    `profiles` (which causes recursion against the same policy).
14. **Don't double-mount `PaymentLockOverlay`.** `GlobalPendingPaymentGate`
    already covers most authenticated pages; the booking and cart pages mount
    their own variant. Adding a third causes the documented double-overlay
    bug.
15. **Always run a post-task cleanup + optimization pass.** After every task
    or new feature — before declaring it done — sweep the diff for the items
    in section 14. The goal is to keep the repo in tip-top shape: no dead
    code, no redundant queries, no avoidable re-renders, no premature
    abstractions, no cost or performance regressions.

---

## 14. Post-task cleanup & optimization checklist

Run this every time, on the files you touched (and any siblings you reached
into). Treat it as part of "done", not an optional polish step.

**Dead code & clutter**
- Remove unused imports, variables, props, types, exports, and files.
- Remove commented-out code, `console.log`, `debugger`, and TODO/FIXME notes
  that are no longer relevant.
- Delete backwards-compat shims you introduced mid-task (re-exports,
  `_renamed` vars, "// removed" markers).
- Strip comments that just restate what the code does — keep only non-obvious
  *why* notes.

**Reuse & duplication**
- Before adding a helper/component/type, grep for an existing one (especially
  in `src/lib/`, `src/components/ui/`, `src/lib/types/courtly.ts`).
- Consolidate near-duplicate query shapes into `courtly-db.ts` rather than
  inlining a second variant in a route handler.
- Reuse existing TanStack Query keys from `src/lib/query/` instead of
  inventing parallel keys for the same data.

**Performance**
- Look for N+1 Supabase calls — prefer a single query with joins/`in()` over
  a loop of `.eq()` calls.
- Only `select()` the columns the caller actually uses; avoid `select('*')`
  on wide tables (`bookings`, `venues`, `profiles`).
- Memoize expensive client computations (`useMemo`/`useCallback`) only when
  they actually help — React Compiler handles most cases; don't add noise.
- Avoid client-side fetching in `useEffect` when the data could be fetched on
  the server or via TanStack Query with proper keys.
- Add `LIMIT` / pagination to any list endpoint that could grow unboundedly.

**Cost**
- Every new realtime subscription, cron tick, Resend send, signed-URL mint,
  or service-role write costs money or quota. Justify each one; remove any
  you added speculatively.
- Avoid double-fetching the same row in a single request path (server
  component + route handler + client query all hitting the same table).
- Don't ship a new background job or polling loop without confirming an
  existing cron / realtime channel can't cover it.

**Security & correctness**
- Confirm any new `public` table has the full GRANT block + RLS policies
  scoped with `to authenticated` / `to anon` and `auth.uid()` /
  `public.is_superadmin()`.
- Confirm route handlers re-check role server-side; never trust UI gating
  alone (especially for feature-preview surfaces).
- Confirm `createSupabaseAdminClient` is only imported from server-only
  modules.
- Confirm any new notification type is wired through the category-emit
  switch.

**Validation gate**
- `npm run lint` clean.
- `npm run build` clean (catches type errors).
- For UI/UX work: `npm run dev` and click through the golden path + the
  paired public/auth surface if one exists.

If a sweep finds nothing to remove or tighten, say so explicitly — silence
shouldn't be ambiguous with "I forgot to check."

---

## 15. Common commands

```bash
npm install            # install
npm run dev            # local server on :3000
npm run lint           # eslint (next/typescript)
npm run build          # production build (also catches type errors)
```

There is no test runner configured. Validate behavior via lint + build + manual
walkthrough.

---

## 16. Files worth reading first when picking up new work

- `src/lib/types/courtly.ts` — domain model.
- `src/lib/data/courtly-db.ts` — every server-side DB call.
- `supabase/migrations/0001_init.sql` — original schema + RLS patterns.
- `supabase/migrations/_TEMPLATE.sql` — the contract for new tables.
- `docs/api-call-matrix.md` — where redundant API calls live (still being
  cleaned up).
- `docs/hourly-booking-completion.md` — cron behavior.
- `src/lib/auth/feature-preview.ts` — preview gating allowlist.

---

## 17. When in doubt

- Read the existing pattern in the closest sibling file before inventing a new
  one.
- For a non-trivial change, propose the approach before editing — especially
  anything that touches RLS, bookings status transitions, payments, or the
  superadmin billing flow.
- If a memory or doc disagrees with the current code, trust the code and
  update the memory/doc.

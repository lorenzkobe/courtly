-- Hard-delete a test venue and all related data.
-- Usage: find-and-replace PASTE-VENUE-UUID-HERE with the actual venue UUID, then run.
--
-- What cascades automatically (via ON DELETE CASCADE):
--   courts, venue_closures, venue_admin_assignments, court_reviews,
--   favorite_venues, venue_billing_cycles,
--   court_closures (via courts), bookings (via courts),
--   payment_transactions (via bookings), booking_admin_notes (via bookings)
--
-- What this script handles explicitly:
--   open_play_sessions linked to courts of this venue (FK is SET NULL, not CASCADE)
--   venue_requests where approved_venue_id = this venue
--
-- What is intentionally NOT deleted:
--   profiles / auth.users — never touch user accounts in a cleanup
--   outbound_emails — standalone queue table, no FK to venues
--   payment_webhook_events — dropped (migration 0048)


-- ── STEP 1: Preview — run this first to confirm what will be deleted ──────────

select
  v.id          as venue_id,
  v.name        as venue_name,
  v.status      as venue_status,
  count(distinct c.id)   as courts,
  count(distinct b.id)   as bookings,
  count(distinct cr.id)  as reviews,
  count(distinct ops.id) as open_play_sessions,
  count(distinct vr.id)  as venue_requests
from public.venues v
left join public.courts               c   on c.venue_id         = v.id
left join public.bookings             b   on b.court_id         = c.id
left join public.court_reviews        cr  on cr.venue_id        = v.id
left join public.open_play_sessions   ops on ops.court_id       = c.id
left join public.venue_requests       vr  on vr.approved_venue_id = v.id
where v.id = 'PASTE-VENUE-UUID-HERE'
group by v.id, v.name, v.status;


-- ── STEP 2: Delete ────────────────────────────────────────────────────────────

begin;

  -- open_play_sessions: FK is SET NULL not CASCADE, must delete explicitly
  -- also cascades to open_play_join_requests and open_play_comments
  delete from public.open_play_sessions
  where court_id in (
    select id from public.courts where venue_id = 'PASTE-VENUE-UUID-HERE'
  );

  -- venue_requests: approved_venue_id is SET NULL not CASCADE
  delete from public.venue_requests
  where approved_venue_id = 'PASTE-VENUE-UUID-HERE';

  -- deleting the venue cascades to:
  --   courts → court_closures, bookings → payment_transactions, booking_admin_notes
  --   court_reviews, venue_closures, venue_admin_assignments,
  --   favorite_venues, venue_billing_cycles
  delete from public.venues
  where id = 'PASTE-VENUE-UUID-HERE';

commit;


-- ── STEP 3: Verify — all counts should be 0 ──────────────────────────────────

select 'venues'                    as tbl, count(*) from public.venues                  where id                = 'PASTE-VENUE-UUID-HERE'
union all
select 'courts',                            count(*) from public.courts                  where venue_id          = 'PASTE-VENUE-UUID-HERE'
union all
select 'venue_closures',                    count(*) from public.venue_closures          where venue_id          = 'PASTE-VENUE-UUID-HERE'
union all
select 'venue_admin_assignments',           count(*) from public.venue_admin_assignments where venue_id          = 'PASTE-VENUE-UUID-HERE'
union all
select 'venue_billing_cycles',              count(*) from public.venue_billing_cycles    where venue_id          = 'PASTE-VENUE-UUID-HERE'
union all
select 'favorite_venues',                   count(*) from public.favorite_venues         where venue_id          = 'PASTE-VENUE-UUID-HERE'
union all
select 'venue_requests (approved)',         count(*) from public.venue_requests          where approved_venue_id = 'PASTE-VENUE-UUID-HERE';

-- Add refund statuses
alter type public.booking_status add value if not exists 'refund';
alter type public.booking_status add value if not exists 'refunded';

-- Drop PayMongo-era booking columns never used in the current manual payment flow
drop index if exists public.bookings_payment_link_id_idx;

alter table public.bookings
  drop column if exists payment_link_id,
  drop column if exists payment_link_url,
  drop column if exists payment_link_created_at,
  drop column if exists refund_attempted_at,
  drop column if exists paid_at,
  drop column if exists payment_failed_at,
  drop column if exists payment_reference_id,
  drop column if exists refund_required,
  drop column if exists refunded_at;

-- Drop open_play_sessions.fee superseded by price_per_player (backfilled in migration 0015)
alter table public.open_play_sessions
  drop column if exists fee;

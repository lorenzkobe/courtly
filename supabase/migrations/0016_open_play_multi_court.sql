-- Allow one open play session per court within the same booking checkout.
drop index if exists public.open_play_sessions_booking_group_uidx;

create unique index if not exists open_play_sessions_booking_group_court_uidx
  on public.open_play_sessions(booking_group_id, court_id)
  where booking_group_id is not null and court_id is not null;

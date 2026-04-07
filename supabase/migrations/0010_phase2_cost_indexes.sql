-- Phase 2 launch cost-hardening indexes for high-traffic filters/sorts.
create index if not exists bookings_player_email_date_created_idx
  on public.bookings(player_email, date, created_at desc);

create index if not exists bookings_group_id_not_null_idx
  on public.bookings(booking_group_id)
  where booking_group_id is not null;

create index if not exists courts_venue_id_idx
  on public.courts(venue_id);

create index if not exists court_reviews_booking_id_idx
  on public.court_reviews(booking_id);

create index if not exists court_reviews_venue_created_idx
  on public.court_reviews(venue_id, created_at desc);

create index if not exists court_reviews_flagged_at_partial_idx
  on public.court_reviews(flagged_at desc)
  where flagged = true;

create index if not exists tournaments_status_sport_date_idx
  on public.tournaments(status, sport, date desc);

create index if not exists open_play_status_sport_date_time_idx
  on public.open_play_sessions(status, sport, date, start_time);

create index if not exists tournament_registrations_player_email_idx
  on public.tournament_registrations(player_email);

create index if not exists venue_closures_venue_date_idx
  on public.venue_closures(venue_id, date);

create index if not exists court_closures_court_date_idx
  on public.court_closures(court_id, date);

-- Open play lifecycle + notification enum extensions only.
-- New enum values cannot be used in UPDATE in the same transaction (55P04).
-- Backfill completed → closed is in 0018_open_play_lifecycle_backfill.sql.

alter type public.open_play_status add value if not exists 'started';
alter type public.open_play_status add value if not exists 'closed';

alter type public.notification_type add value if not exists 'open_play_join_approved';

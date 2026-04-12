-- Runs after 0017 is committed so `closed` is safe to use.

update public.open_play_sessions
set status = 'closed'::public.open_play_status
where status = 'completed'::public.open_play_status;

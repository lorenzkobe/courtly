-- Enable Realtime for in-app notification delivery (postgres_changes in the browser).
alter publication supabase_realtime add table public.notifications;

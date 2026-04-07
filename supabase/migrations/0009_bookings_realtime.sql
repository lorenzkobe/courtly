-- Enable Realtime for booking updates so lists and availability can react instantly.
alter publication supabase_realtime add table public.bookings;

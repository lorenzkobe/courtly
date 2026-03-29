-- Venues: price ranges only (hourly_rate_windows). Drop opens_at, closes_at, hourly_rate.

-- Backfill: venues with no windows → one range from legacy open/close and hourly rate.
update public.venues
set hourly_rate_windows = jsonb_build_array(
  jsonb_build_object(
    'start', opens_at,
    'end', closes_at,
    'hourly_rate', hourly_rate
  )
)
where coalesce(jsonb_array_length(hourly_rate_windows), 0) = 0;

-- Seed venue BGC: had base rate + peak window; split into non-overlapping [start, end) ranges.
update public.venues
set hourly_rate_windows = '[
  {"start":"07:00","end":"17:00","hourly_rate":45},
  {"start":"17:00","end":"22:00","hourly_rate":60}
]'::jsonb
where id = '7c35d82a-3f44-4889-96d4-eb8c55805fd7';

alter table public.venues
  drop column if exists opens_at,
  drop column if exists closes_at,
  drop column if exists hourly_rate;

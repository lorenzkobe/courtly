insert into public.venues (
  id,
  name,
  location,
  contact_phone,
  sport,
  hourly_rate,
  hourly_rate_windows,
  opens_at,
  closes_at,
  status,
  amenities,
  image_url
)
values
  (
    '7c35d82a-3f44-4889-96d4-eb8c55805fd7',
    'BGC Makati Sports Center',
    'Bonifacio Global City, Taguig',
    '+63 917 800 1001',
    'pickleball',
    45,
    '[{"start":"17:00","end":"22:00","hourly_rate":60}]'::jsonb,
    '07:00',
    '22:00',
    'active',
    array['lights','parking','restrooms','seating'],
    'https://picsum.photos/seed/courtly-bgcs-cover/800/450'
  ),
  (
    '2c7f05a1-2cfd-4f61-ae52-80bbf57dc4b8',
    'Cebu Bay Sports Hub',
    'Cebu City',
    '+63 32 410 2200',
    'pickleball',
    40,
    '[]'::jsonb,
    '08:00',
    '21:00',
    'active',
    array['lights','parking','water_fountain'],
    'https://picsum.photos/seed/courtly-cebu-cover/800/450'
  )
on conflict (id) do nothing;

insert into public.courts (id, venue_id, name, status, type, surface)
values
  ('90e7d69d-2770-4f18-9b31-95a9732d4af3','7c35d82a-3f44-4889-96d4-eb8c55805fd7','Court 1','active','indoor','sport_court'),
  ('bcae4e90-8c72-467b-b57e-8334f2ab943c','7c35d82a-3f44-4889-96d4-eb8c55805fd7','Court 2','active','indoor','sport_court')
on conflict (id) do nothing;

insert into public.tournaments (
  id, sport, name, date, start_time, end_time, format, skill_level, max_participants, current_participants, entry_fee, location, status
)
values
  (
    'fa5e8619-c260-4952-9b65-9f802d39a03d',
    'pickleball',
    'Weekend Ladder Challenge',
    current_date + interval '14 day',
    '09:00',
    '17:00',
    'doubles',
    'intermediate',
    32,
    0,
    40,
    'BGC Makati Sports Center',
    'registration_open'
  )
on conflict (id) do nothing;

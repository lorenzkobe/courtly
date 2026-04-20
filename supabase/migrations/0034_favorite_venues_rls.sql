alter table public.favorite_venues enable row level security;

create policy "favorite venues read own or superadmin" on public.favorite_venues
for select to authenticated
using (user_id = auth.uid() or public.is_superadmin());

create policy "favorite venues insert own or superadmin" on public.favorite_venues
for insert to authenticated
with check (user_id = auth.uid() or public.is_superadmin());

create policy "favorite venues delete own or superadmin" on public.favorite_venues
for delete to authenticated
using (user_id = auth.uid() or public.is_superadmin());

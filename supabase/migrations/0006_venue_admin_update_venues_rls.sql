-- App allows assigned court admins to PATCH venues (see canMutateVenue).
-- RLS previously only allowed superadmin on venues, so updates returned 0 rows (PGRST116).

drop policy if exists "venues mutate admins and superadmin" on public.venues;

create policy "venues insert superadmin" on public.venues
for insert to authenticated
with check (public.is_superadmin());

create policy "venues update superadmin or assigned admin" on public.venues
for update to authenticated
using (
  public.is_superadmin()
  or public.is_venue_admin_for_venue(id)
)
with check (
  public.is_superadmin()
  or public.is_venue_admin_for_venue(id)
);

create policy "venues delete superadmin" on public.venues
for delete to authenticated
using (public.is_superadmin());

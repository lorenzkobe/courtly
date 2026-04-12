drop policy if exists "venue requests update own pending admin" on public.venue_requests;

create policy "venue requests update own pending or needs_update admin" on public.venue_requests
for update to authenticated
using (
  request_status in ('pending', 'needs_update')
  and requested_by = auth.uid()
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'::public.app_role
  )
)
with check (
  requested_by = auth.uid()
  and (
    request_status = 'pending'
    or request_status = 'cancelled'
  )
  and reviewed_by is null
  and reviewed_at is null
  and approved_venue_id is null
);

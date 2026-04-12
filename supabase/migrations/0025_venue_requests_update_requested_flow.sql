do $$
begin
  if not exists (
    select 1
    from pg_enum e
    join pg_type t on t.oid = e.enumtypid
    where t.typnamespace = 'public'::regnamespace
      and t.typname = 'venue_request_status'
      and e.enumlabel = 'needs_update'
  ) then
    alter type public.venue_request_status add value 'needs_update';
  end if;
end
$$;

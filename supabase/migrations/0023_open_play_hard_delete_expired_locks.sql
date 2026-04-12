create or replace function public.open_play_acquire_payment_lock(
  p_session_id uuid,
  p_user_id uuid,
  p_lock_minutes integer default 5
)
returns table(
  result text,
  request_id uuid,
  payment_lock_expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_lock_until timestamptz := now() + make_interval(mins => greatest(1, p_lock_minutes));
  v_max_players integer;
  v_existing_id uuid;
  v_existing_status public.open_play_join_request_status;
  v_consuming_count integer;
  v_updated integer;
begin
  select s.max_players
  into v_max_players
  from public.open_play_sessions s
  where s.id = p_session_id
  for update;

  if v_max_players is null then
    return query select 'not_found'::text, null::uuid, null::timestamptz;
    return;
  end if;

  delete from public.open_play_join_requests r
  where r.open_play_session_id = p_session_id
    and r.status = 'payment_locked'
    and r.payment_lock_expires_at is not null
    and r.payment_lock_expires_at <= v_now;

  select r.id, r.status
  into v_existing_id, v_existing_status
  from public.open_play_join_requests r
  where r.open_play_session_id = p_session_id
    and r.user_id = p_user_id
  order by r.created_at desc
  limit 1
  for update;

  if v_existing_status in ('approved', 'pending_approval', 'payment_locked') then
    return query select 'already_active'::text, v_existing_id, null::timestamptz;
    return;
  end if;

  if v_existing_status is null then
    insert into public.open_play_join_requests (open_play_session_id, user_id, status)
    values (p_session_id, p_user_id, 'waitlisted')
    returning id into v_existing_id;
    v_existing_status := 'waitlisted';
  elsif v_existing_status in ('denied', 'cancelled', 'expired') then
    update public.open_play_join_requests r
    set status = 'waitlisted',
        payment_lock_expires_at = null,
        payment_method = null,
        payment_proof_url = null,
        payment_proof_mime_type = null,
        payment_proof_bytes = null,
        payment_proof_width = null,
        payment_proof_height = null,
        payment_submitted_at = null,
        organizer_note = null,
        decided_at = null,
        decided_by_user_id = null
    where r.id = v_existing_id;
    v_existing_status := 'waitlisted';
  end if;

  select count(*)
  into v_consuming_count
  from public.open_play_join_requests r
  where r.open_play_session_id = p_session_id
    and r.status in ('payment_locked', 'pending_approval', 'approved');

  if v_consuming_count >= v_max_players then
    return query select 'full'::text, v_existing_id, null::timestamptz;
    return;
  end if;

  update public.open_play_join_requests r
  set status = 'payment_locked',
      payment_lock_expires_at = v_lock_until
  where r.id = v_existing_id
    and r.status = 'waitlisted';

  get diagnostics v_updated = row_count;

  if v_updated = 0 then
    return query select 'already_active'::text, v_existing_id, null::timestamptz;
    return;
  end if;

  return query select 'locked'::text, v_existing_id, v_lock_until;
end;
$$;

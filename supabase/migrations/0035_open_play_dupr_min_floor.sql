-- Align DUPR range check with product rule: minimum 2.00 (was 0 in original constraint).
-- Existing rows may have dupr_min < 2; normalize them before adding the new check.

alter table public.open_play_sessions
  drop constraint if exists open_play_sessions_dupr_range_chk;

-- Clamp existing ranges into [2, 8] with min <= max (both null stays null).
update public.open_play_sessions
set
  dupr_min = case
    when dupr_min is null and dupr_max is null then null
    else greatest(2::numeric, least(coalesce(dupr_min, 2::numeric), 8::numeric))
  end,
  dupr_max = case
    when dupr_min is null and dupr_max is null then null
    else least(
      8::numeric,
      greatest(
        greatest(2::numeric, least(coalesce(dupr_min, 2::numeric), 8::numeric)),
        least(
          8::numeric,
          coalesce(
            dupr_max,
            greatest(2::numeric, least(coalesce(dupr_min, 2::numeric), 8::numeric))
          )
        )
      )
    )
  end
where dupr_min is not null
   or dupr_max is not null;

alter table public.open_play_sessions
  add constraint open_play_sessions_dupr_range_chk
  check (
    (dupr_min is null and dupr_max is null)
    or (
      dupr_min is not null
      and dupr_max is not null
      and dupr_min >= 2
      and dupr_max <= 8
      and dupr_min <= dupr_max
    )
  );

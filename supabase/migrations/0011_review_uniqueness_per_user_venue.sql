-- Enforce one review per user per venue.
-- Keep the most recently updated row when duplicates exist.
with ranked_reviews as (
  select
    id,
    row_number() over (
      partition by user_id, venue_id
      order by updated_at desc nulls last, created_at desc nulls last, id desc
    ) as rn
  from public.court_reviews
)
delete from public.court_reviews r
using ranked_reviews rr
where r.id = rr.id
  and rr.rn > 1;

create unique index if not exists court_reviews_user_venue_unique_idx
  on public.court_reviews(user_id, venue_id);

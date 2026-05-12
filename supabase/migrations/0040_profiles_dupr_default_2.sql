-- Change default DUPR rating from 0.00 to 2.00 (minimum valid DUPR rating)
alter table public.profiles
  alter column dupr_rating set default 2.00;

-- Bump existing users who have the old placeholder value 0.00 to 2.00
update public.profiles
set dupr_rating = 2.00
where dupr_rating = 0.00;

-- Tighten constraint: valid DUPR range is 2.00–8.00
alter table public.profiles
  drop constraint if exists profiles_dupr_rating_chk;

alter table public.profiles
  add constraint profiles_dupr_rating_chk
  check (dupr_rating >= 2 and dupr_rating <= 8);

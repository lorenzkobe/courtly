-- Track when a comment was last edited (null = never edited) for "(Edited)" display.
alter table public.open_play_comments
  add column if not exists edited_at timestamptz;

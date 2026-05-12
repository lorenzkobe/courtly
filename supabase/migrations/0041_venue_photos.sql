ALTER TABLE venue_requests ADD COLUMN photo_urls text[] NOT NULL DEFAULT '{}';
ALTER TABLE venues ADD COLUMN photo_urls text[] NOT NULL DEFAULT '{}';

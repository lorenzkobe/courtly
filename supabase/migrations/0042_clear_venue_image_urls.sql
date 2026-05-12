-- Clear legacy URL-based image links; photo_urls array is now the source of truth.
UPDATE venues SET image_url = '';
UPDATE venue_requests SET image_url = '';

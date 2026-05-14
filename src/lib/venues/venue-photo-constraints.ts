export const VENUE_PHOTO_MAX_COUNT = 5;
export const VENUE_PHOTO_MIN_COUNT = 2;
export const VENUE_PHOTO_ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;
export const VENUE_PHOTO_RAW_MAX_BYTES = 10 * 1024 * 1024;
export const VENUE_PHOTO_FINAL_MAX_BYTES = 2 * 1024 * 1024;
export const VENUE_PHOTO_TARGET_LONG_EDGE_PX = 1920;
export const VENUE_PHOTO_JPEG_QUALITY_STEPS = [0.9, 0.85, 0.8] as const;
export const VENUE_PHOTO_CANONICAL_MIME_TYPE = "image/jpeg" as const;

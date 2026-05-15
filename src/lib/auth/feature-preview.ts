/**
 * Emails allowed to access early-access features (Tournaments, Open Play).
 * Add emails here to grant preview access.
 */
export const FEATURE_PREVIEW_EMAILS: readonly string[] = [
  // e.g. "yourname@example.com",
  "142924+1@gmail.com",
  "142924+3@gmail.com"
];

export function isFeaturePreviewUser(email: string | undefined): boolean {
  if (!email) return false;
  return FEATURE_PREVIEW_EMAILS.includes(email.toLowerCase());
}

/**
 * Venue names that are restricted to preview users only. These venues are
 * hidden from public pages entirely and only appear in authenticated views
 * for users in FEATURE_PREVIEW_EMAILS, even when the venue is active.
 */
export const PREVIEW_ONLY_VENUE_NAMES: readonly string[] = [
  "test venue",
];

export function isPreviewOnlyVenueName(name: string | null | undefined): boolean {
  if (!name) return false;
  return PREVIEW_ONLY_VENUE_NAMES.includes(name.trim().toLowerCase());
}

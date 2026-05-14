/**
 * Emails allowed to access early-access features (Tournaments, Open Play).
 * Add emails here to grant preview access.
 */
export const FEATURE_PREVIEW_EMAILS: readonly string[] = [
  // e.g. "yourname@example.com",
  "142924+1@gmail.com",
];

export function isFeaturePreviewUser(email: string | undefined): boolean {
  if (!email) return false;
  return FEATURE_PREVIEW_EMAILS.includes(email.toLowerCase());
}

export const BOOKING_HOLD_MINUTES = 5;
export const BOOKING_RETRY_COOLDOWN_SECONDS = 5;

export function holdExpiresAtFrom(now = new Date()): Date {
  return new Date(now.getTime() + BOOKING_HOLD_MINUTES * 60 * 1000);
}

export function isHoldActive(holdExpiresAt: string | null | undefined, now = new Date()): boolean {
  if (!holdExpiresAt) return false;
  return new Date(holdExpiresAt).getTime() > now.getTime();
}

export function retryCooldownActive(lastLinkCreatedAt: string | null | undefined, now = new Date()): boolean {
  if (!lastLinkCreatedAt) return false;
  const last = new Date(lastLinkCreatedAt).getTime();
  return now.getTime() - last < BOOKING_RETRY_COOLDOWN_SECONDS * 1000;
}

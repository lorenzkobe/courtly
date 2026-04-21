import { normalizeBookingFee } from "@/lib/platform-fee";

/**
 * Same rule as `POST /api/bookings/checkout`: use venue override when it is a finite
 * number (including 0); otherwise use the platform default.
 */
export function effectiveFlatBookingFeePhp(
  platformDefault: number,
  venueOverride: number | null | undefined,
): number {
  const fromVenue = Number(venueOverride ?? Number.NaN);
  const fee = Number.isFinite(fromVenue) ? fromVenue : platformDefault;
  return normalizeBookingFee(fee);
}

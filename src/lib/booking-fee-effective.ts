import { normalizeBookingFee } from "@/lib/platform-fee";

/** Same rule as checkout: venue override when set, else platform default. */
export function effectiveFlatBookingFeePhp(
  platformDefault: number,
  venueOverride: number | null | undefined,
): number {
  if (venueOverride != null && Number.isFinite(Number(venueOverride))) {
    return normalizeBookingFee(Number(venueOverride));
  }
  return normalizeBookingFee(platformDefault);
}

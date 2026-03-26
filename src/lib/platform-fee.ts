/** Percentage added on top of court reservation subtotal (customer pays subtotal + fee). */
export const PLATFORM_TRANSACTION_FEE_PERCENT = 5;

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Fee amount for a given court subtotal (reservation amount before platform fee). */
export function platformFeeFromCourtSubtotal(courtSubtotal: number) {
  if (!Number.isFinite(courtSubtotal) || courtSubtotal <= 0) {
    return 0;
  }
  return round2((courtSubtotal * PLATFORM_TRANSACTION_FEE_PERCENT) / 100);
}

/** Customer total = court subtotal + platform fee. */
export function customerTotalFromCourtSubtotal(courtSubtotal: number) {
  const fee = platformFeeFromCourtSubtotal(courtSubtotal);
  return round2(courtSubtotal + fee);
}

export function splitBookingAmounts(courtSubtotal: number) {
  const platform_fee = platformFeeFromCourtSubtotal(courtSubtotal);
  const total_cost = round2(courtSubtotal + platform_fee);
  return {
    court_subtotal: round2(courtSubtotal),
    platform_fee,
    total_cost,
  };
}

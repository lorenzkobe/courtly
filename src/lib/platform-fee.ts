function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Normalized flat booking fee (whole number, >= 0). */
export function normalizeBookingFee(raw: number | undefined) {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return 0;
  return Math.max(0, Math.trunc(raw));
}

/** Flat booking fee for a court (not percentage-based). */
export function bookingFeeForCourt(courtBookingFee: number | undefined) {
  return normalizeBookingFee(courtBookingFee);
}

/** Customer total = court subtotal + flat booking fee. */
export function customerTotalFromCourtSubtotal(
  courtSubtotal: number,
  courtBookingFee: number | undefined,
) {
  const booking_fee = bookingFeeForCourt(courtBookingFee);
  return round2(courtSubtotal + booking_fee);
}

export function splitBookingAmounts(
  courtSubtotal: number,
  courtBookingFee: number | undefined,
  numHours: number,
) {
  const fee_rate = bookingFeeForCourt(courtBookingFee);
  const booking_fee = fee_rate * numHours;
  const total_cost = round2(courtSubtotal + booking_fee);
  return {
    court_subtotal: round2(courtSubtotal),
    booking_fee,
    total_cost,
  };
}

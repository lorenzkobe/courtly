import type { Booking } from "@/lib/types/courtly";

/** Validate YYYY-MM-DD for booking.date comparisons. */
export function parseIsoDateParam(s: string | null): string | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = Date.parse(`${s}T12:00:00`);
  if (Number.isNaN(t)) return null;
  return s;
}

export function normalizeDateRange(
  from: string | null,
  to: string | null,
): { from: string | null; to: string | null } {
  if (from && to && from > to) {
    return { from: to, to: from };
  }
  return { from, to };
}

export function bookingInDateRange(
  bookingDate: string,
  from: string | null,
  to: string | null,
): boolean {
  if (!from && !to) return true;
  if (from && bookingDate < from) return false;
  if (to && bookingDate > to) return false;
  return true;
}

export function filterBookingsByDateRange(
  bookings: Booking[],
  from: string | null,
  to: string | null,
): Booking[] {
  return bookings.filter((b) => bookingInDateRange(b.date, from, to));
}

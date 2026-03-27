import type { Booking, Court } from "@/lib/types/courtly";
import {
  bookingFeeForCourt,
  customerTotalFromCourtSubtotal,
} from "@/lib/platform-fee";

const COUNTABLE: Booking["status"][] = ["confirmed", "completed"];

export type BookingFinancials = {
  court_subtotal: number;
  booking_fee: number;
  customer_total: number;
};

/** Normalize stored or legacy booking amounts for dashboards. */
export function bookingFinancials(
  booking: Booking,
  fallbackCourtBookingFee: number | undefined,
): BookingFinancials {
  const hasSplit =
    typeof booking.court_subtotal === "number" &&
    typeof booking.booking_fee === "number" &&
    typeof booking.total_cost === "number";

  if (hasSplit) {
    return {
      court_subtotal: booking.court_subtotal!,
      booking_fee: booking.booking_fee!,
      customer_total: booking.total_cost!,
    };
  }

  const raw = booking.total_cost ?? 0;
  if (raw <= 0) {
    return { court_subtotal: 0, booking_fee: 0, customer_total: 0 };
  }
  const court_subtotal = raw;
  const booking_fee = bookingFeeForCourt(fallbackCourtBookingFee);
  const customer_total = customerTotalFromCourtSubtotal(
    court_subtotal,
    fallbackCourtBookingFee,
  );
  return { court_subtotal, booking_fee, customer_total };
}

export type CourtRevenueRow = {
  court_id: string;
  court_name: string;
  venue_id: string | null;
  venue_name: string | null;
  booking_count: number;
  court_net: number;
  booking_fees: number;
  customer_total: number;
};

export function aggregateRevenueByCourt(
  bookings: Booking[],
  courts: Court[],
): CourtRevenueRow[] {
  const byCourt = new Map<
    string,
    {
      court_net: number;
      booking_fees: number;
      customer_total: number;
      booking_count: number;
    }
  >();

  for (const booking of bookings) {
    if (!COUNTABLE.includes(booking.status)) continue;
    const financials = bookingFinancials(booking, undefined);
    const cur = byCourt.get(booking.court_id) ?? {
      court_net: 0,
      booking_fees: 0,
      customer_total: 0,
      booking_count: 0,
    };
    cur.court_net += financials.court_subtotal;
    cur.booking_fees += financials.booking_fee;
    cur.customer_total += financials.customer_total;
    cur.booking_count += 1;
    byCourt.set(booking.court_id, cur);
  }

  return courts.map((court) => {
    const agg = byCourt.get(court.id);
    return {
      court_id: court.id,
      court_name: court.name,
      venue_id: court.venue_id ?? null,
      venue_name: null,
      booking_count: agg?.booking_count ?? 0,
      court_net: agg?.court_net ?? 0,
      booking_fees: agg?.booking_fees ?? 0,
      customer_total: agg?.customer_total ?? 0,
    };
  });
}

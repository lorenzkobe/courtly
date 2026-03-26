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
  b: Booking,
  fallbackCourtBookingFee: number | undefined,
): BookingFinancials {
  const hasSplit =
    typeof b.court_subtotal === "number" &&
    typeof b.booking_fee === "number" &&
    typeof b.total_cost === "number";

  if (hasSplit) {
    return {
      court_subtotal: b.court_subtotal!,
      booking_fee: b.booking_fee!,
      customer_total: b.total_cost!,
    };
  }

  const raw = b.total_cost ?? 0;
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
  court_account_id: string | null;
  court_account_name: string | null;
  booking_count: number;
  court_net: number;
  booking_fees: number;
  customer_total: number;
};

export function aggregateRevenueByCourt(
  bookings: Booking[],
  courts: Court[],
): CourtRevenueRow[] {
  const courtMap = new Map(courts.map((c) => [c.id, c]));
  const byCourt = new Map<
    string,
    {
      court_net: number;
      booking_fees: number;
      customer_total: number;
      booking_count: number;
    }
  >();

  for (const b of bookings) {
    if (!COUNTABLE.includes(b.status)) continue;
    const court = courtMap.get(b.court_id);
    const fallbackCourtBookingFee = court?.booking_fee;
    const f = bookingFinancials(b, fallbackCourtBookingFee);
    const cur = byCourt.get(b.court_id) ?? {
      court_net: 0,
      booking_fees: 0,
      customer_total: 0,
      booking_count: 0,
    };
    cur.court_net += f.court_subtotal;
    cur.booking_fees += f.booking_fee;
    cur.customer_total += f.customer_total;
    cur.booking_count += 1;
    byCourt.set(b.court_id, cur);
  }

  return courts.map((c) => {
    const agg = byCourt.get(c.id);
    return {
      court_id: c.id,
      court_name: c.name,
      court_account_id: c.court_account_id ?? null,
      court_account_name: null,
      booking_count: agg?.booking_count ?? 0,
      court_net: agg?.court_net ?? 0,
      booking_fees: agg?.booking_fees ?? 0,
      customer_total: agg?.customer_total ?? 0,
    };
  });
}

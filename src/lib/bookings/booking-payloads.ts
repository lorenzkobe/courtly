import { segmentTotalCost } from "@/lib/court-pricing";
import { splitBookingAmounts } from "@/lib/platform-fee";
import type { BookingSegment } from "@/lib/booking-range";
import type { Booking, Court } from "@/lib/types/courtly";

export function buildBookingPayloads(
  segments: BookingSegment[],
  court: Court,
  ctx: {
    date: string;
    playerName: string;
    playerEmail: string;
    notes: string;
    bookingGroupId: string;
  },
): Partial<Booking>[] {
  return segments.map((seg) => {
    const court_subtotal = segmentTotalCost(court, seg);
    const { booking_fee, total_cost } = splitBookingAmounts(
      court_subtotal,
      undefined,
    );
    return {
      court_id: court.id,
      court_name: court.name,
      sport: court.sport,
      booking_group_id: ctx.bookingGroupId,
      date: ctx.date,
      start_time: seg.start_time,
      end_time: seg.end_time,
      player_name: ctx.playerName,
      player_email: ctx.playerEmail,
      court_subtotal,
      booking_fee,
      total_cost,
      notes: ctx.notes || undefined,
      status: "confirmed" as const,
    };
  });
}

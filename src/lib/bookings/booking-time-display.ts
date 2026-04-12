import type { Booking } from "@/lib/types/courtly";

/** Local wall-clock start of the booking segment (`date` + `start_time`). */
export function bookingSegmentStartMs(
  segment: Pick<Booking, "date" | "start_time">,
): number {
  const t =
    segment.start_time.split(":").length === 2
      ? `${segment.start_time}:00`
      : segment.start_time;
  return Date.parse(`${segment.date}T${t}`);
}

/** Local wall-clock end of the booking segment (`date` + `end_time`). */
function bookingSegmentEndMs(
  segment: Pick<Booking, "date" | "end_time">,
): number {
  const t =
    segment.end_time.split(":").length === 2
      ? `${segment.end_time}:00`
      : segment.end_time;
  return Date.parse(`${segment.date}T${t}`);
}

/**
 * UI status: treat past confirmed slots as completed without waiting for cron.
 * Cancelled / payment-pending paths keep their stored status.
 */
export function segmentStatusForDisplay(
  segment: Booking,
  nowMs: number,
): Booking["status"] {
  if (segment.status === "cancelled") return "cancelled";
  if (segment.status === "completed") return "completed";
  if (
    segment.status === "confirmed" &&
    Number.isFinite(bookingSegmentEndMs(segment)) &&
    bookingSegmentEndMs(segment) <= nowMs
  ) {
    return "completed";
  }
  return segment.status;
}

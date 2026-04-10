import type { Booking } from "@/lib/types/courtly";
import { formatBookingStatusLabel } from "@/lib/utils";
import { segmentStatusForDisplay } from "@/lib/bookings/booking-time-display";

export type SessionStatusKey = Booking["status"] | "__session_mixed__";

/**
 * One checkout can include multiple DB rows (courts/times). This derives a single
 * status for summary UI: all non-cancelled lines share a status, or "In progress".
 * Pass `nowMs` so past confirmed slots show as completed before cron updates DB.
 */
export function aggregateSessionStatus(
  segments: Booking[],
  nowMs: number,
): {
  statusKey: SessionStatusKey;
} {
  if (segments.length === 0) return { statusKey: "confirmed" };
  if (segments.length === 1) {
    return { statusKey: segmentStatusForDisplay(segments[0]!, nowMs) };
  }

  const active = segments.filter((s) => s.status !== "cancelled");
  if (active.length === 0) return { statusKey: "cancelled" };

  const first = segmentStatusForDisplay(active[0]!, nowMs);
  if (active.every((s) => segmentStatusForDisplay(s, nowMs) === first)) {
    return { statusKey: first };
  }
  return { statusKey: "__session_mixed__" };
}

export function sessionStatusLabel(key: SessionStatusKey): string {
  if (key === "__session_mixed__") {
    return "In progress";
  }
  return formatBookingStatusLabel(key);
}

/**
 * Reviews unlock when every non-cancelled slot is completed in DB or has already
 * ended in wall-clock time (cron may still be updating rows / sending notifications).
 */
export function sessionFullyCompletedForReview(
  segments: Booking[],
  nowMs: number,
): boolean {
  if (segments.length === 0) return false;
  const active = segments.filter((s) => s.status !== "cancelled");
  if (active.length === 0) return false;
  return active.every((s) => segmentStatusForDisplay(s, nowMs) === "completed");
}

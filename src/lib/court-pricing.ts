import {
  formatHourToken,
  hourFromTime,
  type BookingSegment,
} from "@/lib/booking-range";
import { formatPhpCompact } from "@/lib/format-currency";
import type { Court } from "@/lib/types/courtly";

/** Billable hour `h` uses the first window where start <= h < end; else `court.hourly_rate`. */
export function hourlyRateForHourStart(court: Court, hourToken: string): number {
  const h = hourFromTime(hourToken);
  const windows = court.hourly_rate_windows;
  if (windows && windows.length > 0) {
    for (const w of windows) {
      const ws = hourFromTime(w.start);
      const we = hourFromTime(w.end);
      if (h >= ws && h < we) return w.hourly_rate;
    }
  }
  return court.hourly_rate;
}

export function segmentTotalCost(court: Court, seg: BookingSegment): number {
  let sum = 0;
  const sh = hourFromTime(seg.start_time);
  const eh = hourFromTime(seg.end_time);
  for (let h = sh; h < eh; h++) {
    sum += hourlyRateForHourStart(court, formatHourToken(h));
  }
  return sum;
}

export function segmentsTotalCost(
  court: Court,
  segments: BookingSegment[],
): number {
  return segments.reduce((acc, s) => acc + segmentTotalCost(court, s), 0);
}

export function courtRateRange(court: Court): { min: number; max: number } {
  const rates = [court.hourly_rate];
  for (const w of court.hourly_rate_windows ?? []) rates.push(w.hourly_rate);
  return {
    min: Math.min(...rates),
    max: Math.max(...rates),
  };
}

/** Short label for cards (e.g. "₱40–55/hr" or "₱45/hr"). */
export function formatCourtRateSummary(court: Court): string {
  const { min, max } = courtRateRange(court);
  if (min === max) return `${formatPhpCompact(min)}/hr`;
  return `${formatPhpCompact(min)}–${formatPhpCompact(max)}/hr`;
}

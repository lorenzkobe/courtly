import {
  formatHourToken,
  hourFromTime,
  type BookingSegment,
} from "@/lib/booking-range";
import { formatPhpCompact } from "@/lib/format-currency";
import type { Court } from "@/lib/types/courtly";
import { rangeAppliesToDay } from "@/lib/venue-price-ranges";

function dayOfWeekFromDateIso(dateIso: string): number {
  // Construct in local time at noon to avoid TZ edge-cases when the wall-clock
  // date crosses midnight; only the calendar day-of-week matters here.
  const parts = dateIso.split("-").map((part) => Number.parseInt(part, 10));
  if (parts.length === 3 && parts.every((value) => Number.isFinite(value))) {
    const [year, month, day] = parts as [number, number, number];
    return new Date(year, month - 1, day, 12, 0, 0).getDay();
  }
  // Fallback for unexpected formats — caller likely already passes yyyy-MM-dd.
  return new Date(dateIso).getDay();
}

/**
 * Billable hour `h` uses the range that covers `h` AND applies to the booking's
 * day-of-week. Ranges are non-overlapping per day, so at most one matches.
 */
export function hourlyRateForHourStart(
  court: Court,
  hourToken: string,
  dateIso: string,
): number {
  const h = hourFromTime(hourToken);
  const dayOfWeek = dayOfWeekFromDateIso(dateIso);
  const windows = court.hourly_rate_windows ?? [];
  for (const w of windows) {
    if (!rangeAppliesToDay(w, dayOfWeek)) continue;
    const ws = hourFromTime(w.start);
    let we = hourFromTime(w.end);
    if (we === 0 && ws > 0) {
      we = 24;
    }
    if (h >= ws && h < we) return w.hourly_rate;
  }
  return 0;
}

export function segmentTotalCost(
  court: Court,
  seg: BookingSegment,
  dateIso: string,
): number {
  let sum = 0;
  const sh = hourFromTime(seg.start_time);
  const eh = hourFromTime(seg.end_time);
  for (let h = sh; h < eh; h++) {
    sum += hourlyRateForHourStart(court, formatHourToken(h), dateIso);
  }
  return sum;
}

export function segmentsTotalCost(
  court: Court,
  segments: BookingSegment[],
  dateIso: string,
): number {
  return segments.reduce((acc, s) => acc + segmentTotalCost(court, s, dateIso), 0);
}

export function courtRateRange(court: Court): { min: number; max: number } {
  const windows = court.hourly_rate_windows ?? [];
  if (windows.length === 0) return { min: 0, max: 0 };
  const rates = windows.map((w) => w.hourly_rate);
  return {
    min: Math.min(...rates),
    max: Math.max(...rates),
  };
}

export type PricingTier = {
  startHour: number;
  endHour: number;
  hours: number;
  ratePerHour: number;
  subtotal: number;
};

/** Groups consecutive hours with the same rate into display tiers. */
export function segmentPricingTiers(
  court: Court,
  seg: { start_time: string; end_time: string },
  dateIso: string,
): PricingTier[] {
  const sh = hourFromTime(seg.start_time);
  const eh = hourFromTime(seg.end_time);
  if (sh >= eh) return [];

  const tiers: PricingTier[] = [];
  let tierStart = sh;
  let currentRate = hourlyRateForHourStart(court, formatHourToken(sh), dateIso);

  for (let h = sh + 1; h <= eh; h++) {
    const isEnd = h === eh;
    const rate = isEnd
      ? NaN
      : hourlyRateForHourStart(court, formatHourToken(h), dateIso);
    if (isEnd || rate !== currentRate) {
      tiers.push({
        startHour: tierStart,
        endHour: h,
        hours: h - tierStart,
        ratePerHour: currentRate,
        subtotal: currentRate * (h - tierStart),
      });
      tierStart = h;
      currentRate = rate;
    }
  }

  return tiers;
}

/** Short label for cards (e.g. "₱40–55/hr" or "₱45/hr"). */
export function formatCourtRateSummary(court: Court): string {
  const windows = court.hourly_rate_windows ?? [];
  if (windows.length === 0) return "—";
  const { min, max } = courtRateRange(court);
  if (min === max) return `${formatPhpCompact(min)}/hr`;
  return `${formatPhpCompact(min)}–${formatPhpCompact(max)}/hr`;
}

import type { Booking } from "@/lib/types/courtly";

export type BookingSegment = {
  start_time: string;
  end_time: string;
  hours: number;
};

export function hourFromTime(time: string): number {
  return Number.parseInt(time.split(":")[0] ?? "0", 10);
}

/** e.g. `09:00` → `9:00` for display */
export function formatTimeShort(token: string): string {
  const [h, m = "00"] = token.split(":");
  const hour = Number.parseInt(h ?? "0", 10);
  const mins = (m ?? "00").slice(0, 2);
  if (mins && mins !== "00") {
    return `${hour}:${mins.padStart(2, "0")}`;
  }
  return `${hour}:00`;
}

export function formatSegmentLine(s: BookingSegment): string {
  return `${formatTimeShort(s.start_time)} – ${formatTimeShort(s.end_time)}`;
}

export function bookingDurationHours(
  b: Pick<Booking, "start_time" | "end_time">,
): number {
  return hourFromTime(b.end_time) - hourFromTime(b.start_time);
}

export function formatHourToken(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

/** Each hour start that falls inside a confirmed booking interval [start, end). */
export function occupiedHourStarts(bookings: Booking[]): Set<string> {
  const set = new Set<string>();
  for (const b of bookings) {
    if (b.status !== "confirmed") continue;
    const sh = hourFromTime(b.start_time);
    const eh = hourFromTime(b.end_time);
    for (let h = sh; h < eh; h++) {
      set.add(formatHourToken(h));
    }
  }
  return set;
}

/** Contiguous free hour runs inside [rangeStart, rangeEnd) (end exclusive). */
export function availableSegmentsInRange(
  rangeStart: string,
  rangeEnd: string,
  occupied: Set<string>,
): BookingSegment[] {
  const sh = hourFromTime(rangeStart);
  const eh = hourFromTime(rangeEnd);
  const segments: BookingSegment[] = [];
  let runStart: number | null = null;

  for (let h = sh; h < eh; h++) {
    const token = formatHourToken(h);
    const blocked = occupied.has(token);
    if (!blocked) {
      if (runStart === null) runStart = h;
    } else if (runStart !== null) {
      segments.push({
        start_time: formatHourToken(runStart),
        end_time: formatHourToken(h),
        hours: h - runStart,
      });
      runStart = null;
    }
  }
  if (runStart !== null) {
    segments.push({
      start_time: formatHourToken(runStart),
      end_time: formatHourToken(eh),
      hours: eh - runStart,
    });
  }
  return segments;
}

export function bookedHoursInSelection(
  rangeStart: string,
  rangeEnd: string,
  occupied: Set<string>,
): string[] {
  const sh = hourFromTime(rangeStart);
  const eh = hourFromTime(rangeEnd);
  const list: string[] = [];
  for (let h = sh; h < eh; h++) {
    const token = formatHourToken(h);
    if (occupied.has(token)) list.push(token);
  }
  return list;
}

export function selectionCoversBookedSlots(
  rangeStart: string,
  rangeEnd: string,
  occupied: Set<string>,
): boolean {
  return bookedHoursInSelection(rangeStart, rangeEnd, occupied).length > 0;
}

export function totalBillableHours(segments: BookingSegment[]): number {
  return segments.reduce((s, x) => s + x.hours, 0);
}

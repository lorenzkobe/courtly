import { formatHourToken, hourFromTime } from "@/lib/booking-range";
import type { CourtRateWindow } from "@/lib/types/courtly";

const MIN_HOURLY_RATE_PHP = 10;

/** Sunday-first canonical week. Stored values are 0..6 to match `Date.getDay()`. */
export const ALL_DAYS_OF_WEEK = [0, 1, 2, 3, 4, 5, 6] as const;
const ALL_DAYS_SET = new Set<number>(ALL_DAYS_OF_WEEK);

/** A window with an empty/missing `days_of_week` is treated as every day. */
function effectiveDays(window: Pick<CourtRateWindow, "days_of_week">): Set<number> {
  const raw = window.days_of_week;
  if (!Array.isArray(raw) || raw.length === 0) return ALL_DAYS_SET;
  const out = new Set<number>();
  for (const value of raw) {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 6) {
      out.add(value);
    }
  }
  return out.size > 0 ? out : ALL_DAYS_SET;
}

/** True iff the window covers the supplied JS day-of-week (0=Sun..6=Sat). */
export function rangeAppliesToDay(
  window: Pick<CourtRateWindow, "days_of_week">,
  dayOfWeek: number,
): boolean {
  return effectiveDays(window).has(dayOfWeek);
}

function rangeHours(w: Pick<CourtRateWindow, "start" | "end">): { startHour: number; endHour: number } {
  const startHour = hourFromTime(w.start);
  let endHour = hourFromTime(w.end);
  // Allow ranges that end at midnight by interpreting 00:00 as 24:00 (end of same day)
  // when the start is later than the end (e.g. 21:00 -> 00:00).
  if (endHour === 0 && startHour > 0) {
    endHour = 24;
  }
  return { startHour, endHour };
}

function parseDaysOfWeekFromUnknown(raw: unknown): number[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const out: number[] = [];
  for (const item of raw) {
    const n = typeof item === "number" ? item : Number.parseInt(String(item), 10);
    if (Number.isFinite(n) && n >= 0 && n <= 6 && !out.includes(n)) {
      out.push(n);
    }
  }
  if (out.length === 0) return undefined;
  out.sort((a, b) => a - b);
  // Drop the field entirely when every day is selected — keeps stored JSON tidy.
  if (out.length === 7) return undefined;
  return out;
}

/** Parse API body `hourly_rate_windows` (or legacy-shaped items) into typed ranges. */
export function parseRateWindowsFromUnknown(raw: unknown): CourtRateWindow[] {
  if (!Array.isArray(raw)) return [];
  const out: CourtRateWindow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const rawItem = item as Record<string, unknown>;
    const start = typeof rawItem.start === "string" ? rawItem.start.trim() : "";
    const end = typeof rawItem.end === "string" ? rawItem.end.trim() : "";
    const rawRate = rawItem.hourly_rate;
    const hourly_rate =
      typeof rawRate === "number" && Number.isFinite(rawRate)
        ? rawRate
        : Number.parseFloat(String(rawRate ?? ""));
    if (start && end && Number.isFinite(hourly_rate)) {
      const days_of_week = parseDaysOfWeekFromUnknown(rawItem.days_of_week);
      const window: CourtRateWindow = { start, end, hourly_rate };
      if (days_of_week) window.days_of_week = days_of_week;
      out.push(window);
    }
  }
  return out;
}

/** Half-open [start, end) overlap that also requires shared days-of-week. */
export function rateWindowsOverlap(a: CourtRateWindow, b: CourtRateWindow): boolean {
  const { startHour: as, endHour: ae } = rangeHours(a);
  const { startHour: bs, endHour: be } = rangeHours(b);
  // Invalid windows should be rejected by structural validation, not treated as overlapping.
  if (as >= ae || bs >= be) return false;
  if (!(as < be && bs < ae)) return false;
  const daysA = effectiveDays(a);
  for (const day of effectiveDays(b)) {
    if (daysA.has(day)) return true;
  }
  return false;
}

export function validateVenuePriceRanges(
  ranges: CourtRateWindow[],
): { ok: true } | { ok: false; error: string } {
  if (!ranges.length) {
    return { ok: false, error: "Add at least one price range." };
  }
  // First validate each window structurally so overlap checks don't mask the real error.
  for (const w of ranges) {
    if (!w.start?.trim() || !w.end?.trim()) {
      return { ok: false, error: "Each range needs a start and end time." };
    }
    const { startHour: sh, endHour: eh } = rangeHours(w);
    if (!Number.isFinite(sh) || !Number.isFinite(eh) || sh >= eh) {
      return {
        ok: false,
        error:
          "Each range must end after start on the same calendar day (hourly slots only). Midnight (12:00 AM) is allowed as an end time.",
      };
    }
    if (w.hourly_rate < MIN_HOURLY_RATE_PHP || !Number.isFinite(w.hourly_rate)) {
      return {
        ok: false,
        error: `Each range needs a rate of at least ₱${MIN_HOURLY_RATE_PHP}/hr.`,
      };
    }
    if (effectiveDays(w).size === 0) {
      return { ok: false, error: "Each range needs at least one active day of the week." };
    }
  }
  // Then check overlaps (half-open intervals; touching endpoints is allowed).
  for (let i = 0; i < ranges.length; i++) {
    const w = ranges[i]!;
    for (let comparisonIndex = i + 1; comparisonIndex < ranges.length; comparisonIndex++) {
      if (rateWindowsOverlap(w, ranges[comparisonIndex]!)) {
        return {
          ok: false,
          error:
            "Price ranges cannot overlap on the same day. Split or adjust times so each hour belongs to at most one range per day.",
        };
      }
    }
  }
  return { ok: true };
}

/**
 * Every hour start `h` covered by any range. When `dayOfWeek` is supplied, only
 * ranges that include that day-of-week contribute.
 */
export function bookableHourTokensFromRanges(
  ranges: CourtRateWindow[],
  dayOfWeek?: number,
): string[] {
  const set = new Set<string>();
  for (const w of ranges) {
    if (typeof dayOfWeek === "number" && !rangeAppliesToDay(w, dayOfWeek)) continue;
    const { startHour: sh, endHour: eh } = rangeHours(w);
    if (!Number.isFinite(sh) || !Number.isFinite(eh) || sh >= eh) continue;
    for (let h = sh; h < eh; h++) {
      // formatHourToken expects 0-23; ignore 24 sentinel (midnight end).
      if (h >= 0 && h <= 23) set.add(formatHourToken(h));
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Min start and max end across ranges (for filters); empty span if no ranges. */
export function pricingSpanFromRanges(
  ranges: CourtRateWindow[],
): { open: string; close: string } | null {
  if (!ranges.length) return null;
  let minS = ranges[0]!.start;
  let maxE = ranges[0]!.end;
  let maxEndHour = rangeHours(ranges[0]!).endHour;
  for (const w of ranges) {
    if (w.start.localeCompare(minS) < 0) minS = w.start;
    const endHour = rangeHours(w).endHour;
    if (endHour > maxEndHour) {
      maxEndHour = endHour;
      maxE = endHour === 24 ? "24:00" : w.end;
    }
  }
  return { open: minS, close: maxE };
}

/** One row in admin/superadmin venue forms (`rate` is the string in the number input). */
export type PriceRangeFormRow = {
  start: string;
  end: string;
  rate: string;
  days_of_week: number[];
};

/** Form rows default to every day selected. */
export function makeEmptyPriceRangeFormRow(
  start = "07:00",
  end = "22:00",
): PriceRangeFormRow {
  return { start, end, rate: "", days_of_week: [...ALL_DAYS_OF_WEEK] };
}

/** True only when every row has start, end, days, and a positive numeric rate. */
export function priceRangeFormRowsComplete(rows: PriceRangeFormRow[]): boolean {
  if (rows.length === 0) return false;
  for (const row of rows) {
    const startTime = row.start.trim();
    const endTime = row.end.trim();
    const rateText = row.rate.trim();
    if (!startTime || !endTime || !rateText) return false;
    if (!Array.isArray(row.days_of_week) || row.days_of_week.length === 0) return false;
    const parsedRate = Number.parseFloat(rateText);
    if (!Number.isFinite(parsedRate) || parsedRate < MIN_HOURLY_RATE_PHP) return false;
  }
  return true;
}

export function courtRateWindowsFromCompleteFormRows(
  rows: PriceRangeFormRow[],
): CourtRateWindow[] {
  return rows.map((row) => {
    const days = [...row.days_of_week].sort((a, b) => a - b);
    const window: CourtRateWindow = {
      start: row.start.trim(),
      end: row.end.trim(),
      hourly_rate: Number.parseFloat(row.rate.trim()),
    };
    // Persist days_of_week only when the row picks a subset; full week stays implicit.
    if (days.length > 0 && days.length < 7) {
      window.days_of_week = days;
    }
    return window;
  });
}

export function formRowFromRateWindow(window: CourtRateWindow): PriceRangeFormRow {
  const days = Array.isArray(window.days_of_week) && window.days_of_week.length > 0
    ? [...window.days_of_week].filter((d) => d >= 0 && d <= 6)
    : [...ALL_DAYS_OF_WEEK];
  return {
    start: window.start,
    end: window.end,
    rate: String(window.hourly_rate),
    days_of_week: days,
  };
}

/** Validate form rows without dropping incomplete lines (fixes “empty rate but Save enabled”). */
export function validatePriceRangeFormRows(
  rows: PriceRangeFormRow[],
):
  | { ok: true; windows: CourtRateWindow[] }
  | { ok: false; error: string } {
  if (rows.length === 0) {
    return { ok: false, error: "Add at least one price range." };
  }
  if (!priceRangeFormRowsComplete(rows)) {
    return {
      ok: false,
      error:
        `Each row needs a start time, end time, at least one active day, and a rate of at least ₱${MIN_HOURLY_RATE_PHP}/hr. Remove any row you are not using yet.`,
    };
  }
  const windows = courtRateWindowsFromCompleteFormRows(rows);
  const structural = validateVenuePriceRanges(windows);
  if (!structural.ok) return structural;
  return { ok: true, windows };
}

const DAY_SHORT_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const DAY_INITIAL_LABELS = ["S", "M", "T", "W", "T", "F", "S"] as const;

export function dayOfWeekShortLabel(day: number): string {
  return DAY_SHORT_LABELS[day] ?? String(day);
}

export function dayOfWeekInitialLabel(day: number): string {
  return DAY_INITIAL_LABELS[day] ?? String(day);
}

/**
 * Human-readable summary for a window's days. Returns "Every day" when all 7
 * are covered, "Weekdays"/"Weekends" for common subsets, otherwise short labels
 * joined with `, ` (e.g. "Mon, Wed, Fri").
 */
export function formatDaysOfWeekLabel(
  window: Pick<CourtRateWindow, "days_of_week">,
): string {
  const days = [...effectiveDays(window)].sort((a, b) => a - b);
  if (days.length === 7) return "Every day";
  const set = new Set(days);
  const isWeekdays = set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d));
  if (isWeekdays) return "Weekdays";
  const isWeekends = set.size === 2 && set.has(0) && set.has(6);
  if (isWeekends) return "Weekends";
  return days.map((day) => dayOfWeekShortLabel(day)).join(", ");
}

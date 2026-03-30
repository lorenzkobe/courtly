import { formatHourToken, hourFromTime } from "@/lib/booking-range";
import type { CourtRateWindow } from "@/lib/types/courtly";

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
      out.push({ start, end, hourly_rate });
    }
  }
  return out;
}

/** Half-open [start, end) in whole hours; overlap if some hour start is in both. */
export function rateWindowsOverlap(a: CourtRateWindow, b: CourtRateWindow): boolean {
  const { startHour: as, endHour: ae } = rangeHours(a);
  const { startHour: bs, endHour: be } = rangeHours(b);
  // Invalid windows should be rejected by structural validation, not treated as overlapping.
  if (as >= ae || bs >= be) return false;
  return as < be && bs < ae;
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
    if (w.hourly_rate <= 0 || !Number.isFinite(w.hourly_rate)) {
      return { ok: false, error: "Each range needs a positive price per hour." };
    }
  }
  // Then check overlaps (half-open intervals; touching endpoints is allowed).
  for (let i = 0; i < ranges.length; i++) {
    const w = ranges[i]!;
    for (let comparisonIndex = i + 1; comparisonIndex < ranges.length; comparisonIndex++) {
      if (rateWindowsOverlap(w, ranges[comparisonIndex]!)) {
        return {
          ok: false,
          error: "Price ranges cannot overlap. Split or adjust times so each hour belongs to at most one range.",
        };
      }
    }
  }
  return { ok: true };
}

/** Every hour start h with start <= h < end for some range; sorted ascending. */
export function bookableHourTokensFromRanges(ranges: CourtRateWindow[]): string[] {
  const set = new Set<string>();
  for (const w of ranges) {
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
export type PriceRangeFormRow = { start: string; end: string; rate: string };

/** True only when every row has start, end, and a positive numeric rate (no silent partial rows). */
export function priceRangeFormRowsComplete(rows: PriceRangeFormRow[]): boolean {
  if (rows.length === 0) return false;
  for (const row of rows) {
    const startTime = row.start.trim();
    const endTime = row.end.trim();
    const rateText = row.rate.trim();
    if (!startTime || !endTime || !rateText) return false;
    const parsedRate = Number.parseFloat(rateText);
    if (!Number.isFinite(parsedRate) || parsedRate <= 0) return false;
  }
  return true;
}

export function courtRateWindowsFromCompleteFormRows(
  rows: PriceRangeFormRow[],
): CourtRateWindow[] {
  return rows.map((row) => ({
    start: row.start.trim(),
    end: row.end.trim(),
    hourly_rate: Number.parseFloat(row.rate.trim()),
  }));
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
        "Each row needs a start time, end time, and a positive rate. Remove any row you are not using yet.",
    };
  }
  const windows = courtRateWindowsFromCompleteFormRows(rows);
  const structural = validateVenuePriceRanges(windows);
  if (!structural.ok) return structural;
  return { ok: true, windows };
}

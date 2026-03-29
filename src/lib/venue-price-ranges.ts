import { formatHourToken, hourFromTime } from "@/lib/booking-range";
import type { CourtRateWindow } from "@/lib/types/courtly";

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
  const as = hourFromTime(a.start);
  const ae = hourFromTime(a.end);
  const bs = hourFromTime(b.start);
  const be = hourFromTime(b.end);
  if (as >= ae || bs >= be) return true;
  return as < be && bs < ae;
}

export function validateVenuePriceRanges(
  ranges: CourtRateWindow[],
): { ok: true } | { ok: false; error: string } {
  if (!ranges.length) {
    return { ok: false, error: "Add at least one price range." };
  }
  for (let i = 0; i < ranges.length; i++) {
    const w = ranges[i]!;
    if (!w.start?.trim() || !w.end?.trim()) {
      return { ok: false, error: "Each range needs a start and end time." };
    }
    const sh = hourFromTime(w.start);
    const eh = hourFromTime(w.end);
    if (!Number.isFinite(sh) || !Number.isFinite(eh) || sh >= eh) {
      return {
        ok: false,
        error:
          "Each range must end after start on the same calendar day (hourly slots only; split overnight into separate ranges if needed).",
      };
    }
    if (w.hourly_rate <= 0 || !Number.isFinite(w.hourly_rate)) {
      return { ok: false, error: "Each range needs a positive price per hour." };
    }
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
    const sh = hourFromTime(w.start);
    const eh = hourFromTime(w.end);
    if (!Number.isFinite(sh) || !Number.isFinite(eh) || sh >= eh) continue;
    for (let h = sh; h < eh; h++) {
      set.add(formatHourToken(h));
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
  for (const w of ranges) {
    if (w.start.localeCompare(minS) < 0) minS = w.start;
    if (w.end.localeCompare(maxE) > 0) maxE = w.end;
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

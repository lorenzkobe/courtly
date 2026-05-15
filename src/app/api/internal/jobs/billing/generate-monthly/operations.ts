import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { emitNewBillingCycleToVenueAdmins } from "@/lib/notifications/emit-from-server";
import type { GenerateBillingResult } from "@/lib/types/courtly";

export function isBillingGenerationDay(): boolean {
  // UTC+8: offset by 8 hours so "day 1" means day 1 in PH time
  const now = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return now.getUTCDate() === 1;
}

function getPreviousMonthPeriod(): { year: number; month: number } {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { year: prev.getFullYear(), month: prev.getMonth() + 1 };
}

function buildPeriod(year: number, month: number): { periodStart: string; periodEnd: string } {
  const paddedMonth = String(month).padStart(2, "0");
  const periodStart = `${year}-${paddedMonth}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const periodEnd = `${year}-${paddedMonth}-${String(lastDay).padStart(2, "0")}`;
  return { periodStart, periodEnd };
}

export async function runGenerateMonthlyBilling(params?: {
  year?: number;
  month?: number;
  mode?: "backfill" | "replace_unsettled";
}): Promise<GenerateBillingResult> {
  const mode = params?.mode ?? "backfill";

  let year: number;
  let month: number;
  if (params?.year && params?.month) {
    year = params.year;
    month = params.month;
  } else {
    ({ year, month } = getPreviousMonthPeriod());
  }

  const { periodStart, periodEnd } = buildPeriod(year, month);

  const supabase = createSupabaseAdminClient();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;

  const { data: venues, error: venueErr } = await db
    .from("venues")
    .select("id, name")
    .eq("status", "active");
  if (venueErr) throw venueErr;

  const venueRows = (venues ?? []) as { id: string; name: string }[];
  const venueIds = venueRows.map((row) => row.id);

  let generated = 0;
  let skipped = 0;
  let protected_paid = 0;

  if (venueIds.length === 0) {
    return { generated, skipped, protected_paid };
  }

  const [existingCyclesResult, courtsResult] = await Promise.all([
    db
      .from("venue_billing_cycles")
      .select("id, venue_id, status")
      .in("venue_id", venueIds)
      .eq("period_start", periodStart),
    db.from("courts").select("id, venue_id").in("venue_id", venueIds),
  ]);

  const existingByVenue = new Map<string, { id: string; status: string }>();
  for (const row of (existingCyclesResult.data ?? []) as {
    id: string;
    venue_id: string;
    status: string;
  }[]) {
    existingByVenue.set(row.venue_id, { id: row.id, status: row.status });
  }

  const courtsByVenue = new Map<string, string[]>();
  const courtToVenue = new Map<string, string>();
  for (const row of (courtsResult.data ?? []) as { id: string; venue_id: string }[]) {
    const list = courtsByVenue.get(row.venue_id) ?? [];
    list.push(row.id);
    courtsByVenue.set(row.venue_id, list);
    courtToVenue.set(row.id, row.venue_id);
  }

  const allCourtIds = Array.from(courtToVenue.keys());
  const bookingsByVenue = new Map<string, { count: number; fees: number }>();
  if (allCourtIds.length > 0) {
    const { data: bookings } = await db
      .from("bookings")
      .select("court_id, booking_fee")
      .in("court_id", allCourtIds)
      .in("status", ["confirmed", "completed"])
      .gte("date", periodStart)
      .lte("date", periodEnd);
    for (const row of (bookings ?? []) as { court_id: string; booking_fee: unknown }[]) {
      const venueId = courtToVenue.get(row.court_id);
      if (!venueId) continue;
      const current = bookingsByVenue.get(venueId) ?? { count: 0, fees: 0 };
      current.count += 1;
      current.fees += Number(row.booking_fee ?? 0);
      bookingsByVenue.set(venueId, current);
    }
  }

  const periodLabel = new Date(periodStart + "T00:00:00").toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
  });

  for (const venue of venueRows) {
    const existing = existingByVenue.get(venue.id);
    if (existing) {
      if (existing.status === "paid") {
        protected_paid++;
        continue;
      }
      if (mode === "backfill") {
        skipped++;
        continue;
      }
    }

    const stats = bookingsByVenue.get(venue.id) ?? { count: 0, fees: 0 };

    const { data: upserted, error } = await db
      .from("venue_billing_cycles")
      .upsert(
        {
          venue_id: venue.id,
          period_start: periodStart,
          period_end: periodEnd,
          booking_count: stats.count,
          total_booking_fees: stats.fees,
          status: "unsettled",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "venue_id,period_start", ignoreDuplicates: false },
      )
      .select("id")
      .maybeSingle();

    if (error) {
      skipped++;
      continue;
    }
    generated++;
    const cycleId = (upserted as { id?: string } | null)?.id;
    if (cycleId && venue.name) {
      emitNewBillingCycleToVenueAdmins({
        venueId: venue.id,
        venueName: venue.name,
        cycleId,
        period: periodLabel,
      }).catch(() => undefined);
    }
  }

  return { generated, skipped, protected_paid };
}

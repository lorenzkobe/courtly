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
    .select("id")
    .eq("status", "active");
  if (venueErr) throw venueErr;

  let generated = 0;
  let skipped = 0;
  let protected_paid = 0;

  for (const venue of (venues ?? []) as { id: string }[]) {
    const { data: existing } = await db
      .from("venue_billing_cycles")
      .select("id, status")
      .eq("venue_id", venue.id)
      .eq("period_start", periodStart)
      .maybeSingle();

    if (existing) {
      if ((existing as { status: string }).status === "paid") {
        protected_paid++;
        continue;
      }
      if (mode === "backfill") {
        skipped++;
        continue;
      }
    }

    const { data: courts } = await db
      .from("courts")
      .select("id")
      .eq("venue_id", venue.id);

    const courtIds = ((courts ?? []) as { id: string }[]).map((court) => court.id);

    let booking_count = 0;
    let total_booking_fees = 0;

    if (courtIds.length > 0) {
      const { data: bookings } = await db
        .from("bookings")
        .select("booking_fee")
        .in("court_id", courtIds)
        .in("status", ["confirmed", "completed"])
        .gte("date", periodStart)
        .lte("date", periodEnd);

      booking_count = (bookings ?? []).length;
      total_booking_fees = ((bookings ?? []) as { booking_fee: unknown }[]).reduce(
        (sum, b) => sum + Number(b.booking_fee ?? 0),
        0,
      );
    }

    const { error } = await db.from("venue_billing_cycles").upsert(
      {
        venue_id: venue.id,
        period_start: periodStart,
        period_end: periodEnd,
        booking_count,
        total_booking_fees,
        status: "unsettled",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "venue_id,period_start", ignoreDuplicates: false },
    );

    if (error) {
      skipped++;
    } else {
      generated++;
      // Fire-and-forget: notify venue admins about the new billing cycle
      const { data: newCycle } = await db
        .from("venue_billing_cycles")
        .select("id")
        .eq("venue_id", venue.id)
        .eq("period_start", periodStart)
        .maybeSingle();
      const { data: venueRow } = await db
        .from("venues")
        .select("name")
        .eq("id", venue.id)
        .maybeSingle();
      if (newCycle?.id && venueRow?.name) {
        const periodLabel = new Date(periodStart + "T00:00:00").toLocaleDateString("en-PH", {
          year: "numeric",
          month: "long",
        });
        emitNewBillingCycleToVenueAdmins({
          venueId: venue.id,
          venueName: venueRow.name as string,
          cycleId: newCycle.id as string,
          period: periodLabel,
        }).catch(() => undefined);
      }
    }
  }

  return { generated, skipped, protected_paid };
}

import { NextResponse } from "next/server";
import { isCronAuthorized } from "@/app/api/internal/jobs/bookings/complete-hourly/is-authorized";
import { runCompleteBookingsJob } from "@/app/api/internal/jobs/bookings/complete-hourly/operations/complete-bookings";
import { runSyncOpenPlayLifecycleJob } from "@/app/api/internal/jobs/bookings/complete-hourly/operations/sync-open-play-lifecycle";

export async function GET(req: Request) {
  const startedAt = Date.now();
  if (!isCronAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const bookingPayload = await runCompleteBookingsJob();
  const openPlayPayload = await runSyncOpenPlayLifecycleJob(Date.now());

  const body = {
    ...bookingPayload,
    open_play_updated_count: openPlayPayload.open_play_updated_count,
    open_play_job_duration_ms: openPlayPayload.duration_ms,
    duration_ms: Date.now() - startedAt,
  };
  console.info("[complete-hourly]", JSON.stringify(body));
  return NextResponse.json(body);
}

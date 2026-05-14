import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import {
  listBillingCyclesByVenue,
  listVenueAdminAssignmentsByAdminUser,
  getVenueById,
} from "@/lib/data/courtly-db";
import type { AdminBillingListResponse, BillingCycleStatus, VenueBillingCycle } from "@/lib/types/courtly";

export async function GET(req: Request) {
  const user = await readSessionUser();
  if (user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get("status") as BillingCycleStatus | null;

  const assignments = await listVenueAdminAssignmentsByAdminUser(user.id);
  if (assignments.length === 0) {
    return NextResponse.json({ error: "No venue assigned." }, { status: 404 });
  }

  const venueId = assignments[0].venue_id;
  const venue = await getVenueById(venueId);
  if (!venue) {
    return NextResponse.json({ error: "Venue not found." }, { status: 404 });
  }

  let cycles: VenueBillingCycle[] = await listBillingCyclesByVenue(venueId);
  if (statusFilter === "unsettled" || statusFilter === "paid") {
    cycles = cycles.filter((cycle) => cycle.status === statusFilter);
  }

  const response: AdminBillingListResponse = {
    cycles,
    venue: { id: venue.id, name: venue.name },
  };

  return NextResponse.json(response);
}

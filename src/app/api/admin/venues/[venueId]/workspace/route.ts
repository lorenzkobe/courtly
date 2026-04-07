import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { canMutateVenue } from "@/lib/auth/management";
import {
  getVenueById,
  listCourtsByVenue,
  listVenueAdminAssignmentsByVenue,
} from "@/lib/data/courtly-db";
import type { AdminVenueWorkspaceResponse } from "@/lib/types/courtly";

type Ctx = { params: Promise<{ venueId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { venueId } = await ctx.params;
  const user = await readSessionUser();
  const assignments = await listVenueAdminAssignmentsByVenue(venueId);
  if (!user || !canMutateVenue(user, venueId, assignments)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [venue, courts] = await Promise.all([
    getVenueById(venueId),
    listCourtsByVenue(venueId),
  ]);
  if (!venue) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body: AdminVenueWorkspaceResponse = { venue, courts };
  return NextResponse.json(body);
}

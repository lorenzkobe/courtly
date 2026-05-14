import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import {
  getVenueRequestById,
  listManagedUsersByIds,
  listVenueRequests,
  listVenues,
} from "@/lib/data/courtly-db";
import { emitVenueRequestDecisionToRequester } from "@/lib/notifications/emit-from-server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Venue } from "@/lib/types/courtly";
import { findPotentialVenueDuplicate } from "@/lib/venue-requests";

type Ctx = { params: Promise<{ requestId: string }> };

export async function POST(req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { requestId } = await ctx.params;
  const requestRecord = await getVenueRequestById(requestId);
  if (!requestRecord) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (requestRecord.request_status !== "pending") {
    return NextResponse.json(
      { error: "Only pending requests can be approved." },
      { status: 409 },
    );
  }

  const [venues, pendingRequests, requesterUsers] = await Promise.all([
    listVenues(),
    listVenueRequests({ statuses: ["pending"] }),
    listManagedUsersByIds([requestRecord.requested_by]),
  ]);
  const requester = requesterUsers.find(
    (managedUser) =>
      managedUser.id === requestRecord.requested_by && managedUser.role === "admin",
  );
  if (!requester) {
    return NextResponse.json(
      { error: "Request creator must be an active court admin to approve this request." },
      { status: 409 },
    );
  }

  const duplicate = findPotentialVenueDuplicate(requestRecord, venues, pendingRequests, {
    ignoreRequestId: requestRecord.id,
  });
  if (duplicate) {
    return NextResponse.json(
      {
        error:
          duplicate.type === "venue"
            ? `A similar venue already exists (${duplicate.name}).`
            : `A pending request already exists for a similar venue (${duplicate.name}).`,
      },
      { status: 409 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { review_note?: string };
  const reviewNote =
    typeof body.review_note === "string" && body.review_note.trim().length > 0
      ? body.review_note.trim()
      : null;

  const adminClient = createSupabaseAdminClient();
  const venuePayload: Omit<Venue, "id"> = {
    name: requestRecord.name,
    location: requestRecord.location,
    city: requestRecord.city,
    contact_phone: requestRecord.contact_phone,
    facebook_url: requestRecord.facebook_url,
    instagram_url: requestRecord.instagram_url,
    sport: requestRecord.sport,
    hourly_rate_windows: requestRecord.hourly_rate_windows,
    status: requestRecord.status,
    amenities: requestRecord.amenities,
    photo_urls: requestRecord.photo_urls ?? [],
    created_at: new Date().toISOString(),
    map_latitude: requestRecord.map_latitude,
    map_longitude: requestRecord.map_longitude,
    accepts_gcash: requestRecord.accepts_gcash,
    gcash_account_name: requestRecord.gcash_account_name,
    gcash_account_number: requestRecord.gcash_account_number,
    accepts_maya: requestRecord.accepts_maya,
    maya_account_name: requestRecord.maya_account_name,
    maya_account_number: requestRecord.maya_account_number,
  };

  const { data: insertedVenue, error: venueError } = await adminClient
    .from("venues")
    .insert(venuePayload as never)
    .select("*")
    .single();
  if (venueError) {
    return NextResponse.json({ error: venueError.message }, { status: 500 });
  }

  const venueId = (insertedVenue as { id: string }).id;
  const { error: assignmentError } = await adminClient
    .from("venue_admin_assignments")
    .insert({
      venue_id: venueId,
      admin_user_id: requester.id,
    } as never);
  if (assignmentError) {
    await adminClient.from("venues").delete().eq("id", venueId);
    return NextResponse.json({ error: assignmentError.message }, { status: 500 });
  }

  const { data: updatedRequest, error: requestUpdateError } = await adminClient
    .from("venue_requests")
    .update({
      request_status: "approved",
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
      review_note: reviewNote,
      approved_venue_id: venueId,
    } as never)
    .eq("id", requestId)
    .eq("request_status", "pending")
    .select("*")
    .maybeSingle();
  if (requestUpdateError || !updatedRequest) {
    await adminClient.from("venue_admin_assignments").delete().eq("venue_id", venueId);
    await adminClient.from("venues").delete().eq("id", venueId);
    return NextResponse.json(
      { error: requestUpdateError?.message ?? "Request no longer pending." },
      { status: 409 },
    );
  }

  void emitVenueRequestDecisionToRequester({
    userId: requester.id,
    requestId: requestRecord.id,
    venueName: requestRecord.name,
    decision: "approved",
    reviewNote: reviewNote,
    approvedVenueId: venueId,
  });

  return NextResponse.json({ request: updatedRequest, venue: insertedVenue });
}

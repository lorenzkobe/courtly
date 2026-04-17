import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import {
  insertRow,
  listVenueRequests,
  listVenueRequestsByRequester,
  listVenues,
} from "@/lib/data/courtly-db";
import type { AdminVenueRequestsResponse, VenueRequest } from "@/lib/types/courtly";
import {
  findPotentialVenueDuplicate,
  normalizeVenueDraftFromBody,
} from "@/lib/venue-requests";
import { emitVenueRequestCreatedToSuperadmins } from "@/lib/notifications/emit-from-server";

export async function GET() {
  const user = await readSessionUser();
  if (user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const requests = await listVenueRequestsByRequester(user.id);
  const body: AdminVenueRequestsResponse = { requests };
  return NextResponse.json(body);
}

export async function POST(req: Request) {
  const user = await readSessionUser();
  if (user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as Record<string, unknown>;
  const parsed = normalizeVenueDraftFromBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const [venues, pendingRequests] = await Promise.all([
    listVenues(),
    listVenueRequests({ statuses: ["pending"] }),
  ]);
  const duplicate = findPotentialVenueDuplicate(parsed.value, venues, pendingRequests);
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

  const inserted = await insertRow(
    "venue_requests",
    {
      ...parsed.value,
      requested_by: user.id,
      request_status: "pending",
      reviewed_by: null,
      reviewed_at: null,
      review_note: null,
      approved_venue_id: null,
    } as Omit<VenueRequest, "id" | "created_at" | "updated_at">,
  );
  void emitVenueRequestCreatedToSuperadmins({
    requestId: inserted.id,
    venueName: inserted.name ?? parsed.value.name,
    requestedByName: user.full_name?.trim() || user.email,
  });
  return NextResponse.json(inserted, { status: 201 });
}

import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import {
  getVenueRequestById,
  listVenueRequests,
  listVenues,
  updateRow,
} from "@/lib/data/courtly-db";
import type { VenueRequest } from "@/lib/types/courtly";
import {
  findPotentialVenueDuplicate,
  normalizeVenueDraftFromBody,
} from "@/lib/venue-requests";
import { deleteVenuePhotos } from "@/lib/supabase/storage";

type Ctx = { params: Promise<{ requestId: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  if (user?.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { requestId } = await ctx.params;
  const current = await getVenueRequestById(requestId);
  if (!current) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (current.requested_by !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  if (
    current.request_status !== "pending" &&
    current.request_status !== "needs_update"
  ) {
    return NextResponse.json(
      { error: "Only pending or update-requested venue requests can be edited." },
      { status: 409 },
    );
  }

  const body = (await req.json()) as Record<string, unknown>;
  const shouldCancel = body.cancel_request === true;
  if (shouldCancel) {
    if (current.photo_urls?.length) {
      void deleteVenuePhotos(current.photo_urls);
    }
    const cancelled = await updateRow<VenueRequest>("venue_requests", requestId, {
      request_status: "cancelled",
      reviewed_by: null,
      reviewed_at: null,
      review_note: null,
      approved_venue_id: null,
    });
    return NextResponse.json(cancelled);
  }

  const parsed = normalizeVenueDraftFromBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const [venues, pendingRequests] = await Promise.all([
    listVenues(),
    listVenueRequests({ statuses: ["pending"] }),
  ]);
  const duplicate = findPotentialVenueDuplicate(parsed.value, venues, pendingRequests, {
    ignoreRequestId: requestId,
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

  const toDelete = (current.photo_urls ?? []).filter(
    (url) => !parsed.value.photo_urls.includes(url),
  );
  if (toDelete.length > 0) {
    void deleteVenuePhotos(toDelete);
  }

  const next = await updateRow<VenueRequest>("venue_requests", requestId, {
    ...parsed.value,
    request_status: "pending",
    reviewed_by: null,
    reviewed_at: null,
    review_note: null,
    approved_venue_id: null,
  });
  return NextResponse.json(next);
}

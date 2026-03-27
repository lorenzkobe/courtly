import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { canMutateVenue } from "@/lib/auth/management";
import {
  deleteRow,
  listBookings,
  listCourts,
  listManagedUsers,
  listVenueAdminAssignments,
  listVenues,
  updateRow,
} from "@/lib/data/courtly-db";
import type { Venue } from "@/lib/types/courtly";

type Ctx = { params: Promise<{ venueId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  const { venueId } = await ctx.params;
  const assignments = await listVenueAdminAssignments();
  const canRead = !!user && canMutateVenue(user, venueId, assignments);
  if (!canRead) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const [venues, courts, managedUsers] = await Promise.all([
    listVenues(),
    listCourts(),
    listManagedUsers(),
  ]);
  const venue = venues.find((row) => row.id === venueId);
  const detail = venue
    ? {
        venue,
        courts: courts.filter((court) => court.venue_id === venueId),
        admins: managedUsers.filter((managedUser) =>
          assignments.some(
            (assignment) =>
              assignment.venue_id === venueId &&
              assignment.admin_user_id === managedUser.id,
          ),
        ),
      }
    : null;
  if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(detail);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  const { venueId } = await ctx.params;
  const assignments = await listVenueAdminAssignments();
  const canWrite = !!user && canMutateVenue(user, venueId, assignments);
  if (!canWrite) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const venues = await listVenues();
  const cur = venues.find((venue) => venue.id === venueId);
  if (!cur) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const patch = (await req.json()) as Partial<Venue> & {
    initial_admin_user_id?: string;
    initial_admin_new?: {
      full_name?: string;
      email?: string;
    };
  };
  if (patch.status === "closed") {
    const [courts, bookings] = await Promise.all([listCourts(), listBookings()]);
    const courtIds = new Set(courts.filter((court) => court.venue_id === venueId).map((court) => court.id));
    const hasConfirmed = bookings.some(
      (booking) => courtIds.has(booking.court_id) && booking.status === "confirmed",
    );
    if (hasConfirmed) {
      return NextResponse.json(
        {
          error:
            "Cannot set this venue inactive while it has confirmed bookings. Cancel or complete those bookings first.",
        },
        { status: 409 },
      );
    }
  }

  const next = await updateRow<Venue>("venues", venueId, patch);
  return NextResponse.json(next);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { venueId } = await ctx.params;
  const [venues, courts, bookings] = await Promise.all([
    listVenues(),
    listCourts(),
    listBookings(),
  ]);
  if (!venues.some((venue) => venue.id === venueId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const venueCourtIds = new Set(courts.filter((court) => court.venue_id === venueId).map((court) => court.id));
  const hasActiveBookings = bookings.some(
    (booking) =>
      venueCourtIds.has(booking.court_id) && booking.status === "confirmed",
  );
  if (hasActiveBookings) {
    return NextResponse.json(
      {
        error:
          "Cannot delete this venue while it has active bookings on its courts. Cancel or complete those bookings first.",
      },
      { status: 409 },
    );
  }

  const linked = courts.some((court) => court.venue_id === venueId);
  if (linked) {
    return NextResponse.json(
      {
        error:
          "Cannot delete a venue that still has courts assigned. Reassign or remove courts first.",
      },
      { status: 409 },
    );
  }

  await deleteRow("venues", venueId);
  return NextResponse.json({ ok: true });
}

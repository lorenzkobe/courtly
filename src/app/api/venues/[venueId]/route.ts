import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { canMutateVenue } from "@/lib/auth/management";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  deleteRow,
  insertRow,
  listBookings,
  listCourts,
  listManagedUsers,
  listVenueAdminAssignments,
  listVenues,
  updateRow,
} from "@/lib/data/courtly-db";
import type { Venue } from "@/lib/types/courtly";
import {
  applyVenueMapCoordsToPatch,
  parseVenueMapCoordsForPatch,
} from "@/lib/venue-map-coords";
import {
  parseRateWindowsFromUnknown,
  validateVenuePriceRanges,
} from "@/lib/venue-price-ranges";

function pickVenuePatch(patch: Record<string, unknown>): Partial<Venue> {
  const keys: (keyof Venue)[] = [
    "name",
    "location",
    "contact_phone",
    "sport",
    "hourly_rate_windows",
    "status",
    "amenities",
    "image_url",
    "map_latitude",
    "map_longitude",
  ];
  const out: Partial<Venue> = {};
  for (const key of keys) {
    if (key in patch && patch[key] !== undefined) {
      (out as Record<string, unknown>)[key as string] = patch[key];
    }
  }
  return out;
}

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

  const patch = (await req.json()) as Record<string, unknown> & {
    initial_admin_user_id?: string;
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

  const mapParse = parseVenueMapCoordsForPatch(patch);
  if (!mapParse.ok) {
    return NextResponse.json({ error: mapParse.error }, { status: 400 });
  }

  const patchSansMap = { ...patch };
  delete patchSansMap.map_latitude;
  delete patchSansMap.map_longitude;

  const venuePatch = pickVenuePatch(patchSansMap) as Partial<Venue>;
  applyVenueMapCoordsToPatch(venuePatch as Record<string, unknown>, mapParse);

  if (venuePatch.hourly_rate_windows !== undefined) {
    const parsed = parseRateWindowsFromUnknown(venuePatch.hourly_rate_windows);
    const check = validateVenuePriceRanges(parsed);
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }
    venuePatch.hourly_rate_windows = parsed;
  }
  const next = await updateRow<Venue>("venues", venueId, venuePatch);

  if (
    user.role === "superadmin" &&
    Object.prototype.hasOwnProperty.call(patch, "initial_admin_user_id")
  ) {
    const rawId =
      typeof patch.initial_admin_user_id === "string"
        ? patch.initial_admin_user_id.trim()
        : "";
    const supabase = await createSupabaseServerClient();
    await supabase.from("venue_admin_assignments").delete().eq("venue_id", venueId);
    if (rawId) {
      const managedUsers = await listManagedUsers();
      const adminUser = managedUsers.find(
        (managedUser) => managedUser.id === rawId && managedUser.role === "admin",
      );
      if (!adminUser) {
        return NextResponse.json(
          { error: "Selected admin was not found or is not a court admin." },
          { status: 404 },
        );
      }
      await insertRow("venue_admin_assignments", {
        venue_id: venueId,
        admin_user_id: rawId,
      });
    }
  }

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

import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import {
  insertRow,
  listManagedUsersByIds,
  listVenues,
} from "@/lib/data/courtly-db";
import type { Venue } from "@/lib/types/courtly";
import { parseVenueMapCoordsForCreate } from "@/lib/venue-map-coords";
import {
  parseRateWindowsFromUnknown,
  validateVenuePriceRanges,
} from "@/lib/venue-price-ranges";
import { normalizeSocialUrl, validateSocialUrl } from "@/lib/social-url";
import { validateVenuePaymentSettings } from "@/lib/venue-payment-methods";

export async function GET() {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const venues = await listVenues();
  return NextResponse.json(venues);
}

export async function POST(req: Request) {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as Partial<Venue> & {
    initial_admin_user_id?: string;
  };
  const bodyRecord = body as Record<string, unknown>;
  const mapCoords = parseVenueMapCoordsForCreate(bodyRecord);
  if (!mapCoords.ok) {
    return NextResponse.json({ error: mapCoords.error }, { status: 400 });
  }
  const existingAdminId =
    typeof body.initial_admin_user_id === "string"
      ? body.initial_admin_user_id.trim()
      : "";
  if (!existingAdminId) {
    return NextResponse.json(
      {
        error:
          "Select an existing court admin. Create admins from Superadmin → Users, then assign the venue to them.",
      },
      { status: 400 },
    );
  }

  const hourly_rate_windows = parseRateWindowsFromUnknown(body.hourly_rate_windows);
  const rangeCheck = validateVenuePriceRanges(hourly_rate_windows);
  if (!rangeCheck.ok) {
    return NextResponse.json({ error: rangeCheck.error }, { status: 400 });
  }

  const facebookUrl = normalizeSocialUrl(body.facebook_url);
  const facebookError = validateSocialUrl(facebookUrl, "facebook");
  if (facebookError) {
    return NextResponse.json({ error: facebookError }, { status: 400 });
  }
  const instagramUrl = normalizeSocialUrl(body.instagram_url);
  const instagramError = validateSocialUrl(instagramUrl, "instagram");
  if (instagramError) {
    return NextResponse.json({ error: instagramError }, { status: 400 });
  }
  const paymentSettings = validateVenuePaymentSettings(body, {
    requireAtLeastOne: true,
  });
  if (!paymentSettings.ok) {
    return NextResponse.json({ error: paymentSettings.error }, { status: 400 });
  }

  const venue: Omit<Venue, "id"> = {
    name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : "New venue",
    location: typeof body.location === "string" ? body.location.trim() : "",
    contact_phone:
      typeof body.contact_phone === "string" ? body.contact_phone.trim() : "",
    facebook_url: facebookUrl,
    instagram_url: instagramUrl,
    sport: body.sport ?? "pickleball",
    hourly_rate_windows,
    status: body.status === "closed" ? "closed" : "active",
    amenities: Array.isArray(body.amenities) ? body.amenities : [],
    image_url: typeof body.image_url === "string" ? body.image_url.trim() : "",
    created_at: new Date().toISOString(),
    accepts_gcash: paymentSettings.value.accepts_gcash,
    gcash_account_name: paymentSettings.value.gcash_account_name,
    gcash_account_number: paymentSettings.value.gcash_account_number,
    accepts_maya: paymentSettings.value.accepts_maya,
    maya_account_name: paymentSettings.value.maya_account_name,
    maya_account_number: paymentSettings.value.maya_account_number,
    ...(mapCoords.mode === "set"
      ? {
          map_latitude: mapCoords.map_latitude,
          map_longitude: mapCoords.map_longitude,
        }
      : {}),
  };
  if (!venue.location || !venue.contact_phone || !venue.image_url) {
    return NextResponse.json(
      { error: "Location, contact number, and image URL are required" },
      { status: 400 },
    );
  }

  const users = await listManagedUsersByIds([existingAdminId]);
  const assignedAdmin = users.find(
    (managedUser) =>
      managedUser.id === existingAdminId && managedUser.role === "admin",
  );
  if (!assignedAdmin) {
    return NextResponse.json(
      { error: "Selected admin was not found or is not a court admin." },
      { status: 404 },
    );
  }
  const assignedAdminId = assignedAdmin.id;

  const inserted = await insertRow("venues", venue);
  if (assignedAdminId) {
    await insertRow("venue_admin_assignments", {
      venue_id: (inserted as { id: string }).id,
      admin_user_id: assignedAdminId,
    });
  }

  return NextResponse.json(inserted);
}

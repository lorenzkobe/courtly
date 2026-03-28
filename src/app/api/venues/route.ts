import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { insertRow, listManagedUsers, listVenues } from "@/lib/data/courtly-db";
import type { Venue } from "@/lib/types/courtly";

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

  const venue: Omit<Venue, "id"> = {
    name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : "New venue",
    location: typeof body.location === "string" ? body.location.trim() : "",
    contact_phone:
      typeof body.contact_phone === "string" ? body.contact_phone.trim() : "",
    sport: body.sport ?? "pickleball",
    hourly_rate: Number(body.hourly_rate) || 0,
    hourly_rate_windows: Array.isArray(body.hourly_rate_windows)
      ? body.hourly_rate_windows
      : [],
    opens_at: typeof body.opens_at === "string" ? body.opens_at : "07:00",
    closes_at: typeof body.closes_at === "string" ? body.closes_at : "22:00",
    status: body.status === "closed" ? "closed" : "active",
    amenities: Array.isArray(body.amenities) ? body.amenities : [],
    image_url: typeof body.image_url === "string" ? body.image_url.trim() : "",
    created_at: new Date().toISOString(),
  };
  if (!venue.location || !venue.contact_phone || !venue.image_url || venue.hourly_rate <= 0) {
    return NextResponse.json(
      { error: "Location, contact number, image URL, and hourly rate are required" },
      { status: 400 },
    );
  }

  const users = await listManagedUsers();
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

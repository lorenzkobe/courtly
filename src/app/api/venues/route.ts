import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { mockDb } from "@/lib/mock/db";
import type { ManagedUser, Venue } from "@/lib/types/courtly";

export async function GET() {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json([...mockDb.venues]);
}

export async function POST(req: Request) {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as Partial<Venue> & {
    initial_admin_user_id?: string;
    initial_admin_new?: {
      full_name?: string;
      email?: string;
    };
  };
  const existingAdminId =
    typeof body.initial_admin_user_id === "string"
      ? body.initial_admin_user_id.trim()
      : "";
  const newAdmin = body.initial_admin_new;
  const wantsNewAdmin = !!newAdmin;
  if (!existingAdminId && !wantsNewAdmin) {
    return NextResponse.json(
      { error: "Initial admin is required when creating an establishment" },
      { status: 400 },
    );
  }

  const id = `venue-${crypto.randomUUID().slice(0, 8)}`;
  const venue: Venue = {
    id,
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

  let assignedAdmin: ManagedUser | undefined;
  if (existingAdminId) {
    assignedAdmin = mockDb.managedUsers.find(
      (managedUser) =>
        managedUser.id === existingAdminId && managedUser.role === "admin",
    );
    if (!assignedAdmin) {
      return NextResponse.json({ error: "Selected admin user was not found" }, { status: 404 });
    }
  } else if (newAdmin) {
    const email =
      typeof newAdmin.email === "string" ? newAdmin.email.trim().toLowerCase() : "";
    const fullName =
      typeof newAdmin.full_name === "string" ? newAdmin.full_name.trim() : "";
    if (!email || !email.includes("@") || !fullName) {
      return NextResponse.json(
        { error: "New admin full name and valid email are required" },
        { status: 400 },
      );
    }
    if (
      mockDb.managedUsers.some(
        (managedUser) => managedUser.email.toLowerCase() === email,
      )
    ) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }
    const adminId = `user-${crypto.randomUUID().slice(0, 8)}`;
    assignedAdmin = {
      id: adminId,
      email,
      full_name: fullName,
      role: "admin",
      is_active: true,
      created_at: new Date().toISOString(),
    };
    mockDb.managedUsers.push(assignedAdmin);
  }

  mockDb.venues.push(venue);

  if (assignedAdmin) {
    mockDb.venueAdminAssignments.push({
      id: `va-${crypto.randomUUID().slice(0, 8)}`,
      venue_id: venue.id,
      admin_user_id: assignedAdmin.id,
      created_at: new Date().toISOString(),
    });
  }

  return NextResponse.json(venue);
}

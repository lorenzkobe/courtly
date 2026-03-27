import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
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

  let assignedAdminId: string | undefined;
  if (existingAdminId) {
    const users = await listManagedUsers();
    const assignedAdmin = users.find(
      (managedUser) =>
        managedUser.id === existingAdminId && managedUser.role === "admin",
    );
    if (!assignedAdmin) {
      return NextResponse.json({ error: "Selected admin user was not found" }, { status: 404 });
    }
    assignedAdminId = assignedAdmin.id;
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
    const admin = createSupabaseAdminClient();
    const created = await admin.auth.admin.createUser({
      email,
      password: crypto.randomUUID(),
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (created.error || !created.data.user) {
      return NextResponse.json({ error: created.error?.message ?? "Could not create admin" }, { status: 400 });
    }
    assignedAdminId = created.data.user.id;
  }

  const inserted = await insertRow("venues", venue);
  if (assignedAdminId) {
    await insertRow("venue_admin_assignments", {
      venue_id: (inserted as { id: string }).id,
      admin_user_id: assignedAdminId,
    });
  }

  return NextResponse.json(inserted);
}

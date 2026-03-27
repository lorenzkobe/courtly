import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { mockDb } from "@/lib/mock/db";
import type { Court, Venue } from "@/lib/types/courtly";

type Ctx = { params: Promise<{ venueId: string }> };

function isAssignedVenueAdmin(userId: string, venueId: string): boolean {
  return mockDb.venueAdminAssignments.some(
    (a) => a.admin_user_id === userId && a.venue_id === venueId,
  );
}

function venueDetail(venueId: string) {
  const venue = mockDb.venues.find((v) => v.id === venueId);
  if (!venue) return null;
  const courts: Court[] = mockDb.courts.filter((c) => c.venue_id === venueId);
  const adminIds = new Set(
    mockDb.venueAdminAssignments
      .filter((a) => a.venue_id === venueId)
      .map((a) => a.admin_user_id),
  );
  const admins = mockDb.managedUsers.filter(
    (u) => u.role === "admin" && adminIds.has(u.id),
  );
  return { venue, courts, admins };
}

export async function GET(_req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  const { venueId } = await ctx.params;
  const canRead =
    user?.role === "superadmin" ||
    (user?.role === "admin" && isAssignedVenueAdmin(user.id, venueId));
  if (!canRead) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const detail = venueDetail(venueId);
  if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(detail);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  const { venueId } = await ctx.params;
  const canWrite =
    user?.role === "superadmin" ||
    (user?.role === "admin" && isAssignedVenueAdmin(user.id, venueId));
  if (!canWrite) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const idx = mockDb.venues.findIndex((a) => a.id === venueId);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const patch = (await req.json()) as Partial<Venue> & {
    initial_admin_user_id?: string;
    initial_admin_new?: {
      full_name?: string;
      email?: string;
    };
  };
  const cur = mockDb.venues[idx];
  const next: Venue = {
    ...cur,
    ...(typeof patch.name === "string" && patch.name.trim()
      ? { name: patch.name.trim() }
      : {}),
    ...(typeof patch.location === "string"
      ? { location: patch.location.trim() }
      : {}),
    ...(typeof patch.contact_phone === "string"
      ? { contact_phone: patch.contact_phone.trim() }
      : {}),
    ...(patch.status === "active" || patch.status === "closed"
      ? { status: patch.status }
      : {}),
    ...(patch.sport ? { sport: patch.sport } : {}),
    ...(typeof patch.hourly_rate === "number" && patch.hourly_rate > 0
      ? { hourly_rate: patch.hourly_rate }
      : {}),
    ...(Array.isArray(patch.hourly_rate_windows)
      ? { hourly_rate_windows: patch.hourly_rate_windows }
      : {}),
    ...(typeof patch.opens_at === "string" ? { opens_at: patch.opens_at } : {}),
    ...(typeof patch.closes_at === "string" ? { closes_at: patch.closes_at } : {}),
    ...(Array.isArray(patch.amenities) ? { amenities: patch.amenities } : {}),
    ...(typeof patch.image_url === "string" ? { image_url: patch.image_url.trim() } : {}),
  };
  mockDb.venues[idx] = next;

  if (user?.role === "superadmin") {
    const existingAdminId =
      typeof patch.initial_admin_user_id === "string"
        ? patch.initial_admin_user_id.trim()
        : "";
    const newAdmin = patch.initial_admin_new;

    if (existingAdminId) {
      const assignedAdmin = mockDb.managedUsers.find(
        (u) => u.id === existingAdminId && u.role === "admin",
      );
      if (!assignedAdmin) {
        return NextResponse.json({ error: "Selected admin user was not found" }, { status: 404 });
      }
      const exists = mockDb.venueAdminAssignments.some(
        (a) => a.venue_id === venueId && a.admin_user_id === assignedAdmin.id,
      );
      if (!exists) {
        mockDb.venueAdminAssignments.push({
          id: `va-${crypto.randomUUID().slice(0, 8)}`,
          venue_id: venueId,
          admin_user_id: assignedAdmin.id,
          created_at: new Date().toISOString(),
        });
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
      let assignedAdmin = mockDb.managedUsers.find(
        (u) => u.email.toLowerCase() === email && u.role === "admin",
      );
      if (!assignedAdmin) {
        if (mockDb.managedUsers.some((u) => u.email.toLowerCase() === email)) {
          return NextResponse.json(
            { error: "Email already belongs to a non-admin account" },
            { status: 409 },
          );
        }
        assignedAdmin = {
          id: `user-${crypto.randomUUID().slice(0, 8)}`,
          email,
          full_name: fullName,
          role: "admin",
          is_active: true,
          created_at: new Date().toISOString(),
        };
        mockDb.managedUsers.push(assignedAdmin);
      }
      const exists = mockDb.venueAdminAssignments.some(
        (a) => a.venue_id === venueId && a.admin_user_id === assignedAdmin.id,
      );
      if (!exists) {
        mockDb.venueAdminAssignments.push({
          id: `va-${crypto.randomUUID().slice(0, 8)}`,
          venue_id: venueId,
          admin_user_id: assignedAdmin.id,
          created_at: new Date().toISOString(),
        });
      }
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
  const idx = mockDb.venues.findIndex((a) => a.id === venueId);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const venueCourtIds = new Set(
    mockDb.courts.filter((c) => c.venue_id === venueId).map((c) => c.id),
  );
  const hasActiveBookings = mockDb.bookings.some(
    (b) => venueCourtIds.has(b.court_id) && b.status === "confirmed",
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

  const linked = mockDb.courts.some((c) => c.venue_id === venueId);
  if (linked) {
    return NextResponse.json(
      {
        error:
          "Cannot delete a venue that still has courts assigned. Reassign or remove courts first.",
      },
      { status: 409 },
    );
  }

  mockDb.venues.splice(idx, 1);
  mockDb.venueAdminAssignments = mockDb.venueAdminAssignments.filter(
    (a) => a.venue_id !== venueId,
  );
  return NextResponse.json({ ok: true });
}

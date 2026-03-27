import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { mockDb } from "@/lib/mock/db";
import type { ManagedUser } from "@/lib/types/courtly";

export async function GET() {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json(
    mockDb.managedUsers.map((u) => ({
      ...u,
      venue_ids:
        u.role === "admin"
          ? mockDb.venueAdminAssignments
              .filter((a) => a.admin_user_id === u.id)
              .map((a) => a.venue_id)
          : [],
    })),
  );
}

export async function POST(req: Request) {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as Partial<ManagedUser> & {
    venue_ids?: string[];
  };
  const id = `user-${crypto.randomUUID().slice(0, 8)}`;
  const role =
    body.role === "admin" || body.role === "superadmin" ? body.role : "user";

  const email =
    typeof body.email === "string" && body.email.includes("@")
      ? body.email.trim().toLowerCase()
      : "";

  if (!email) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }

  if (mockDb.managedUsers.some((u) => u.email.toLowerCase() === email)) {
    return NextResponse.json({ error: "Email already in use" }, { status: 409 });
  }

  const managed: ManagedUser = {
    id,
    email,
    full_name:
      typeof body.full_name === "string" && body.full_name.trim()
        ? body.full_name.trim()
        : "New user",
    role,
    is_active: body.is_active !== false,
    created_at: new Date().toISOString(),
  };
  mockDb.managedUsers.push(managed);
  if (role === "admin" && Array.isArray(body.venue_ids)) {
    for (const venueId of body.venue_ids) {
      if (!mockDb.venues.some((v) => v.id === venueId)) continue;
      mockDb.venueAdminAssignments.push({
        id: `va-${crypto.randomUUID().slice(0, 8)}`,
        venue_id: venueId,
        admin_user_id: managed.id,
        created_at: new Date().toISOString(),
      });
    }
  }
  return NextResponse.json({
    ...managed,
    venue_ids: role === "admin" ? body.venue_ids ?? [] : [],
  });
}

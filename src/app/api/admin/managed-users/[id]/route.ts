import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { mockDb } from "@/lib/mock/db";
import type { ManagedUser } from "@/lib/types/courtly";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const idx = mockDb.managedUsers.findIndex((u) => u.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const patch = (await req.json()) as Partial<ManagedUser> & {
    venue_ids?: string[];
  };
  const cur = mockDb.managedUsers[idx];

  let role = cur.role;
  if (patch.role === "user" || patch.role === "admin" || patch.role === "superadmin") {
    role = patch.role;
  }

  let email = cur.email;
  if (typeof patch.email === "string" && patch.email.includes("@")) {
    const next = patch.email.trim().toLowerCase();
    const taken = mockDb.managedUsers.some(
      (u, i) => i !== idx && u.email.toLowerCase() === next,
    );
    if (taken) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }
    email = next;
  }

  const full_name =
    typeof patch.full_name === "string" && patch.full_name.trim()
      ? patch.full_name.trim()
      : cur.full_name;

  const next: ManagedUser = {
    ...cur,
    email,
    full_name,
    role,
    is_active: typeof patch.is_active === "boolean" ? patch.is_active : cur.is_active,
  };
  mockDb.managedUsers[idx] = next;
  if (Array.isArray(patch.venue_ids) && role === "admin") {
    const allowedVenueIds = new Set(
      patch.venue_ids.filter((venueId) => mockDb.venues.some((v) => v.id === venueId)),
    );
    mockDb.venueAdminAssignments = mockDb.venueAdminAssignments.filter(
      (a) => a.admin_user_id !== id || allowedVenueIds.has(a.venue_id),
    );
    for (const venueId of allowedVenueIds) {
      const exists = mockDb.venueAdminAssignments.some(
        (a) => a.admin_user_id === id && a.venue_id === venueId,
      );
      if (!exists) {
        mockDb.venueAdminAssignments.push({
          id: `va-${crypto.randomUUID().slice(0, 8)}`,
          venue_id: venueId,
          admin_user_id: id,
          created_at: new Date().toISOString(),
        });
      }
    }
  }
  if (role !== "admin") {
    mockDb.venueAdminAssignments = mockDb.venueAdminAssignments.filter(
      (a) => a.admin_user_id !== id,
    );
  }
  return NextResponse.json({
    ...next,
    court_account_id:
      role === "admin"
        ? mockDb.venueAdminAssignments.find((a) => a.admin_user_id === id)?.venue_id ??
          null
        : null,
    venue_ids:
      role === "admin"
        ? mockDb.venueAdminAssignments
            .filter((a) => a.admin_user_id === id)
            .map((a) => a.venue_id)
        : [],
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (id === user.id) {
    return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });
  }
  const idx = mockDb.managedUsers.findIndex((u) => u.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const assignedVenueIds = new Set(
    mockDb.venueAdminAssignments
      .filter((a) => a.admin_user_id === id)
      .map((a) => a.venue_id),
  );
  const referenced = mockDb.courts.some((c) => assignedVenueIds.has(c.venue_id));
  if (referenced) {
    return NextResponse.json(
      {
        error:
          "User still manages one or more venue courts. Reassign venue admins before removing this account.",
      },
      { status: 409 },
    );
  }

  mockDb.venueAdminAssignments = mockDb.venueAdminAssignments.filter(
    (a) => a.admin_user_id !== id,
  );

  mockDb.managedUsers.splice(idx, 1);
  return NextResponse.json({ ok: true });
}

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

  const patch = (await req.json()) as Partial<ManagedUser>;
  const cur = mockDb.managedUsers[idx];

  let role = cur.role;
  if (patch.role === "user" || patch.role === "admin" || patch.role === "superadmin") {
    role = patch.role;
  }

  let court_account_id = cur.court_account_id;
  if (role === "admin") {
    if (patch.court_account_id === null || typeof patch.court_account_id === "string") {
      court_account_id = patch.court_account_id;
    }
  } else {
    court_account_id = null;
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
    court_account_id,
  };
  mockDb.managedUsers[idx] = next;
  return NextResponse.json(next);
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

  const referenced = mockDb.courts.some((c) => c.managed_by_user_id === id);
  if (referenced) {
    return NextResponse.json(
      {
        error:
          "User still manages one or more courts. Reassign courts before removing this account.",
      },
      { status: 409 },
    );
  }

  mockDb.courtAccounts.forEach((a) => {
    if (a.primary_admin_user_id === id) {
      a.primary_admin_user_id = null;
    }
  });

  mockDb.managedUsers.splice(idx, 1);
  return NextResponse.json({ ok: true });
}

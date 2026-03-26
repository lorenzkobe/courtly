import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { mockDb } from "@/lib/mock/db";
import type { Court, CourtAccount } from "@/lib/types/courtly";

type Ctx = { params: Promise<{ id: string }> };

function accountDetail(id: string) {
  const account = mockDb.courtAccounts.find((a) => a.id === id);
  if (!account) return null;
  const courts: Court[] = mockDb.courts.filter((c) => c.court_account_id === id);
  const admins = mockDb.managedUsers.filter(
    (u) => u.role === "admin" && u.court_account_id === id,
  );
  const primaryAdmin = account.primary_admin_user_id
    ? mockDb.managedUsers.find((u) => u.id === account.primary_admin_user_id) ?? null
    : null;
  return { account, courts, primaryAdmin, admins };
}

export async function GET(_req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const detail = accountDetail(id);
  if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(detail);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const idx = mockDb.courtAccounts.findIndex((a) => a.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const patch = (await req.json()) as Partial<CourtAccount>;
  const cur = mockDb.courtAccounts[idx];
  const next: CourtAccount = {
    ...cur,
    ...(typeof patch.name === "string" && patch.name.trim()
      ? { name: patch.name.trim() }
      : {}),
    ...(typeof patch.contact_email === "string"
      ? { contact_email: patch.contact_email.trim() }
      : {}),
    ...(patch.status === "active" || patch.status === "suspended"
      ? { status: patch.status }
      : {}),
    ...(patch.primary_admin_user_id === null ||
    typeof patch.primary_admin_user_id === "string"
      ? { primary_admin_user_id: patch.primary_admin_user_id }
      : {}),
    ...(typeof patch.notes === "string" ? { notes: patch.notes } : {}),
  };
  mockDb.courtAccounts[idx] = next;
  return NextResponse.json(next);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const idx = mockDb.courtAccounts.findIndex((a) => a.id === id);
  if (idx === -1) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const linked = mockDb.courts.some((c) => c.court_account_id === id);
  if (linked) {
    return NextResponse.json(
      {
        error:
          "Cannot delete an account that still has courts assigned. Reassign or remove courts first.",
      },
      { status: 409 },
    );
  }

  mockDb.courtAccounts.splice(idx, 1);
  return NextResponse.json({ ok: true });
}

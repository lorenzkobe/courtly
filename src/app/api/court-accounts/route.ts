import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { mockDb } from "@/lib/mock/db";
import type { CourtAccount } from "@/lib/types/courtly";

export async function GET() {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json([...mockDb.courtAccounts]);
}

export async function POST(req: Request) {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as Partial<CourtAccount>;
  const id = `acct-${crypto.randomUUID().slice(0, 8)}`;
  const account: CourtAccount = {
    id,
    name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : "New court account",
    contact_email:
      typeof body.contact_email === "string" ? body.contact_email.trim() : "",
    status: body.status === "suspended" ? "suspended" : "active",
    primary_admin_user_id:
      typeof body.primary_admin_user_id === "string"
        ? body.primary_admin_user_id
        : null,
    notes: typeof body.notes === "string" ? body.notes : undefined,
    created_at: new Date().toISOString(),
  };
  mockDb.courtAccounts.push(account);
  return NextResponse.json(account);
}

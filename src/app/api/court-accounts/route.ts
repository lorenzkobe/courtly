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

  const body = (await req.json()) as Partial<CourtAccount> & {
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

  const id = `acct-${crypto.randomUUID().slice(0, 8)}`;
  const account: CourtAccount = {
    id,
    name: typeof body.name === "string" && body.name.trim() ? body.name.trim() : "New court account",
    contact_email:
      typeof body.contact_email === "string" ? body.contact_email.trim() : "",
    status: body.status === "suspended" ? "suspended" : "active",
    primary_admin_user_id: null,
    notes: typeof body.notes === "string" ? body.notes : undefined,
    created_at: new Date().toISOString(),
  };
  if (!account.contact_email) {
    return NextResponse.json({ error: "Contact email is required" }, { status: 400 });
  }

  if (existingAdminId) {
    const existingAdmin = mockDb.managedUsers.find(
      (u) => u.id === existingAdminId && u.role === "admin",
    );
    if (!existingAdmin) {
      return NextResponse.json({ error: "Selected admin user was not found" }, { status: 404 });
    }
    account.primary_admin_user_id = existingAdmin.id;
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
    if (mockDb.managedUsers.some((u) => u.email.toLowerCase() === email)) {
      return NextResponse.json({ error: "Email already in use" }, { status: 409 });
    }
    const adminId = `user-${crypto.randomUUID().slice(0, 8)}`;
    mockDb.managedUsers.push({
      id: adminId,
      email,
      full_name: fullName,
      role: "admin",
      court_account_id: account.id,
      created_at: new Date().toISOString(),
    });
    account.primary_admin_user_id = adminId;
  }

  mockDb.courtAccounts.push(account);

  if (existingAdminId) {
    const mu = mockDb.managedUsers.find((u) => u.id === existingAdminId);
    if (mu && mu.role === "admin") {
      mu.court_account_id = account.id;
    }
  }

  return NextResponse.json(account);
}

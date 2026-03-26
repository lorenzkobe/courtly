import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { mockDb } from "@/lib/mock/db";
import type { ManagedUser } from "@/lib/types/courtly";

export async function GET() {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json([...mockDb.managedUsers]);
}

export async function POST(req: Request) {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as Partial<ManagedUser>;
  const id = `user-${crypto.randomUUID().slice(0, 8)}`;
  const role =
    body.role === "admin" || body.role === "superadmin" ? body.role : "user";

  let court_account_id: string | null = null;
  if (role === "admin") {
    court_account_id =
      typeof body.court_account_id === "string" ? body.court_account_id : null;
  }

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
    court_account_id,
    created_at: new Date().toISOString(),
  };
  mockDb.managedUsers.push(managed);
  return NextResponse.json(managed);
}

import { NextResponse } from "next/server";
import { readSessionUser, SESSION_COOKIE } from "@/lib/auth/cookie-session";
import { mockDb } from "@/lib/mock/db";
import type { SessionUser } from "@/lib/types/courtly";

function userForRole(role: SessionUser["role"]): SessionUser | null {
  const managed = mockDb.managedUsers.find(
    (managedUser) => managedUser.role === role,
  );
  if (!managed) return null;
  return {
    id: managed.id,
    email: managed.email,
    full_name: managed.full_name,
    role: managed.role,
    is_active: managed.is_active,
  };
}

export async function POST(req: Request) {
  const existing = await readSessionUser();
  if (existing) {
    return NextResponse.json({ user: existing });
  }

  let role: SessionUser["role"] = "user";
  try {
    const body = await req.json();
    if (body?.role === "admin") role = "admin";
    if (body?.role === "superadmin") role = "superadmin";
  } catch {
    /* empty body */
  }

  const user = userForRole(role);
  if (!user || user.is_active === false) {
    return NextResponse.json(
      { error: "This account is inactive and cannot log in." },
      { status: 403 },
    );
  }

  const res = NextResponse.json({ user });
  res.cookies.set(SESSION_COOKIE, JSON.stringify(user), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}

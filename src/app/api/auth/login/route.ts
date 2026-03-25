import { NextResponse } from "next/server";
import { readSessionUser, SESSION_COOKIE } from "@/lib/auth/cookie-session";
import type { SessionUser } from "@/lib/types/courtly";

function userForRole(role: SessionUser["role"]): SessionUser {
  switch (role) {
    case "admin":
      return {
        id: "user-admin-1",
        email: "admin@courtly.dev",
        full_name: "Court Admin",
        role: "admin",
      };
    case "superadmin":
      return {
        id: "user-superadmin-1",
        email: "superadmin@courtly.dev",
        full_name: "Platform Superadmin",
        role: "superadmin",
      };
    default:
      return {
        id: "user-player-1",
        email: "player@courtly.dev",
        full_name: "Alex Player",
        role: "user",
      };
  }
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

  const res = NextResponse.json({ user });
  res.cookies.set(SESSION_COOKIE, JSON.stringify(user), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}

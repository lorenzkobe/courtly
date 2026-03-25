import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";

export async function GET() {
  const user = await readSessionUser();
  return NextResponse.json({ user });
}

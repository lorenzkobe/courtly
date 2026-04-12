import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { listVenues } from "@/lib/data/courtly-db";

export async function GET() {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const venues = await listVenues();
  return NextResponse.json(venues);
}

export async function POST(req: Request) {
  void req;
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json(
    {
      error:
        "Direct venue creation has moved to admin-submitted venue requests. Review and approve requests from Superadmin → Venues.",
    },
    { status: 410 },
  );
}

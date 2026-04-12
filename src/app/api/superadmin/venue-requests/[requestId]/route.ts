import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { deleteRow, getVenueRequestById } from "@/lib/data/courtly-db";

type Ctx = { params: Promise<{ requestId: string }> };

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { requestId } = await ctx.params;
  const current = await getVenueRequestById(requestId);
  if (!current) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await deleteRow("venue_requests", requestId);
  return NextResponse.json({ ok: true });
}

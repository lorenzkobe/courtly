import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { isSuperadmin } from "@/lib/auth/management";
import { mockDb } from "@/lib/mock/db";

export async function GET() {
  const user = await readSessionUser();
  if (!user || !isSuperadmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const flagged = mockDb.courtReviews
    .filter((r) => r.flagged)
    .map((r) => {
      const court = mockDb.courts.find((c) => c.id === r.court_id);
      return {
        ...r,
        court_name: court?.name ?? r.court_id,
      };
    })
    .sort((a, b) =>
      String(b.flagged_at ?? "").localeCompare(String(a.flagged_at ?? "")),
    );

  return NextResponse.json({ reviews: flagged });
}

import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import {
  getApplicableTermsForAdmin,
  recordAdminAcceptance,
} from "@/lib/data/courtly-db";

export async function POST() {
  const user = await readSessionUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const applicable = await getApplicableTermsForAdmin(user.id);
  if (!applicable) {
    return NextResponse.json(
      { error: "No Terms & Conditions are currently applicable to you." },
      { status: 400 },
    );
  }
  await recordAdminAcceptance({
    adminId: user.id,
    versionId: applicable.id,
    status: "rejected",
  });
  return NextResponse.json({ ok: true });
}

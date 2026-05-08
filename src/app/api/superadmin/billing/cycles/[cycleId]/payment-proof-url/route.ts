import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { getBillingCycleById } from "@/lib/data/courtly-db";
import { createPaymentProofSignedUrl } from "@/lib/supabase/storage";

type Ctx = { params: Promise<{ cycleId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { cycleId } = await ctx.params;
  const cycle = await getBillingCycleById(cycleId);
  if (!cycle) {
    return NextResponse.json({ error: "Billing cycle not found." }, { status: 404 });
  }
  if (!cycle.payment_proof_url) {
    return NextResponse.json({ error: "No proof uploaded." }, { status: 404 });
  }

  const url = await createPaymentProofSignedUrl(cycle.payment_proof_url, 3600);
  return NextResponse.json({ url });
}

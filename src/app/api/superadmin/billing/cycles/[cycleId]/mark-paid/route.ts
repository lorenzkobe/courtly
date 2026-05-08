import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { getBillingCycleById, markBillingCyclePaid } from "@/lib/data/courtly-db";

type Ctx = { params: Promise<{ cycleId: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { cycleId } = await ctx.params;
  const cycle = await getBillingCycleById(cycleId);
  if (!cycle) {
    return NextResponse.json({ error: "Billing cycle not found." }, { status: 404 });
  }
  if (cycle.status === "paid") {
    return NextResponse.json({ error: "Billing cycle is already paid." }, { status: 409 });
  }

  await markBillingCyclePaid(cycleId, user.id);

  return NextResponse.json({ ok: true });
}

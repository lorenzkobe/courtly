import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

const PLATFORM_BOOKING_FEE_KEY = "booking_fee_default";

export async function GET() {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("platform_settings")
    .select("value")
    .eq("key", PLATFORM_BOOKING_FEE_KEY)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: "Could not load booking fee setting" }, { status: 500 });
  }
  return NextResponse.json({
    default_booking_fee: Number((data?.value as { amount?: unknown } | undefined)?.amount ?? 0),
  });
}

export async function PATCH(req: Request) {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json()) as { default_booking_fee?: number };
  const amount = Number(body.default_booking_fee);
  if (!Number.isFinite(amount) || amount < 0) {
    return NextResponse.json({ error: "default_booking_fee must be a non-negative number" }, { status: 400 });
  }
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("platform_settings").upsert({
    key: PLATFORM_BOOKING_FEE_KEY,
    value: { amount },
    updated_at: new Date().toISOString(),
  });
  if (error) {
    return NextResponse.json({ error: "Could not save booking fee setting" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, default_booking_fee: amount });
}

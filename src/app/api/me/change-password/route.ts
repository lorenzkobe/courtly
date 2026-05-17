import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabasePublicEnv } from "@/lib/supabase/env";
import { isPasswordPolicySatisfied } from "@/lib/validation/password";

export async function POST(req: Request) {
  let currentPassword = "";
  let newPassword = "";
  let confirmPassword = "";

  try {
    const body = await req.json();
    currentPassword =
      typeof body?.currentPassword === "string" ? body.currentPassword : "";
    newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
    confirmPassword =
      typeof body?.confirmPassword === "string" ? body.confirmPassword : "";
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!currentPassword || !newPassword || !confirmPassword) {
    return NextResponse.json(
      { error: "Current password, new password, and confirmation are required." },
      { status: 400 },
    );
  }

  if (!isPasswordPolicySatisfied(newPassword)) {
    return NextResponse.json(
      {
        error:
          "New password must be at least 8 characters and include uppercase, lowercase, number, and symbol.",
      },
      { status: 400 },
    );
  }

  if (newPassword !== confirmPassword) {
    return NextResponse.json(
      { error: "New password and confirmation must match." },
      { status: 400 },
    );
  }

  if (newPassword === currentPassword) {
    return NextResponse.json(
      { error: "New password must be different from the current password." },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { url, anonKey } = getSupabasePublicEnv();
  const verifier = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: verifyError } = await verifier.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });
  if (verifyError) {
    return NextResponse.json(
      { error: "Current password is incorrect." },
      { status: 400 },
    );
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: newPassword,
  });
  if (updateError) {
    return NextResponse.json(
      { error: updateError.message || "Could not update password. Try again." },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}

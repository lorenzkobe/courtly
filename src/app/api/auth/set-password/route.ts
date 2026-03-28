import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isPasswordPolicySatisfied } from "@/lib/validation/password";

export async function POST(req: Request) {
  let password = "";
  let confirmPassword = "";

  try {
    const body = await req.json();
    password = typeof body?.password === "string" ? body.password : "";
    confirmPassword =
      typeof body?.confirmPassword === "string" ? body.confirmPassword : "";
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!password || !confirmPassword) {
    return NextResponse.json(
      { error: "Password and confirm password are required." },
      { status: 400 },
    );
  }

  if (!isPasswordPolicySatisfied(password)) {
    return NextResponse.json(
      {
        error:
          "Password must be at least 8 characters and include uppercase, lowercase, number, and symbol.",
      },
      { status: 400 },
    );
  }

  if (password !== confirmPassword) {
    return NextResponse.json(
      { error: "Password and confirm password must match." },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { error: "You need to be signed in. Open the link from your email again." },
      { status: 401 },
    );
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    return NextResponse.json(
      { error: error.message || "Could not update password. Try again." },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true });
}

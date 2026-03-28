import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { authCallbackUrl } from "@/lib/supabase/app-url";
import { EMAIL_REGEX } from "@/lib/validation/person-fields";

export async function POST(req: Request) {
  let email = "";

  try {
    const body = await req.json();
    email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!email || !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }

  const base = authCallbackUrl();
  if (!base) {
    return NextResponse.json(
      { error: "Server is missing a public app URL (NEXT_PUBLIC_APP_URL)." },
      { status: 500 },
    );
  }

  const redirectTo = `${base}?next=${encodeURIComponent("/auth/set-password")}`;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

  if (error) {
    return NextResponse.json(
      { error: error.message || "Could not send reset email. Try again later." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    ok: true,
    message: "If an account exists for that email, we sent a link to reset your password.",
  });
}

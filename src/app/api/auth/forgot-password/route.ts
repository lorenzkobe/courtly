import { NextResponse } from "next/server";
import { createSupabaseResetClient } from "@/lib/supabase/auth-reset";
import { authCallbackUrl } from "@/lib/supabase/app-url";
import { EMAIL_REGEX } from "@/lib/validation/person-fields";

const GENERIC_DONE_MESSAGE =
  "If an account exists for that email, we sent a link to reset your password.";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { email?: unknown } | null;
  const raw = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_REGEX.test(raw)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  const base = authCallbackUrl();
  const redirectTo = base
    ? `${base}?next=${encodeURIComponent("/auth/set-password")}`
    : undefined;

  const supabase = createSupabaseResetClient();
  // Intentionally ignore the result — never reveal whether the email exists.
  await supabase.auth.resetPasswordForEmail(
    raw,
    redirectTo ? { redirectTo } : undefined,
  );

  return NextResponse.json({ ok: true, message: GENERIC_DONE_MESSAGE });
}

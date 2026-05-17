import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { authCallbackUrl } from "@/lib/supabase/app-url";

type Ctx = { params: Promise<{ id: string }> };

function resetRedirectTo() {
  const base = authCallbackUrl();
  return base
    ? `${base}?next=${encodeURIComponent("/auth/set-password")}`
    : undefined;
}

export async function POST(_req: Request, ctx: Ctx) {
  const session = await readSessionUser();
  if (session?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const admin = createSupabaseAdminClient();
  const { data: authData, error: getErr } = await admin.auth.admin.getUserById(id);
  if (getErr || !authData.user?.email) {
    return NextResponse.json(
      { error: getErr?.message ?? "User not found" },
      { status: 404 },
    );
  }

  const email = authData.user.email;
  const redirectTo = resetRedirectTo();

  const resetRes = await admin.auth.resetPasswordForEmail(
    email,
    redirectTo ? { redirectTo } : undefined,
  );

  if (!resetRes.error) {
    return NextResponse.json({
      emailed: true,
      message: "Password reset email sent.",
    });
  }

  const linkRes = await admin.auth.admin.generateLink({
    type: "recovery",
    email,
    options: redirectTo ? { redirectTo } : undefined,
  });

  if (linkRes.error || !linkRes.data?.properties?.action_link) {
    return NextResponse.json(
      {
        error:
          linkRes.error?.message ??
          resetRes.error.message ??
          "Could not send password reset email.",
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    emailed: false,
    action_link: linkRes.data.properties.action_link,
    message:
      "We couldn't send a password reset email automatically. Copy the link below and send it to the user.",
  });
}

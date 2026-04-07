import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { authCallbackUrl } from "@/lib/supabase/app-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { buildFullName } from "@/lib/validation/person-fields";

type Ctx = { params: Promise<{ id: string }> };

function inviteRedirectTo() {
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

  const authUser = authData.user;
  const email = authUser.email!;
  if (authUser.email_confirmed_at) {
    return NextResponse.json(
      { error: "This user has already completed email confirmation and can sign in." },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, first_name, last_name, birthdate, mobile_number")
    .eq("id", id)
    .maybeSingle();

  const row = profile as {
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
    birthdate: string | null;
    mobile_number: string | null;
  } | null;

  const firstName = (row?.first_name ?? "").trim();
  const lastName = (row?.last_name ?? "").trim();
  const fullName =
    firstName && lastName
      ? buildFullName(firstName, lastName)
      : (row?.full_name ?? "").trim() || (authUser.user_metadata?.full_name as string) || "";

  const redirectTo = inviteRedirectTo();
  const metadata = {
    full_name: fullName || firstName || email.split("@")[0]!,
    ...(firstName ? { first_name: firstName } : {}),
    ...(lastName ? { last_name: lastName } : {}),
    ...(row?.birthdate ? { birthdate: String(row.birthdate).slice(0, 10) } : {}),
    ...(row?.mobile_number ? { mobile_number: row.mobile_number } : {}),
  };

  const inviteRes = await admin.auth.admin.inviteUserByEmail(email, {
    data: metadata,
    ...(redirectTo ? { redirectTo } : {}),
  });

  if (!inviteRes.error) {
    return NextResponse.json({
      emailed: true,
      message: "Invitation sent.",
    });
  }

  const linkRes = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: redirectTo ? { redirectTo } : undefined,
  });

  if (linkRes.error || !linkRes.data?.properties?.action_link) {
    return NextResponse.json(
      {
        error:
          linkRes.error?.message ??
          inviteRes.error.message ??
          "Could not resend invitation.",
      },
      { status: 400 },
    );
  }

  return NextResponse.json({
    emailed: false,
    action_link: linkRes.data.properties.action_link,
    message:
      "We couldn't send another invitation email automatically. Copy the link below and send it to the user.",
  });
}

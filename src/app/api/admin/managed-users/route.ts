import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import {
  invalidateAuthSummaryCache,
  listManagedUsersForDirectory,
} from "@/lib/data/courtly-db";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { authCallbackUrl } from "@/lib/supabase/app-url";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ManagedUser } from "@/lib/types/courtly";
import {
  buildFullName,
  EMAIL_REGEX,
  isValidBirthdateIso,
  isValidPersonName,
  PH_MOBILE_REGEX,
} from "@/lib/validation/person-fields";

export async function GET() {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const users = await listManagedUsersForDirectory();
    return NextResponse.json(users);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not load directory.";
    console.error("[managed-users GET] failed:", err);
    return NextResponse.json(
      {
        error:
          "Could not list users (check SUPABASE_SERVICE_ROLE_KEY and project settings).",
        detail: message,
      },
      { status: 502 },
    );
  }
}

export async function POST(req: Request) {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as Partial<ManagedUser> & {
    venue_ids?: string[];
    firstName?: string;
    lastName?: string;
    birthdate?: string;
    mobileNumber?: string;
  };
  const supabase = await createSupabaseServerClient();
  const supabaseAdmin = createSupabaseAdminClient();
  const role =
    body.role === "admin" || body.role === "superadmin" ? body.role : "user";

  const email =
    typeof body.email === "string" && EMAIL_REGEX.test(body.email.trim().toLowerCase())
      ? body.email.trim().toLowerCase()
      : "";

  const firstName =
    typeof body.firstName === "string" ? body.firstName.trim() : "";
  const lastName = typeof body.lastName === "string" ? body.lastName.trim() : "";
  const birthdate = typeof body.birthdate === "string" ? body.birthdate.trim() : "";
  const mobileNumber =
    typeof body.mobileNumber === "string" ? body.mobileNumber.trim() : "";

  if (!email) {
    return NextResponse.json({ error: "Please enter a valid email address." }, { status: 400 });
  }
  if (!isValidPersonName(firstName) || !isValidPersonName(lastName)) {
    return NextResponse.json(
      {
        error:
          "First name and last name must have at least 2 letters and may include spaces.",
      },
      { status: 400 },
    );
  }
  if (!isValidBirthdateIso(birthdate)) {
    return NextResponse.json(
      { error: "Please provide a valid birthdate." },
      { status: 400 },
    );
  }
  if (!PH_MOBILE_REGEX.test(mobileNumber)) {
    return NextResponse.json(
      {
        error:
          "Please provide a valid Philippine mobile number (e.g. 09171234567 or +639171234567).",
      },
      { status: 400 },
    );
  }

  const fullName = buildFullName(firstName, lastName);
  const redirectTo = authCallbackUrl();
  const inviteOptions: {
    data?: Record<string, unknown>;
    redirectTo?: string;
  } = {
    data: {
      full_name: fullName,
      first_name: firstName,
      last_name: lastName,
      birthdate,
      mobile_number: mobileNumber,
    },
  };
  if (redirectTo) {
    inviteOptions.redirectTo = `${redirectTo}?next=${encodeURIComponent("/auth/set-password")}`;
  }

  const inviteRes = await supabaseAdmin.auth.admin.inviteUserByEmail(
    email,
    inviteOptions,
  );
  if (inviteRes.error || !inviteRes.data.user) {
    return NextResponse.json(
      { error: inviteRes.error?.message ?? "Could not invite user" },
      { status: 400 },
    );
  }
  const id = inviteRes.data.user.id;

  await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      first_name: firstName,
      last_name: lastName,
      birthdate,
      mobile_number: mobileNumber,
      role,
      is_active: body.is_active !== false,
    })
    .eq("id", id);

  if (role === "admin" && Array.isArray(body.venue_ids) && body.venue_ids.length > 0) {
    await supabase
      .from("venue_admin_assignments")
      .insert(
        body.venue_ids.map((venueId) => ({
          venue_id: venueId,
          admin_user_id: id,
        })),
      );
  }
  invalidateAuthSummaryCache();
  return NextResponse.json({
    id,
    email,
    full_name: fullName,
    first_name: firstName,
    last_name: lastName,
    birthdate,
    mobile_number: mobileNumber,
    role,
    is_active: body.is_active !== false,
    created_at: new Date().toISOString(),
    venue_ids: role === "admin" ? body.venue_ids ?? [] : [],
    invite_sent: true,
  });
}

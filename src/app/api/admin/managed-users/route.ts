import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
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

type AuthListSummary = {
  email: string;
  email_confirmed_at: string | null;
};

async function listAuthSummariesById(): Promise<Map<string, AuthListSummary>> {
  const admin = createSupabaseAdminClient();
  const map = new Map<string, AuthListSummary>();
  let page = 1;
  const perPage = 200;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    for (const u of data.users) {
      if (u.id && u.email) {
        map.set(u.id, {
          email: u.email,
          email_confirmed_at: u.email_confirmed_at ?? null,
        });
      }
    }
    if (data.users.length < perPage) break;
    page += 1;
  }
  return map;
}

export async function GET() {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = await createSupabaseServerClient();

  let authById: Map<string, AuthListSummary>;
  try {
    authById = await listAuthSummariesById();
  } catch (e) {
    const message =
      e instanceof Error ? e.message : "Could not load auth directory from Supabase.";
    console.error("[managed-users GET] listAuthSummariesById failed:", e);
    return NextResponse.json(
      {
        error:
          "Could not list users from authentication (check SUPABASE_SERVICE_ROLE_KEY and project settings).",
        detail: message,
      },
      { status: 502 },
    );
  }

  const { data: users, error: profilesError } = await supabase
    .from("profiles")
    .select(
      "id, full_name, first_name, last_name, birthdate, mobile_number, role, is_active, created_at",
    );
  if (profilesError) {
    console.error("[managed-users GET] profiles select:", profilesError);
    return NextResponse.json(
      { error: profilesError.message || "Could not load profiles." },
      { status: 500 },
    );
  }

  const { data: assignments, error: assignmentsError } = await supabase
    .from("venue_admin_assignments")
    .select("venue_id, admin_user_id");
  if (assignmentsError) {
    console.error("[managed-users GET] venue_admin_assignments select:", assignmentsError);
    return NextResponse.json(
      { error: assignmentsError.message || "Could not load venue assignments." },
      { status: 500 },
    );
  }

  return NextResponse.json(
    (users ?? []).map((managedUser: { id: string; role: string }) => ({
      ...managedUser,
      email: authById.get(managedUser.id)?.email ?? "",
      email_confirmed_at: authById.get(managedUser.id)?.email_confirmed_at ?? null,
      venue_ids:
        managedUser.role === "admin"
          ? (assignments ?? [])
              .filter(
                (assignment: { admin_user_id: string }) =>
                  assignment.admin_user_id === managedUser.id,
              )
              .map((assignment: { venue_id: string }) => assignment.venue_id)
          : [],
    })),
  );
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

  if (role === "admin" && Array.isArray(body.venue_ids)) {
    for (const venueId of body.venue_ids) {
      await supabase.from("venue_admin_assignments").insert({
        venue_id: venueId,
        admin_user_id: id,
      });
    }
  }
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

import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ManagedUser } from "@/lib/types/courtly";
import {
  buildFullName,
  EMAIL_REGEX,
  isValidBirthdateIso,
  isValidPersonName,
  PH_MOBILE_REGEX,
} from "@/lib/validation/person-fields";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const supabase = await createSupabaseServerClient();
  const { data: cur } = await supabase
    .from("profiles")
    .select(
      "id, full_name, first_name, last_name, birthdate, mobile_number, role, is_active, created_at",
    )
    .eq("id", id)
    .maybeSingle();
  if (!cur) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const current = cur as {
    id: string;
    full_name: string;
    first_name: string | null;
    last_name: string | null;
    birthdate: string | null;
    mobile_number: string | null;
    role: ManagedUser["role"];
    is_active: boolean;
    created_at: string;
  };
  const { data: currentAssignments } = await supabase
    .from("venue_admin_assignments")
    .select("venue_id")
    .eq("admin_user_id", id);

  const patch = (await req.json()) as Partial<ManagedUser> & {
    venue_ids?: string[];
    firstName?: string;
    lastName?: string;
    birthdate?: string;
    mobileNumber?: string;
  };

  const adminClient = createSupabaseAdminClient();

  let role = current.role;
  if (patch.role === "user" || patch.role === "admin" || patch.role === "superadmin") {
    role = patch.role;
  }

  const firstName =
    typeof patch.firstName === "string"
      ? patch.firstName.trim()
      : (current.first_name ?? "").trim();
  const lastName =
    typeof patch.lastName === "string"
      ? patch.lastName.trim()
      : (current.last_name ?? "").trim();
  const birthdate =
    typeof patch.birthdate === "string"
      ? patch.birthdate.trim()
      : current.birthdate
        ? String(current.birthdate).slice(0, 10)
        : "";
  const mobileNumber =
    typeof patch.mobileNumber === "string"
      ? patch.mobileNumber.trim()
      : (current.mobile_number ?? "").trim();

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

  await supabase
    .from("profiles")
    .update({
      full_name: fullName,
      first_name: firstName,
      last_name: lastName,
      birthdate,
      mobile_number: mobileNumber,
      role,
      is_active: typeof patch.is_active === "boolean" ? patch.is_active : current.is_active,
    })
    .eq("id", id);

  if (typeof patch.email === "string" && EMAIL_REGEX.test(patch.email.trim().toLowerCase())) {
    await adminClient.auth.admin.updateUserById(id, {
      email: patch.email.trim().toLowerCase(),
    });
  }

  const { data: authUser } = await adminClient.auth.admin.getUserById(id);
  const email = authUser.user?.email ?? "";

  const { data: next } = await supabase
    .from("profiles")
    .select(
      "id, full_name, first_name, last_name, birthdate, mobile_number, role, is_active, created_at",
    )
    .eq("id", id)
    .single();
  if (Array.isArray(patch.venue_ids) && role === "admin") {
    const allowedVenueIds = new Set(patch.venue_ids);
    await supabase.from("venue_admin_assignments").delete().eq("admin_user_id", id);
    for (const venueId of allowedVenueIds) {
      await supabase.from("venue_admin_assignments").insert({
        venue_id: venueId,
        admin_user_id: id,
      });
    }
  }
  if (role !== "admin") {
    await supabase.from("venue_admin_assignments").delete().eq("admin_user_id", id);
  }
  const { data: assignments } = await supabase
    .from("venue_admin_assignments")
    .select("venue_id")
    .eq("admin_user_id", id);
  const nextVenueIds =
    role === "admin"
      ? (assignments ?? []).map((assignment: { venue_id: string }) => assignment.venue_id)
      : [];
  const changedFields: Record<string, { before: unknown; after: unknown }> = {};
  const setDiff = (field: string, before: unknown, after: unknown) => {
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    changedFields[field] = { before, after };
  };
  setDiff("first_name", current.first_name ?? "", firstName);
  setDiff("last_name", current.last_name ?? "", lastName);
  setDiff("birthdate", current.birthdate ? String(current.birthdate).slice(0, 10) : "", birthdate);
  setDiff("mobile_number", current.mobile_number ?? "", mobileNumber);
  setDiff("role", current.role, role);
  setDiff(
    "is_active",
    current.is_active,
    typeof patch.is_active === "boolean" ? patch.is_active : current.is_active,
  );
  const previousVenueIds = (currentAssignments ?? []).map(
    (assignment: { venue_id: string }) => assignment.venue_id,
  );
  setDiff("venue_ids", previousVenueIds, nextVenueIds);
  if (Object.keys(changedFields).length > 0) {
    await supabase.from("user_change_audits").insert({
      actor_user_id: user.id,
      target_user_id: id,
      changed_fields: changedFields,
    });
  }
  return NextResponse.json({
    ...next,
    email,
    venue_ids: nextVenueIds,
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (id === user.id) {
    return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });
  }
  const supabase = await createSupabaseServerClient();
  await supabase.from("venue_admin_assignments").delete().eq("admin_user_id", id);
  const admin = createSupabaseAdminClient();
  await admin.auth.admin.deleteUser(id);
  return NextResponse.json({ ok: true });
}

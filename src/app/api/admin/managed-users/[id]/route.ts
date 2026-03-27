import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ManagedUser } from "@/lib/types/courtly";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const supabase = (await createSupabaseServerClient()) as any;
  const { data: cur } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!cur) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const current = cur as {
    id: string;
    full_name: string;
    role: ManagedUser["role"];
    is_active: boolean;
    created_at: string;
  };

  const patch = (await req.json()) as Partial<ManagedUser> & {
    venue_ids?: string[];
  };
  let role = current.role;
  if (patch.role === "user" || patch.role === "admin" || patch.role === "superadmin") {
    role = patch.role;
  }

  const full_name =
    typeof patch.full_name === "string" && patch.full_name.trim()
      ? patch.full_name.trim()
      : current.full_name;

  await supabase.from("profiles").update({
    full_name,
    role,
    is_active: typeof patch.is_active === "boolean" ? patch.is_active : current.is_active,
  }).eq("id", id);

  if (typeof patch.email === "string" && patch.email.includes("@")) {
    const admin = createSupabaseAdminClient();
    await admin.auth.admin.updateUserById(id, { email: patch.email.trim().toLowerCase() });
  }

  const { data: next } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active, created_at")
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
  return NextResponse.json({
    ...next,
    email: "",
    venue_ids:
      role === "admin"
        ? (assignments ?? []).map((assignment: { venue_id: string }) => assignment.venue_id)
        : [],
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
  const supabase = (await createSupabaseServerClient()) as any;
  await supabase.from("venue_admin_assignments").delete().eq("admin_user_id", id);
  const admin = createSupabaseAdminClient();
  await admin.auth.admin.deleteUser(id);
  return NextResponse.json({ ok: true });
}

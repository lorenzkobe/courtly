import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { ManagedUser } from "@/lib/types/courtly";

export async function GET() {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const supabase = (await createSupabaseServerClient()) as any;
  const [{ data: users }, { data: assignments }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, role, is_active, created_at"),
    supabase.from("venue_admin_assignments").select("venue_id, admin_user_id"),
  ]);
  return NextResponse.json(
    (users ?? []).map((managedUser: { id: string; role: string }) => ({
      ...managedUser,
      email: "",
      venue_ids:
        managedUser.role === "admin"
          ? (assignments ?? [])
              .filter((assignment: { admin_user_id: string }) => assignment.admin_user_id === managedUser.id)
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
  };
  const supabaseAdmin = createSupabaseAdminClient();
  const supabase = (await createSupabaseServerClient()) as any;
  const role =
    body.role === "admin" || body.role === "superadmin" ? body.role : "user";

  const email =
    typeof body.email === "string" && body.email.includes("@")
      ? body.email.trim().toLowerCase()
      : "";

  if (!email) {
    return NextResponse.json({ error: "Valid email is required" }, { status: 400 });
  }

  const full_name =
    typeof body.full_name === "string" && body.full_name.trim()
      ? body.full_name.trim()
      : "New user";
  const createRes = await supabaseAdmin.auth.admin.createUser({
    email,
    password: crypto.randomUUID(),
    email_confirm: true,
    user_metadata: { full_name },
  });
  if (createRes.error || !createRes.data.user) {
    return NextResponse.json({ error: createRes.error?.message ?? "Could not create user" }, { status: 400 });
  }
  const id = createRes.data.user.id;
  await supabase.from("profiles").update({
    full_name,
    role,
    is_active: body.is_active !== false,
  }).eq("id", id);

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
    full_name,
    role,
    is_active: body.is_active !== false,
    created_at: new Date().toISOString(),
    venue_ids: role === "admin" ? body.venue_ids ?? [] : [],
  });
}

import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { SessionUser } from "@/lib/types/courtly";

export const SESSION_COOKIE = "courtly-session";

export async function readSessionUser(): Promise<SessionUser | null> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.is_active === false) return null;

  return {
    id: profile.id,
    email: user.email ?? "",
    full_name: profile.full_name,
    role: profile.role,
    is_active: profile.is_active,
  };
}

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
    .select("id, full_name, first_name, last_name, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.is_active === false) return null;

  const row = profile as {
    id: string;
    full_name: string;
    first_name: string | null;
    last_name: string | null;
    role: SessionUser["role"];
    is_active: boolean;
  };
  const fromParts = [row.first_name, row.last_name]
    .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    .map((part) => part.trim())
    .join(" ")
    .trim();
  const displayName = row.full_name?.trim() || fromParts || "";

  return {
    id: row.id,
    email: user.email ?? "",
    full_name: displayName,
    role: row.role,
    is_active: row.is_active,
  };
}

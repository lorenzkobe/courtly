import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET() {
  const user = await readSessionUser();
  if (user) {
    return NextResponse.json({ user });
  }
  const supabase = await createSupabaseServerClient();
  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (authUser?.id) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_active")
      .eq("id", authUser.id)
      .maybeSingle();
    if (profile && profile.is_active === false) {
      await supabase.auth.signOut();
    }
  }
  return NextResponse.json({ user: null });
}

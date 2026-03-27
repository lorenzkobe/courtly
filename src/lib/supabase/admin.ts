import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicEnv, getSupabaseServiceRoleKey } from "@/lib/supabase/env";

let adminClient: ReturnType<typeof createClient<any>> | null = null;

export function createSupabaseAdminClient() {
  if (adminClient) return adminClient;
  const { url } = getSupabasePublicEnv();
  const serviceRoleKey = getSupabaseServiceRoleKey();
  adminClient = createClient<any>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return adminClient;
}

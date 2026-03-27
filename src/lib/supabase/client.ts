"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

let client: SupabaseClient<any> | null = null;

export function createSupabaseBrowserClient() {
  if (client) return client;
  const { url, anonKey } = getSupabasePublicEnv();
  client = createBrowserClient<any>(url, anonKey);
  return client;
}

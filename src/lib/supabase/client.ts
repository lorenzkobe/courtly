"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicEnv, isSupabasePublicConfigured } from "@/lib/supabase/env";

let client: SupabaseClient | null = null;

/**
 * Returns a browser Supabase client when NEXT_PUBLIC_* env is available, otherwise null.
 * Never throws — use for optional features (e.g. Realtime) so the app still runs without Supabase in the bundle.
 */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!isSupabasePublicConfigured()) return null;
  try {
    if (client) return client;
    const { url, anonKey } = getSupabasePublicEnv();
    client = createBrowserClient(url, anonKey);
    return client;
  } catch (e) {
    console.warn("[courtly:supabase] browser client unavailable", e);
    return null;
  }
}

/** Throws if public Supabase env is missing (e.g. OAuth callback). */
export function createSupabaseBrowserClient(): SupabaseClient {
  const browserClient = getSupabaseBrowserClient();
  if (!browserClient) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is required");
  }
  return browserClient;
}

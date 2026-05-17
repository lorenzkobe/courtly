import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

let resetClient: ReturnType<typeof createClient> | null = null;

/**
 * Server-only Supabase client for password-reset emails.
 *
 * Uses `flowType: 'implicit'` so Supabase sends a token-hash link
 * (`/auth/v1/verify?token=...&type=recovery&redirect_to=...`) instead of a
 * PKCE `?code=` link. PKCE requires the originating browser to hold the
 * code_verifier; for server-initiated reset emails (superadmin button, or
 * forgot-password API) the user often clicks the link in a different browser,
 * device, or incognito session — PKCE would silently fail. Implicit/token-hash
 * carries the credential in the URL itself, so it works cross-browser.
 */
export function createSupabaseResetClient() {
  if (resetClient) return resetClient;
  const { url, anonKey } = getSupabasePublicEnv();
  resetClient = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      flowType: "implicit",
    },
  });
  return resetClient;
}

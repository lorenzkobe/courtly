/** True when browser-safe Supabase env is present (inlined by Next at build time). */
export function isSupabasePublicConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return Boolean(url && publishableKey);
}

/**
 * Read public Supabase env for the browser bundle.
 * Use literal `process.env.NEXT_PUBLIC_*` only — Next inlines those at compile time;
 * `process.env[someKey]` is not replaced and is undefined on the client.
 */
export function getSupabasePublicEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL is required");
  }
  if (!publishableKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY is required",
    );
  }
  return {
    url,
    anonKey: publishableKey,
  };
}

export function getSupabaseServiceRoleKey(): string {
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required");
  }
  return value;
}

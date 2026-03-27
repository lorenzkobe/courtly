type PublicEnvKey = "NEXT_PUBLIC_SUPABASE_URL";

function readPublicEnvVar(key: PublicEnvKey): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} is required`);
  }
  return value;
}

export function getSupabasePublicEnv() {
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!publishableKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY is required",
    );
  }
  return {
    url: readPublicEnvVar("NEXT_PUBLIC_SUPABASE_URL"),
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

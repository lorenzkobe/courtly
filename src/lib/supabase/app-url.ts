/**
 * Public site URL for Supabase auth redirects (invite, magic link, etc.).
 *
 * Vercel: set `NEXT_PUBLIC_APP_URL` to production (`https://www.courtly.cc`).
 * For preview deployments, leave it unset so `VERCEL_URL` is used automatically.
 *
 * Supabase Dashboard → Authentication → URL configuration:
 * - Site URL: your production origin (e.g. `https://www.courtly.cc`).
 * - Redirect URLs: include `http://localhost:3000/auth/callback`,
 *   `https://www.courtly.cc/auth/callback`, and a wildcard such as
 *   `https://*.vercel.app/auth/callback` for preview branch URLs.
 *   Invites and password reset emails land on `/auth/callback` first, then
 *   `next` sends users to `/auth/set-password` to choose a password.
 */
export function getPublicAppUrl() {
  const raw =
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  return raw.replace(/\/$/, "");
}

export function authCallbackUrl() {
  const base = getPublicAppUrl();
  return base ? `${base}/auth/callback` : "";
}

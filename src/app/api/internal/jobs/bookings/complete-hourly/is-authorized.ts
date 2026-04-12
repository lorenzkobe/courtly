export function isCronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  const xSecret = req.headers.get("x-cron-secret");
  if (auth === `Bearer ${secret}`) return true;
  if (xSecret === secret) return true;
  return false;
}

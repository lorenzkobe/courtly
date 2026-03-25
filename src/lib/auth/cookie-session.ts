import { cookies } from "next/headers";
import type { SessionUser } from "@/lib/types/courtly";

export const SESSION_COOKIE = "courtly-session";

export async function readSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as SessionUser;
    if (!parsed?.email || !parsed?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

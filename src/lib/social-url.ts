export type SocialPlatform = "facebook" | "instagram";

const SOCIAL_HOSTS: Record<SocialPlatform, string> = {
  facebook: "facebook.com",
  instagram: "instagram.com",
};

const SOCIAL_LABELS: Record<SocialPlatform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
};

export function validateSocialUrl(value: unknown, platform: SocialPlatform): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const raw = value.trim();
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return `${SOCIAL_LABELS[platform]} URL is invalid.`;
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return `${SOCIAL_LABELS[platform]} URL must start with http:// or https://.`;
  }

  const host = parsed.hostname.toLowerCase();
  const expected = SOCIAL_HOSTS[platform];
  const isMatch = host === expected || host.endsWith(`.${expected}`);
  if (!isMatch) {
    return `${SOCIAL_LABELS[platform]} URL must be from ${expected}.`;
  }

  return null;
}

export function normalizeSocialUrl(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim();
}

type SocialPlatform = "facebook" | "instagram";

const SOCIAL_HOSTS: Record<SocialPlatform, string> = {
  facebook: "facebook.com",
  instagram: "instagram.com",
};

const SOCIAL_LABELS: Record<SocialPlatform, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
};

function withDefaultProtocol(value: string): string {
  const hasProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(value);
  return hasProtocol ? value : `https://${value}`;
}

export function validateSocialUrl(value: unknown, platform: SocialPlatform): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const raw = value.trim();
  const candidate = withDefaultProtocol(raw);
  let parsed: URL;
  try {
    parsed = new URL(candidate);
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
  const raw = value.trim();
  if (!raw) return "";
  return withDefaultProtocol(raw);
}

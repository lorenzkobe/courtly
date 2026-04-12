const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export function parseLimit(rawLimit: string | null | undefined): number {
  if (!rawLimit) return DEFAULT_LIMIT;
  const parsed = Number.parseInt(rawLimit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_LIMIT;
  return Math.min(parsed, MAX_LIMIT);
}

export function encodeOffsetCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ o: Math.max(0, Math.trunc(offset)) }), "utf8").toString(
    "base64url",
  );
}

export function decodeOffsetCursor(cursor: string | null | undefined): number {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
      o?: unknown;
    };
    const value = typeof parsed.o === "number" ? parsed.o : 0;
    return Number.isFinite(value) && value >= 0 ? Math.trunc(value) : 0;
  } catch {
    return 0;
  }
}

export function httpStatusOf(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const maybeResponse = (error as { response?: { status?: unknown } }).response;
  if (!maybeResponse || typeof maybeResponse !== "object") return null;
  return typeof maybeResponse.status === "number" ? maybeResponse.status : null;
}

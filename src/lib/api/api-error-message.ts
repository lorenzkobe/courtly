import { isAxiosError } from "axios";

const AXIOS_FAILED_REQUEST_PREFIX = "Request failed with status code";

function messageFromResponseData(data: unknown): string | undefined {
  if (!data || typeof data !== "object") return undefined;
  const d = data as Record<string, unknown>;
  const err = d.error;
  if (typeof err === "string" && err.trim()) return err.trim();
  if (err && typeof err === "object" && "message" in err) {
    const nested = (err as { message?: unknown }).message;
    if (typeof nested === "string" && nested.trim()) return nested.trim();
  }
  if (typeof d.message === "string" && d.message.trim()) return d.message.trim();
  return undefined;
}

function isGenericAxiosStatusMessage(message: string): boolean {
  return message.startsWith(AXIOS_FAILED_REQUEST_PREFIX);
}

/**
 * Prefer a server message from `response.data` over Axios's generic
 * "Request failed with status code …" string.
 */
export function apiErrorMessage(error: unknown, fallback: string): string {
  if (isAxiosError(error) && error.response?.data !== undefined) {
    const fromBody = messageFromResponseData(error.response.data);
    if (fromBody) return fromBody;
  }
  if (error instanceof Error && error.message && !isGenericAxiosStatusMessage(error.message)) {
    return error.message;
  }
  return fallback;
}

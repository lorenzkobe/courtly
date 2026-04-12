import type { OpenPlaySession } from "@/lib/types/courtly";

function localInstantMs(date: string, time: string): number {
  const t = time.split(":").length === 2 ? `${time}:00` : time;
  return Date.parse(`${date}T${t}`);
}

export type OpenPlayDisplayStatus = "open" | "started" | "closed" | "cancelled";

/** Terminal DB rows that should not accept new joins. */
export function isOpenPlayTerminalDbStatus(
  status: OpenPlaySession["status"],
): boolean {
  return (
    status === "cancelled" ||
    status === "closed" ||
    status === "completed"
  );
}

/**
 * Product labels for list/detail. `full` is a virtual overlay from hydrate; treat as open for label unless closed wins.
 */
export function openPlayDisplayStatus(
  session: Pick<
    OpenPlaySession,
    | "date"
    | "start_time"
    | "end_time"
    | "status"
  >,
  nowMs: number,
  approvedCount: number,
): OpenPlayDisplayStatus {
  if (session.status === "cancelled") return "cancelled";
  if (session.status === "closed" || session.status === "completed") {
    return "closed";
  }

  const startMs = localInstantMs(session.date, session.start_time);
  const endMs = localInstantMs(session.date, session.end_time);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return "open";

  if (nowMs >= endMs) return "closed";
  if (nowMs >= startMs && approvedCount === 0) return "closed";
  if (nowMs >= startMs && nowMs < endMs && approvedCount >= 1) return "started";
  return "open";
}

export function openPlayDisplayStatusLabel(status: OpenPlayDisplayStatus): string {
  switch (status) {
    case "open":
      return "Open";
    case "started":
      return "Started";
    case "closed":
      return "Closed";
    case "cancelled":
      return "Cancelled";
    default:
      return String(status);
  }
}

/**
 * Target lifecycle status to persist (cron). Returns null if no change.
 */
export function computeOpenPlayLifecycleTargetStatus(
  row: Pick<
    OpenPlaySession,
    "date" | "start_time" | "end_time" | "status"
  >,
  nowMs: number,
  approvedCount: number,
): "started" | "closed" | null {
  if (row.status === "cancelled" || row.status === "closed") return null;
  if (row.status === "completed") return "closed";

  const startMs = localInstantMs(row.date, row.start_time);
  const endMs = localInstantMs(row.date, row.end_time);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;

  if (nowMs >= endMs) return "closed";
  if (nowMs >= startMs && approvedCount === 0) return "closed";
  if (nowMs >= startMs && nowMs < endMs && approvedCount >= 1) {
    if (row.status === "started") return null;
    return "started";
  }
  return null;
}

export function assertCanJoinOpenPlayAsNewParticipant(
  session: Pick<
    OpenPlaySession,
    "date" | "start_time" | "end_time" | "status"
  >,
  nowMs: number,
): { ok: true } | { ok: false; message: string } {
  if (isOpenPlayTerminalDbStatus(session.status) || session.status === "started") {
    return { ok: false, message: "Open play is closed" };
  }
  const startMs = localInstantMs(session.date, session.start_time);
  const endMs = localInstantMs(session.date, session.end_time);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
    return { ok: false, message: "Open play is not available" };
  }
  if (nowMs >= endMs) {
    return { ok: false, message: "Open play has ended" };
  }
  if (nowMs >= startMs) {
    return { ok: false, message: "Open play has already started" };
  }
  return { ok: true };
}

/** Submit proof: allow until session end if not terminally closed (players may finish payment after slot starts). */
export function assertOpenPlayAllowsSubmitProof(
  session: Pick<
    OpenPlaySession,
    "date" | "start_time" | "end_time" | "status"
  >,
  nowMs: number,
): { ok: true } | { ok: false; message: string } {
  if (isOpenPlayTerminalDbStatus(session.status)) {
    return { ok: false, message: "Open play is closed" };
  }
  const endMs = localInstantMs(session.date, session.end_time);
  if (!Number.isFinite(endMs)) {
    return { ok: false, message: "Open play is not available" };
  }
  if (nowMs >= endMs) {
    return { ok: false, message: "Open play has ended" };
  }
  return { ok: true };
}

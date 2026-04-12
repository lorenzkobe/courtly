import type { OpenPlaySession } from "@/lib/types/courtly";

function localSessionInstantMs(
  date: string,
  time: string,
): number {
  const t = time.split(":").length === 2 ? `${time}:00` : time;
  return Date.parse(`${date}T${t}`);
}

export type OpenPlaySchedulePhase = "upcoming" | "in_progress" | "ended";

/**
 * Time-based phase for an open play (ignores DB `completed` unless you pass
 * `respectDbCompleted` and status is completed/cancelled).
 */
export function openPlaySchedulePhase(
  session: Pick<OpenPlaySession, "date" | "start_time" | "end_time" | "status">,
  nowMs: number,
): OpenPlaySchedulePhase | "cancelled" {
  if (session.status === "cancelled") return "cancelled";
  if (session.status === "closed" || session.status === "completed") {
    return "ended";
  }

  const startMs = localSessionInstantMs(session.date, session.start_time);
  const endMs = localSessionInstantMs(session.date, session.end_time);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return "upcoming";

  if (session.status === "started") {
    if (nowMs >= endMs) return "ended";
    return "in_progress";
  }

  if (nowMs < startMs) return "upcoming";
  if (nowMs >= endMs) return "ended";
  return "in_progress";
}

export function openPlaySchedulePhaseLabel(
  phase: OpenPlaySchedulePhase | "cancelled",
): string {
  switch (phase) {
    case "cancelled":
      return "Cancelled";
    case "upcoming":
      return "Upcoming";
    case "in_progress":
      return "In progress";
    case "ended":
      return "Completed";
    default:
      return String(phase);
  }
}

/** True only before slot start (new joins / list affordances). */
export function isOpenPlayJoinableBySchedule(
  session: Pick<OpenPlaySession, "date" | "start_time" | "end_time" | "status">,
  nowMs: number,
): boolean {
  if (
    session.status === "cancelled" ||
    session.status === "closed" ||
    session.status === "completed" ||
    session.status === "started"
  ) {
    return false;
  }
  const startMs = localSessionInstantMs(session.date, session.start_time);
  const endMs = localSessionInstantMs(session.date, session.end_time);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
  if (nowMs >= endMs) return false;
  return nowMs < startMs;
}

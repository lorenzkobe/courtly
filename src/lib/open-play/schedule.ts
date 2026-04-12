import type { OpenPlaySession } from "@/lib/types/courtly";

function localSessionInstantMs(date: string, time: string): number {
  const t = time.split(":").length === 2 ? `${time}:00` : time;
  return Date.parse(`${date}T${t}`);
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

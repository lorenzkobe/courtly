import { NextResponse } from "next/server";
import {
  listBookingsByIdsAdmin,
  listConfirmedBookingsByGroupIds,
  listConfirmedBookingsForAutoCompletion,
  markBookingsCompletedByIds,
} from "@/lib/data/courtly-db";
import {
  emitBookingCompletedReviewReminderIfNeeded,
  emitBookingLifecycleNotifications,
} from "@/lib/notifications/emit-from-server";

const MANILA_TZ = "Asia/Manila";
const DEFAULT_BATCH_LIMIT = 200;
const MAX_BATCH_LIMIT = 500;
const DEFAULT_SEED_LIMIT = 1000;

type CandidateRow = {
  id: string;
  booking_group_id: string | null;
  date: string;
  end_time: string;
  user_id: string | null;
  court_id: string;
};

type CompletionEntity = {
  rowIds: string[];
  completionDate: string;
  completionEndTime: string;
  representativeBookingId: string;
  representativeUserId: string | null;
  representativeVenueId?: string;
};

function readManilaNowParts(now = new Date()): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MANILA_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return {
    date: `${pick("year")}-${pick("month")}-${pick("day")}`,
    time: `${pick("hour")}:${pick("minute")}`,
  };
}

function hasReachedEnd(
  date: string,
  endTime: string,
  nowDate: string,
  nowTime: string,
): boolean {
  if (date < nowDate) return true;
  if (date > nowDate) return false;
  return endTime <= nowTime;
}

function pickEntityBatch(
  entities: CompletionEntity[],
  rowLimit: number,
): { selected: CompletionEntity[]; hasMore: boolean } {
  const selected: CompletionEntity[] = [];
  let rowCount = 0;
  for (const entity of entities) {
    const nextCount = rowCount + entity.rowIds.length;
    if (selected.length > 0 && nextCount > rowLimit) {
      break;
    }
    selected.push(entity);
    rowCount = nextCount;
    if (rowCount >= rowLimit) break;
  }
  return { selected, hasMore: entities.length > selected.length };
}

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  const xSecret = req.headers.get("x-cron-secret");
  if (auth === `Bearer ${secret}`) return true;
  if (xSecret === secret) return true;
  return false;
}

export async function GET(req: Request) {
  const startedAt = Date.now();
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { date: nowDate, time: nowTime } = readManilaNowParts();
  const batchLimit = Math.min(
    Math.max(Number.parseInt(process.env.BOOKING_COMPLETION_BATCH_LIMIT ?? "", 10) || DEFAULT_BATCH_LIMIT, 1),
    MAX_BATCH_LIMIT,
  );
  const seedLimit = Math.max(
    Number.parseInt(process.env.BOOKING_COMPLETION_SEED_LIMIT ?? "", 10) || DEFAULT_SEED_LIMIT,
    batchLimit * 2,
  );

  const seedRows = await listConfirmedBookingsForAutoCompletion({
    upToDate: nowDate,
    limit: seedLimit,
  });
  const standaloneSeed = seedRows.filter((row) => !row.booking_group_id);
  const groupIds = [...new Set(seedRows.map((row) => row.booking_group_id).filter(Boolean))] as string[];
  const groupedRows = await listConfirmedBookingsByGroupIds(groupIds);

  const entities: CompletionEntity[] = [];
  for (const row of standaloneSeed) {
    if (!hasReachedEnd(row.date, row.end_time, nowDate, nowTime)) continue;
    entities.push({
      rowIds: [row.id],
      completionDate: row.date,
      completionEndTime: row.end_time,
      representativeBookingId: row.id,
      representativeUserId: row.user_id,
    });
  }

  const groupMap = new Map<string, CandidateRow[]>();
  for (const row of groupedRows) {
    const groupId = row.booking_group_id;
    if (!groupId) continue;
    const list = groupMap.get(groupId) ?? [];
    list.push(row);
    groupMap.set(groupId, list);
  }
  for (const rows of groupMap.values()) {
    if (rows.length === 0) continue;
    const sorted = [...rows].sort((a, b) => {
      const byDate = a.date.localeCompare(b.date);
      if (byDate !== 0) return byDate;
      const byEnd = a.end_time.localeCompare(b.end_time);
      if (byEnd !== 0) return byEnd;
      return a.id.localeCompare(b.id);
    });
    const finalRow = sorted[sorted.length - 1]!;
    if (!hasReachedEnd(finalRow.date, finalRow.end_time, nowDate, nowTime)) continue;
    entities.push({
      rowIds: sorted.map((row) => row.id),
      completionDate: finalRow.date,
      completionEndTime: finalRow.end_time,
      representativeBookingId: finalRow.id,
      representativeUserId: sorted.find((row) => row.user_id)?.user_id ?? null,
    });
  }

  entities.sort((a, b) => {
    const byDate = a.completionDate.localeCompare(b.completionDate);
    if (byDate !== 0) return byDate;
    const byEnd = a.completionEndTime.localeCompare(b.completionEndTime);
    if (byEnd !== 0) return byEnd;
    return a.representativeBookingId.localeCompare(b.representativeBookingId);
  });

  const { selected, hasMore: hasMoreEntities } = pickEntityBatch(entities, batchLimit);
  const targetIds = [...new Set(selected.flatMap((entity) => entity.rowIds))];
  const previousBookings = await listBookingsByIdsAdmin(targetIds);
  const prevById = new Map(previousBookings.map((booking) => [booking.id, booking]));

  const updated = await markBookingsCompletedByIds(targetIds);
  const updatedIds = new Set(updated.map((row) => row.id));

  for (const bookingId of updatedIds) {
    const prev = prevById.get(bookingId);
    if (!prev) continue;
    await emitBookingLifecycleNotifications({
      prev,
      nextRow: { ...prev, status: "completed" },
      bookingId,
      skipReviewReminder: true,
    });
  }

  let remindersSent = 0;
  for (const entity of selected) {
    const anyUpdated = entity.rowIds.some((id) => updatedIds.has(id));
    if (!anyUpdated) continue;
    const representative = prevById.get(entity.representativeBookingId);
    await emitBookingCompletedReviewReminderIfNeeded({
      userId: representative?.user_id ?? entity.representativeUserId,
      venueId: representative?.venue_id,
      bookingId: entity.representativeBookingId,
    });
    remindersSent += 1;
  }

  const body = {
    now_manila_date: nowDate,
    now_manila_time: nowTime,
    seed_count: seedRows.length,
    candidate_entities: entities.length,
    selected_entities: selected.length,
    completed_count: updatedIds.size,
    skipped_count: targetIds.length - updatedIds.size,
    reminders_sent: remindersSent,
    has_more: hasMoreEntities || seedRows.length >= seedLimit,
    duration_ms: Date.now() - startedAt,
  };
  console.info("[booking-complete-hourly]", JSON.stringify(body));
  return NextResponse.json(body);
}

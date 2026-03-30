import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { createNotificationRepository } from "@/lib/notifications/repository-factory";
import { logApiMetrics, payloadBytesOf } from "@/lib/observability/api-metrics";
import {
  decodeOffsetCursor,
  encodeOffsetCursor,
  parseLimit,
} from "@/lib/pagination/cursor";

const repo = createNotificationRepository();

export async function GET(req: Request) {
  const startedAt = Date.now();
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limit = parseLimit(searchParams.get("limit"));
  const offset = decodeOffsetCursor(searchParams.get("cursor"));
  const notifications = await repo.listForUser(user.id, { offset, limit });
  const hasMore = notifications.has_more ?? false;
  const nextCursor = hasMore
    ? encodeOffsetCursor(offset + notifications.items.length)
    : null;
  const body = {
    ...notifications,
    has_more: hasMore,
    next_cursor: nextCursor,
  };
  logApiMetrics({
    route: "/api/notifications",
    duration_ms: Date.now() - startedAt,
    limit,
    cursor: searchParams.get("cursor"),
    payload_bytes: payloadBytesOf(body),
    row_counts: { items: body.items.length },
  });
  return NextResponse.json(body);
}

export async function PATCH() {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await repo.markAllRead(user.id);
  return NextResponse.json({ ok: true });
}

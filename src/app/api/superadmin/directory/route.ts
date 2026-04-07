import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { listVenuesPage } from "@/lib/data/courtly-db";
import { logApiMetrics, payloadBytesOf } from "@/lib/observability/api-metrics";
import { decodeOffsetCursor, encodeOffsetCursor, parseLimit } from "@/lib/pagination/cursor";
import type { SuperadminDirectoryPagedResponse } from "@/lib/types/courtly";
import { GET as listManagedUsers } from "@/app/api/admin/managed-users/route";

export async function GET(req: Request) {
  const startedAt = Date.now();
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const limit = parseLimit(searchParams.get("limit"));
  const usersOffset = decodeOffsetCursor(searchParams.get("users_cursor"));
  const venuesOffset = decodeOffsetCursor(searchParams.get("venues_cursor"));

  const [venuesPage, usersResponse] = await Promise.all([
    listVenuesPage({ offset: venuesOffset, limit }),
    listManagedUsers(),
  ]);
  if (usersResponse.status !== 200) {
    return usersResponse;
  }
  const managedUsers = (await usersResponse.json()) as SuperadminDirectoryPagedResponse["managed_users"]["items"];
  const usersSlice = managedUsers.slice(usersOffset, usersOffset + limit + 1);
  const usersHasMore = usersSlice.length > limit;

  const body: SuperadminDirectoryPagedResponse = {
    venues: {
      items: venuesPage.items,
      has_more: venuesPage.hasMore,
      next_cursor: venuesPage.hasMore
        ? encodeOffsetCursor(venuesOffset + venuesPage.items.length)
        : null,
    },
    managed_users: {
      items: usersHasMore ? usersSlice.slice(0, limit) : usersSlice,
      has_more: usersHasMore,
      next_cursor: usersHasMore ? encodeOffsetCursor(usersOffset + limit) : null,
    },
  };
  logApiMetrics({
    route: "/api/superadmin/directory",
    duration_ms: Date.now() - startedAt,
    limit,
    cursor:
      searchParams.get("users_cursor") ?? searchParams.get("venues_cursor"),
    payload_bytes: payloadBytesOf(body),
    row_counts: {
      managed_users: body.managed_users.items.length,
      venues: body.venues.items.length,
    },
  });
  return NextResponse.json(body);
}

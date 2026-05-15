import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import {
  listManagedUsersForDirectory,
  listVenuesPage,
} from "@/lib/data/courtly-db";
import { logApiMetrics, payloadBytesOf } from "@/lib/observability/api-metrics";
import { decodeOffsetCursor, encodeOffsetCursor, parseLimit } from "@/lib/pagination/cursor";
import type { ManagedUser, SuperadminDirectoryPagedResponse } from "@/lib/types/courtly";

type RoleFilter = "all" | ManagedUser["role"];
type StatusFilter = "all" | "active" | "inactive" | "invite_pending";
type SortKey =
  | "name_asc"
  | "name_desc"
  | "email_asc"
  | "email_desc"
  | "created_asc"
  | "created_desc";

function parseRole(value: string | null): RoleFilter {
  if (value === "user" || value === "admin" || value === "superadmin") return value;
  return "all";
}

function parseStatus(value: string | null): StatusFilter {
  if (value === "active" || value === "inactive" || value === "invite_pending") return value;
  return "all";
}

function parseSort(value: string | null): SortKey {
  switch (value) {
    case "name_desc":
    case "email_asc":
    case "email_desc":
    case "created_asc":
    case "created_desc":
    case "name_asc":
      return value;
    default:
      return "name_asc";
  }
}

function userDisplayName(u: ManagedUser): string {
  const parts = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  return parts || u.full_name || "";
}

function isInvitePending(u: ManagedUser): boolean {
  return u.email_confirmed_at == null || u.email_confirmed_at === "";
}

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
  const searchTerm = (searchParams.get("q") ?? "").trim().toLowerCase();
  const roleFilter = parseRole(searchParams.get("role"));
  const statusFilter = parseStatus(searchParams.get("status"));
  const sort = parseSort(searchParams.get("sort"));

  const active: "all" | "active" | "inactive" =
    statusFilter === "active" || statusFilter === "inactive"
      ? statusFilter
      : "all";

  let venuesPage: Awaited<ReturnType<typeof listVenuesPage>>;
  let allUsers: ManagedUser[];
  try {
    [venuesPage, allUsers] = await Promise.all([
      listVenuesPage({ offset: venuesOffset, limit }),
      listManagedUsersForDirectory({ role: roleFilter, active }),
    ]);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Could not load directory.";
    console.error("[superadmin/directory] load failed:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }

  let filteredUsers = allUsers;
  if (statusFilter === "invite_pending") {
    filteredUsers = filteredUsers.filter((mu) => isInvitePending(mu));
  }
  if (searchTerm) {
    filteredUsers = filteredUsers.filter((mu) => {
      const name = userDisplayName(mu).toLowerCase();
      const email = (mu.email ?? "").toLowerCase();
      return name.includes(searchTerm) || email.includes(searchTerm);
    });
  }

  const sortedUsers =
    filteredUsers.length > 1
      ? [...filteredUsers].sort((a, b) => {
          const nameA = userDisplayName(a);
          const nameB = userDisplayName(b);
          switch (sort) {
            case "name_desc":
              return nameB.localeCompare(nameA, undefined, { sensitivity: "base" });
            case "email_asc":
              return (a.email ?? "").localeCompare(b.email ?? "", undefined, { sensitivity: "base" });
            case "email_desc":
              return (b.email ?? "").localeCompare(a.email ?? "", undefined, { sensitivity: "base" });
            case "created_desc":
              return (b.created_at ?? "").localeCompare(a.created_at ?? "");
            case "created_asc":
              return (a.created_at ?? "").localeCompare(b.created_at ?? "");
            default:
              return nameA.localeCompare(nameB, undefined, { sensitivity: "base" });
          }
        })
      : filteredUsers;

  const usersSlice = sortedUsers.slice(usersOffset, usersOffset + limit + 1);
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

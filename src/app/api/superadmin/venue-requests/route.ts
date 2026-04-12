import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { listManagedUsersByIds, listVenueRequests } from "@/lib/data/courtly-db";
import type {
  SuperadminVenueRequestsResponse,
  VenueRequest,
  VenueRequestStatus,
} from "@/lib/types/courtly";

const ALLOWED_STATUS: VenueRequestStatus[] = [
  "pending",
  "needs_update",
  "approved",
  "rejected",
  "cancelled",
];

export async function GET(req: Request) {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { searchParams } = new URL(req.url);
  const rawStatus = (searchParams.get("status") ?? "").trim();
  const statuses: VenueRequestStatus[] = rawStatus
    ? rawStatus
        .split(",")
        .map((value) => value.trim())
        .filter((value): value is VenueRequestStatus =>
          ALLOWED_STATUS.includes(value as VenueRequestStatus),
        )
    : ["pending"];
  const requests = await listVenueRequests({
    statuses: statuses.length > 0 ? statuses : ["pending"],
  });
  const requesterIds = [...new Set(requests.map((request) => request.requested_by))];
  const requesters = await listManagedUsersByIds(requesterIds);
  const requesterNameById = new Map(
    requesters.map((requester) => [requester.id, requester.full_name]),
  );
  const requestsWithRequesterName: VenueRequest[] = requests.map((request) => ({
    ...request,
    requested_by_name:
      requesterNameById.get(request.requested_by) ?? request.requested_by,
  }));
  const body: SuperadminVenueRequestsResponse = { requests: requestsWithRequesterName };
  return NextResponse.json(body);
}

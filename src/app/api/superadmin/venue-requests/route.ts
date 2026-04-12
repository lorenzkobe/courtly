import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { listVenueRequests } from "@/lib/data/courtly-db";
import type {
  SuperadminVenueRequestsResponse,
  VenueRequestStatus,
} from "@/lib/types/courtly";

const ALLOWED_STATUS: VenueRequestStatus[] = [
  "pending",
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
  const statuses = rawStatus
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
  const body: SuperadminVenueRequestsResponse = { requests };
  return NextResponse.json(body);
}

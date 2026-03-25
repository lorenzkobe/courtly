import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { manageableCourtIds } from "@/lib/auth/management";
import { mockDb } from "@/lib/mock/db";
import type { Court } from "@/lib/types/courtly";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const manageable = searchParams.get("manageable") === "true";

  let list = [...mockDb.courts];

  if (manageable) {
    const user = await readSessionUser();
    if (!user || (user.role !== "admin" && user.role !== "superadmin")) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const ids = new Set(manageableCourtIds(user, list));
    list = list.filter((c) => ids.has(c.id));
  }

  if (status) {
    list = list.filter((c) => c.status === status);
  }

  return NextResponse.json(list);
}

export async function POST(req: Request) {
  const user = await readSessionUser();
  if (!user || (user.role !== "admin" && user.role !== "superadmin")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as Partial<Court>;
  const id = `court-${crypto.randomUUID().slice(0, 8)}`;

  let managed_by_user_id: string | null;
  if (user.role === "superadmin") {
    managed_by_user_id =
      typeof body.managed_by_user_id === "string"
        ? body.managed_by_user_id
        : null;
  } else {
    managed_by_user_id = user.id;
  }

  const court: Court = {
    id,
    name: body.name ?? "New court",
    location: body.location ?? "",
    type: (body.type as Court["type"]) ?? "indoor",
    surface: (body.surface as Court["surface"]) ?? "sport_court",
    image_url: body.image_url ?? "",
    hourly_rate: Number(body.hourly_rate) || 0,
    amenities: Array.isArray(body.amenities) ? body.amenities : [],
    available_hours: body.available_hours ?? { open: "07:00", close: "22:00" },
    status: (body.status as Court["status"]) ?? "active",
    managed_by_user_id,
  };
  mockDb.courts.push(court);
  return NextResponse.json(court);
}

import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { listVenues } from "@/lib/data/courtly-db";
import type { SuperadminDirectoryResponse } from "@/lib/types/courtly";
import { GET as listManagedUsers } from "@/app/api/admin/managed-users/route";

export async function GET() {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [venues, usersResponse] = await Promise.all([listVenues(), listManagedUsers()]);
  if (usersResponse.status !== 200) {
    return usersResponse;
  }
  const managedUsers = (await usersResponse.json()) as SuperadminDirectoryResponse["managed_users"];

  const body: SuperadminDirectoryResponse = {
    venues,
    managed_users: managedUsers,
  };
  return NextResponse.json(body);
}

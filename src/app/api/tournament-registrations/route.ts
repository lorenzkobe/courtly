import { NextResponse } from "next/server";
import { mockDb } from "@/lib/mock/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get("player_email");

  let list = [...mockDb.registrations];
  if (email) {
    list = list.filter((r) => r.player_email === email);
  }
  list.sort((a, b) =>
    String(b.created_date ?? "").localeCompare(String(a.created_date ?? "")),
  );
  return NextResponse.json(list);
}

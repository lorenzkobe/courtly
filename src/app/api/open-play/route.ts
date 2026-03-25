import { NextResponse } from "next/server";
import { mockDb } from "@/lib/mock/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const limit = Number(searchParams.get("limit")) || undefined;

  let list = [...mockDb.openPlay];
  if (status) list = list.filter((s) => s.status === status);
  list.sort((a, b) => a.date.localeCompare(b.date));
  if (limit) list = list.slice(0, limit);
  return NextResponse.json(list);
}

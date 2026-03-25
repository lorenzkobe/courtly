import { NextResponse } from "next/server";
import { mockDb } from "@/lib/mock/db";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const limit = Number(searchParams.get("limit")) || undefined;
  const sort = searchParams.get("sort") ?? "date";

  let list = [...mockDb.tournaments];
  if (status) {
    list = list.filter((t) => t.status === status);
  }
  list.sort((a, b) => {
    const cmp = a.date.localeCompare(b.date);
    return sort.startsWith("-") ? -cmp : cmp;
  });
  if (limit) list = list.slice(0, limit);
  return NextResponse.json(list);
}

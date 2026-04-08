import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "PayMongo reconciliation is disabled. Use manual payment proof submission." },
    { status: 410 },
  );
}

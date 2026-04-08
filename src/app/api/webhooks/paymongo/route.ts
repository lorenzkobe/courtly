import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "PayMongo webhook endpoint is disabled." },
    { status: 410 },
  );
}

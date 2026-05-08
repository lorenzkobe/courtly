import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { runGenerateMonthlyBilling } from "@/app/api/internal/jobs/billing/generate-monthly/operations";

export async function POST(req: Request) {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as {
    year?: number;
    month?: number;
    mode?: "backfill" | "replace_unsettled";
  };

  if (body.mode && body.mode !== "backfill" && body.mode !== "replace_unsettled") {
    return NextResponse.json({ error: "Invalid mode." }, { status: 400 });
  }
  if (body.year !== undefined && (!Number.isInteger(body.year) || body.year < 2020)) {
    return NextResponse.json({ error: "Invalid year." }, { status: 400 });
  }
  if (body.month !== undefined && (!Number.isInteger(body.month) || body.month < 1 || body.month > 12)) {
    return NextResponse.json({ error: "Invalid month." }, { status: 400 });
  }

  const result = await runGenerateMonthlyBilling({
    year: body.year,
    month: body.month,
    mode: body.mode ?? "backfill",
  });

  return NextResponse.json(result);
}

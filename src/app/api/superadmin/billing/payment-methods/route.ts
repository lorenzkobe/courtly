import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import {
  listPlatformPaymentMethods,
  createPlatformPaymentMethod,
} from "@/lib/data/courtly-db";
import { isValidPhMobile } from "@/lib/validation/person-fields";

export async function GET() {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const methods = await listPlatformPaymentMethods(false);
  return NextResponse.json({ methods });
}

export async function POST(req: Request) {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as {
    method?: string;
    account_name?: string;
    account_number?: string;
  };

  if (!body.method || !["gcash", "maya"].includes(body.method)) {
    return NextResponse.json({ error: "Invalid payment method." }, { status: 400 });
  }
  if (!body.account_name?.trim()) {
    return NextResponse.json({ error: "Account name is required." }, { status: 400 });
  }
  if (!body.account_number?.trim()) {
    return NextResponse.json({ error: "Account number is required." }, { status: 400 });
  }
  if (!isValidPhMobile(body.account_number)) {
    return NextResponse.json(
      { error: "Account number must be a valid PH mobile number (e.g. 09171234567)." },
      { status: 400 },
    );
  }

  const method = await createPlatformPaymentMethod({
    method: body.method as "gcash" | "maya",
    account_name: body.account_name.trim(),
    account_number: body.account_number.trim(),
  });

  return NextResponse.json({ method }, { status: 201 });
}

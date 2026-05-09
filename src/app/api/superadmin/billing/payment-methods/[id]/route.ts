import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import {
  updatePlatformPaymentMethod,
  deletePlatformPaymentMethod,
} from "@/lib/data/courtly-db";
import { isValidPhMobile } from "@/lib/validation/person-fields";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  const body = await req.json() as {
    account_name?: string;
    account_number?: string;
    is_active?: boolean;
  };

  if (body.account_number !== undefined && !isValidPhMobile(body.account_number)) {
    return NextResponse.json(
      { error: "Account number must be a valid PH mobile number (e.g. 09171234567)." },
      { status: 400 },
    );
  }

  const method = await updatePlatformPaymentMethod(id, {
    ...(body.account_name !== undefined && { account_name: body.account_name.trim() }),
    ...(body.account_number !== undefined && { account_number: body.account_number.trim() }),
    ...(body.is_active !== undefined && { is_active: body.is_active }),
  });

  return NextResponse.json({ method });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  await deletePlatformPaymentMethod(id);
  return NextResponse.json({ ok: true });
}

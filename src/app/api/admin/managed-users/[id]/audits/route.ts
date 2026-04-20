import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { decodeOffsetCursor, encodeOffsetCursor, parseLimit } from "@/lib/pagination/cursor";

type Ctx = { params: Promise<{ id: string }> };

export type UserChangeAuditRow = {
  id: string;
  actor_user_id: string;
  target_user_id: string;
  changed_fields: Record<string, { before: unknown; after: unknown }>;
  created_at: string;
};

export async function GET(req: Request, ctx: Ctx) {
  const viewer = await readSessionUser();
  if (viewer?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id: targetUserId } = await ctx.params;
  const { searchParams } = new URL(req.url);
  const limit = parseLimit(searchParams.get("limit"));
  const offset = decodeOffsetCursor(searchParams.get("cursor"));

  const supabase = await createSupabaseServerClient();
  const { data: target, error: targetError } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", targetUserId)
    .maybeSingle();
  if (targetError) {
    return NextResponse.json({ error: "Could not load user" }, { status: 500 });
  }
  if (!target) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const fetchEnd = offset + limit;
  const { data: rows, error } = await supabase
    .from("user_change_audits")
    .select("id, actor_user_id, target_user_id, changed_fields, created_at")
    .eq("target_user_id", targetUserId)
    .order("created_at", { ascending: false })
    .range(offset, fetchEnd);

  if (error) {
    return NextResponse.json({ error: "Could not load audits" }, { status: 500 });
  }

  const raw = (rows ?? []) as UserChangeAuditRow[];
  const hasMore = raw.length > limit;
  const items = hasMore ? raw.slice(0, limit) : raw;
  return NextResponse.json({
    items,
    has_more: hasMore,
    next_cursor: hasMore ? encodeOffsetCursor(offset + items.length) : null,
  });
}

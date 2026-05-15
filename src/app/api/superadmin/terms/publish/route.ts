import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { publishDraft } from "@/lib/data/courtly-db";

export async function POST(req: Request) {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    target_admin_ids?: unknown;
  };
  let targetAdminIds: string[] | null = null;
  if (Array.isArray(body.target_admin_ids)) {
    targetAdminIds = body.target_admin_ids.filter(
      (id): id is string => typeof id === "string" && id.length > 0,
    );
    if (targetAdminIds.length === 0) {
      return NextResponse.json(
        { error: "Pick at least one admin to publish to, or publish to all instead." },
        { status: 400 },
      );
    }
  }
  const published = await publishDraft({ actorId: user.id, targetAdminIds });
  return NextResponse.json({
    published: {
      id: published.id,
      version: published.version,
      content_html: published.content_html,
      published_at: published.published_at,
      target_admin_ids: published.target_admin_ids,
    },
  });
}

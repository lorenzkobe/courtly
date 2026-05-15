import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import {
  getCurrentPublishedTerms,
  getDraftTerms,
} from "@/lib/data/courtly-db";

export async function GET() {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const [draft, published] = await Promise.all([
    getDraftTerms(),
    getCurrentPublishedTerms(),
  ]);
  return NextResponse.json({
    draft: draft
      ? { content_html: draft.content_html, updated_at: draft.updated_at }
      : { content_html: "", updated_at: null },
    published: published
      ? {
          id: published.id,
          version: published.version,
          content_html: published.content_html,
          published_at: published.published_at,
        }
      : null,
  });
}

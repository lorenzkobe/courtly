import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { upsertDraftTerms } from "@/lib/data/courtly-db";
import { sanitizeTermsHtml } from "@/lib/terms/sanitize-html";

export async function PATCH(req: Request) {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = (await req.json().catch(() => ({}))) as {
    content_html?: unknown;
  };
  const raw = typeof body.content_html === "string" ? body.content_html : "";
  const sanitized = sanitizeTermsHtml(raw);
  const draft = await upsertDraftTerms({ content_html: sanitized });
  return NextResponse.json({
    draft: { content_html: draft.content_html, updated_at: draft.updated_at },
  });
}

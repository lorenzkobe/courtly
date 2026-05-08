import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { getOpenPlayById } from "@/lib/data/courtly-db";
import { isCourtStaff } from "@/lib/auth/management";
import { createPaymentProofSignedUrl } from "@/lib/supabase/storage";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: sessionId } = await ctx.params;
  const requestId = new URL(req.url).searchParams.get("requestId");
  if (!requestId) return NextResponse.json({ error: "requestId is required." }, { status: 400 });

  type JoinRequestRow = {
    id: string;
    user_id: string;
    payment_proof_url: string | null;
    open_play_session_id: string;
  };

  const supabase = createSupabaseAdminClient();
  const { data: joinRequest } = (await supabase
    .from("open_play_join_requests")
    .select("id, user_id, payment_proof_url, open_play_session_id")
    .eq("id", requestId)
    .eq("open_play_session_id", sessionId)
    .maybeSingle()) as { data: JoinRequestRow | null; error: unknown };

  if (!joinRequest) {
    return NextResponse.json({ error: "Join request not found." }, { status: 404 });
  }

  const session = await getOpenPlayById(sessionId);
  const isRequester = user.id === joinRequest.user_id;
  const isHost = !!session && user.id === session.host_user_id;

  if (!isRequester && !isHost && !isCourtStaff(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!joinRequest.payment_proof_url) {
    return NextResponse.json({ error: "No payment proof on file." }, { status: 404 });
  }

  try {
    const signedUrl = await createPaymentProofSignedUrl(joinRequest.payment_proof_url);
    return NextResponse.json({ signedUrl });
  } catch {
    return NextResponse.json({ error: "Could not generate proof URL." }, { status: 500 });
  }
}

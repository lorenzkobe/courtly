import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type PatchBody = {
  venue_id?: string;
  favorite?: boolean;
};

export async function GET() {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("favorite_venues")
    .select("venue_id")
    .eq("user_id", user.id);
  if (error) {
    return NextResponse.json({ error: "Could not load favorites" }, { status: 500 });
  }
  return NextResponse.json({
    venue_ids: (data ?? []).map((row) => String((row as { venue_id: string }).venue_id)),
  });
}

export async function PATCH(req: Request) {
  const user = await readSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json()) as PatchBody;
  const venueId = body.venue_id?.trim();
  if (!venueId) {
    return NextResponse.json({ error: "venue_id is required" }, { status: 400 });
  }
  const isFavorite = body.favorite !== false;
  const supabase = await createSupabaseServerClient();
  if (isFavorite) {
    const { error } = await supabase
      .from("favorite_venues")
      .upsert(
        {
          user_id: user.id,
          venue_id: venueId,
        },
        { onConflict: "user_id,venue_id" },
      );
    if (error) {
      return NextResponse.json({ error: "Could not save favorite" }, { status: 500 });
    }
  } else {
    const { error } = await supabase
      .from("favorite_venues")
      .delete()
      .eq("user_id", user.id)
      .eq("venue_id", venueId);
    if (error) {
      return NextResponse.json({ error: "Could not remove favorite" }, { status: 500 });
    }
  }
  return NextResponse.json({ ok: true });
}

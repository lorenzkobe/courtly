import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import {
  getBookingById,
  getCourtById,
  listVenueAdminAssignmentsByAdminUser,
} from "@/lib/data/courtly-db";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { BookingAdminNote } from "@/lib/types/courtly";

type Ctx = { params: Promise<{ id: string }> };

function mapBookingAdminNoteRow(row: Record<string, unknown>): BookingAdminNote {
  return {
    id: String(row.id ?? ""),
    booking_id: String(row.booking_id ?? ""),
    booking_group_id:
      typeof row.booking_group_id === "string" ? row.booking_group_id : null,
    author_user_id: String(row.author_user_id ?? ""),
    author_name: String(row.author_name ?? ""),
    body: String(row.body ?? ""),
    created_at: String(row.created_at ?? ""),
  };
}

async function canManageBooking(
  user: Awaited<ReturnType<typeof readSessionUser>>,
  bookingId: string,
) {
  if (!user) return { ok: false as const, status: 401, error: "Unauthorized" };
  if (user.role === "superadmin") return { ok: true as const };
  if (user.role !== "admin") return { ok: false as const, status: 403, error: "Forbidden" };

  const booking = await getBookingById(bookingId);
  if (!booking) return { ok: false as const, status: 404, error: "Not found" };
  const court = await getCourtById(booking.court_id);
  if (!court) return { ok: false as const, status: 404, error: "Not found" };
  const assignments = await listVenueAdminAssignmentsByAdminUser(user.id);
  const canManage = assignments.some((assignment) => assignment.venue_id === court.venue_id);
  if (!canManage) return { ok: false as const, status: 403, error: "Forbidden" };
  return { ok: true as const, booking };
}

export async function GET(_req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  const { id } = await ctx.params;
  const authz = await canManageBooking(user, id);
  if (!authz.ok) {
    return NextResponse.json({ error: authz.error }, { status: authz.status });
  }
  const booking = authz.booking ?? (await getBookingById(id));
  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const supabase = createSupabaseAdminClient();
  const query = supabase
    .from("booking_admin_notes")
    .select("*")
    .order("created_at", { ascending: false });

  const { data, error } = booking.booking_group_id
    ? await query.eq("booking_group_id", booking.booking_group_id)
    : await query.eq("booking_id", booking.id);

  if (error) {
    return NextResponse.json({ error: "Could not load notes." }, { status: 500 });
  }

  return NextResponse.json({
    notes: (data ?? []).map((row) => mapBookingAdminNoteRow(row as Record<string, unknown>)),
  });
}

export async function POST(req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  const { id } = await ctx.params;
  const authz = await canManageBooking(user, id);
  if (!authz.ok) {
    return NextResponse.json({ error: authz.error }, { status: authz.status });
  }
  const booking = authz.booking ?? (await getBookingById(id));
  if (!booking) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json()) as { note?: string };
  const note = body.note?.trim() ?? "";
  if (!note) {
    return NextResponse.json({ error: "Note is required." }, { status: 400 });
  }
  if (note.length > 2000) {
    return NextResponse.json({ error: "Note is too long." }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("booking_admin_notes")
    .insert({
      booking_id: booking.id,
      booking_group_id: booking.booking_group_id ?? null,
      author_user_id: user!.id,
      author_name: user!.full_name || user!.email,
      body: note,
    } as never)
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Could not add note." }, { status: 500 });
  }

  return NextResponse.json({ note: mapBookingAdminNoteRow(data as Record<string, unknown>) });
}


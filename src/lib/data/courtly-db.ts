import { createSupabaseServerClient } from "@/lib/supabase/server";
import { pricingSpanFromRanges } from "@/lib/venue-price-ranges";
import type {
  Booking,
  Court,
  CourtClosure,
  CourtReview,
  ManagedUser,
  OpenPlaySession,
  Tournament,
  TournamentRegistration,
  Venue,
  VenueAdminAssignment,
  VenueClosure,
} from "@/lib/types/courtly";

function toDateString(value: string | null): string {
  return value ? value.slice(0, 10) : "";
}

function toIsoString(value: string | null): string {
  return value ?? new Date(0).toISOString();
}

export async function listVenues(): Promise<Venue[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("venues").select("*");
  if (error) throw error;
  return (data ?? []).map((row) => {
    const v = row as Venue;
    return {
      ...v,
      hourly_rate_windows: v.hourly_rate_windows ?? [],
      created_at: toIsoString((row as { created_at: string | null }).created_at),
    };
  });
}

export async function listManagedUsers(): Promise<ManagedUser[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, full_name, first_name, last_name, birthdate, mobile_number, role, is_active, created_at",
    );
  if (error) throw error;
  const users = (data ?? []) as Array<{
    id: string;
    full_name: string;
    first_name: string | null;
    last_name: string | null;
    birthdate: string | null;
    mobile_number: string | null;
    role: ManagedUser["role"];
    is_active: boolean;
    created_at: string;
  }>;
  return users.map((user) => ({
    ...user,
    email: "",
  }));
}

export async function listVenueAdminAssignments(): Promise<VenueAdminAssignment[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("venue_admin_assignments").select("*");
  if (error) throw error;
  return (data ?? []) as VenueAdminAssignment[];
}

export async function listCourts(): Promise<Court[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("courts")
    .select("*, venues(*)");
  if (error) throw error;
  return (data ?? []).map((row) => {
    const venue = (row as { venues?: Venue | null }).venues;
    const windows = venue?.hourly_rate_windows ?? [];
    const span = pricingSpanFromRanges(windows);
    return {
      id: (row as { id: string }).id,
      venue_id: (row as { venue_id: string }).venue_id,
      name: (row as { name: string }).name,
      status: (row as { status: Court["status"] }).status,
      type: (row as { type: Court["type"] }).type,
      surface: (row as { surface: Court["surface"] }).surface,
      gallery_urls: (row as { gallery_urls?: string[] }).gallery_urls ?? [],
      description: (row as { description?: string }).description,
      location: venue?.location ?? "",
      sport: venue?.sport ?? "pickleball",
      image_url: venue?.image_url ?? "",
      hourly_rate_windows: windows,
      amenities: venue?.amenities ?? [],
      available_hours: span ?? { open: "07:00", close: "22:00" },
      establishment_name: venue?.name,
      contact_phone: venue?.contact_phone,
      map_latitude: venue?.map_latitude,
      map_longitude: venue?.map_longitude,
    };
  });
}

export async function listBookings(): Promise<Booking[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("*, courts(id,name,venue_id,venues(id,name,sport))");
  if (error) throw error;
  return (data ?? []).map((row) => {
    const court = (row as { courts?: { name?: string; venue_id?: string; venues?: Venue | null } | null }).courts;
    const venue = court?.venues ?? null;
    return {
      id: (row as { id: string }).id,
      court_id: (row as { court_id: string }).court_id,
      court_name: court?.name,
      venue_id: court?.venue_id,
      establishment_name: venue?.name,
      sport: venue?.sport,
      booking_group_id: (row as { booking_group_id?: string }).booking_group_id,
      date: toDateString((row as { date: string | null }).date),
      start_time: (row as { start_time: string }).start_time,
      end_time: (row as { end_time: string }).end_time,
      player_name: (row as { player_name?: string }).player_name,
      player_email: (row as { player_email?: string }).player_email,
      user_id: (row as { user_id?: string | null }).user_id ?? null,
      players_count: (row as { players_count?: number }).players_count,
      court_subtotal: Number((row as { court_subtotal?: number }).court_subtotal ?? 0),
      booking_fee: Number((row as { booking_fee?: number }).booking_fee ?? 0),
      total_cost: Number((row as { total_cost?: number }).total_cost ?? 0),
      status: (row as { status: Booking["status"] }).status,
      notes: (row as { notes?: string }).notes,
      admin_note: (row as { admin_note?: string }).admin_note,
      admin_note_updated_by_user_id: (row as { admin_note_updated_by_user_id?: string }).admin_note_updated_by_user_id,
      admin_note_updated_by_name: (row as { admin_note_updated_by_name?: string }).admin_note_updated_by_name,
      admin_note_updated_at: (row as { admin_note_updated_at?: string }).admin_note_updated_at,
      created_date: toIsoString((row as { created_at: string | null }).created_at),
    };
  });
}

export async function listVenueClosures(): Promise<VenueClosure[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("venue_closures").select("*");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...(row as VenueClosure),
    date: toDateString((row as { date: string | null }).date),
    created_at: toIsoString((row as { created_at: string | null }).created_at),
  }));
}

export async function listCourtClosures(): Promise<CourtClosure[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("court_closures").select("*");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...(row as CourtClosure),
    date: toDateString((row as { date: string | null }).date),
    created_at: toIsoString((row as { created_at: string | null }).created_at),
  }));
}

export async function listCourtReviews(): Promise<CourtReview[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("court_reviews").select("*");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...(row as CourtReview),
    booking_id: (row as { booking_id: string }).booking_id,
    created_at: toIsoString((row as { created_at: string | null }).created_at),
    updated_at: toIsoString((row as { updated_at: string | null }).updated_at),
    flagged_at: (row as { flagged_at?: string | null }).flagged_at ?? undefined,
  }));
}

export async function listTournaments(): Promise<Tournament[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("tournaments").select("*");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...(row as Tournament),
    date: toDateString((row as { date: string | null }).date),
  }));
}

export async function listTournamentRegistrations(): Promise<TournamentRegistration[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("tournament_registrations").select("*");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...(row as TournamentRegistration),
    created_date: toIsoString((row as { created_at: string | null }).created_at),
  }));
}

export async function listOpenPlay(): Promise<OpenPlaySession[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from("open_play_sessions").select("*");
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...(row as OpenPlaySession),
    date: toDateString((row as { date: string | null }).date),
  }));
}

export async function insertRow<T extends Record<string, unknown>>(
  table: string,
  payload: T,
) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from(table).insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateRow<T extends Record<string, unknown>>(
  table: string,
  id: string,
  patch: Partial<T>,
) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from(table)
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteRow(table: string, id: string) {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) throw error;
}

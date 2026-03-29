import { createSupabaseServerClient } from "@/lib/supabase/server";
import { reviewSummaryForVenue } from "@/lib/review-summary";
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

function mapCourtRow(row: unknown): Court {
  const record = row as {
    id: string;
    venue_id: string;
    name: string;
    status: Court["status"];
    type: Court["type"];
    surface: Court["surface"];
    gallery_urls?: string[];
    description?: string;
    venues?: Venue | null;
  };
  const venue = record.venues;
  const windows = venue?.hourly_rate_windows ?? [];
  const span = pricingSpanFromRanges(windows);
  return {
    id: record.id,
    venue_id: record.venue_id,
    name: record.name,
    status: record.status,
    type: record.type,
    surface: record.surface,
    gallery_urls: record.gallery_urls ?? [],
    description: record.description,
    location: venue?.location ?? "",
    sport: venue?.sport ?? "pickleball",
    image_url: venue?.image_url ?? "",
    hourly_rate_windows: windows,
    amenities: venue?.amenities ?? [],
    available_hours: span ?? { open: "07:00", close: "22:00" },
    establishment_name: venue?.name,
    contact_phone: venue?.contact_phone,
    facebook_url: venue?.facebook_url,
    instagram_url: venue?.instagram_url,
    map_latitude: venue?.map_latitude,
    map_longitude: venue?.map_longitude,
  };
}

function mapBookingRow(row: unknown): Booking {
  const record = row as {
    id: string;
    court_id: string;
    booking_group_id?: string;
    date: string | null;
    start_time: string;
    end_time: string;
    player_name?: string;
    player_email?: string;
    user_id?: string | null;
    players_count?: number;
    court_subtotal?: number;
    booking_fee?: number;
    total_cost?: number;
    status: Booking["status"];
    notes?: string;
    admin_note?: string;
    admin_note_updated_by_user_id?: string;
    admin_note_updated_by_name?: string;
    admin_note_updated_at?: string;
    created_at: string | null;
    courts?: { name?: string; venue_id?: string; venues?: Venue | null } | null;
  };
  const court = record.courts;
  const venue = court?.venues ?? null;
  return {
    id: record.id,
    court_id: record.court_id,
    court_name: court?.name,
    venue_id: court?.venue_id,
    establishment_name: venue?.name,
    sport: venue?.sport,
    booking_group_id: record.booking_group_id,
    date: toDateString(record.date),
    start_time: record.start_time,
    end_time: record.end_time,
    player_name: record.player_name,
    player_email: record.player_email,
    user_id: record.user_id ?? null,
    players_count: record.players_count,
    court_subtotal: Number(record.court_subtotal ?? 0),
    booking_fee: Number(record.booking_fee ?? 0),
    total_cost: Number(record.total_cost ?? 0),
    status: record.status,
    notes: record.notes,
    admin_note: record.admin_note,
    admin_note_updated_by_user_id: record.admin_note_updated_by_user_id,
    admin_note_updated_by_name: record.admin_note_updated_by_name,
    admin_note_updated_at: record.admin_note_updated_at,
    created_date: toIsoString(record.created_at),
  };
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
  return (data ?? []).map(mapCourtRow);
}

export async function getCourtById(id: string): Promise<Court | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("courts")
    .select("*, venues(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapCourtRow(data) : null;
}

export async function listCourtsByVenue(venueId: string): Promise<Court[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("courts")
    .select("*, venues(*)")
    .eq("venue_id", venueId);
  if (error) throw error;
  return (data ?? []).map(mapCourtRow);
}

export async function listBookings(): Promise<Booking[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("*, courts(id,name,venue_id,venues(id,name,sport))");
  if (error) throw error;
  return (data ?? []).map(mapBookingRow);
}

export async function getBookingById(id: string): Promise<Booking | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("*, courts(id,name,venue_id,venues(id,name,sport))")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapBookingRow(data) : null;
}

export async function hasActiveConfirmedBookingsForCourt(courtId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("court_id", courtId)
    .eq("status", "confirmed");
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function hasConfirmedBookingConflictForCourt(
  courtId: string,
  date: string,
  startTime: string,
  endTime: string,
): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .eq("court_id", courtId)
    .eq("date", date)
    .eq("status", "confirmed")
    .lt("start_time", endTime)
    .gt("end_time", startTime);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function hasConfirmedBookingConflictForVenue(
  venueId: string,
  date: string,
  startTime: string,
  endTime: string,
): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data: courtRows, error: courtError } = await supabase
    .from("courts")
    .select("id")
    .eq("venue_id", venueId);
  if (courtError) throw courtError;
  const courtIds = (courtRows ?? []).map((row) => (row as { id: string }).id);
  if (courtIds.length === 0) return false;

  const { count, error } = await supabase
    .from("bookings")
    .select("id", { count: "exact", head: true })
    .in("court_id", courtIds)
    .eq("date", date)
    .eq("status", "confirmed")
    .lt("start_time", endTime)
    .gt("end_time", startTime);
  if (error) throw error;
  return (count ?? 0) > 0;
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

export async function listVenueClosuresByVenue(
  venueId: string,
  date?: string,
): Promise<VenueClosure[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from("venue_closures").select("*").eq("venue_id", venueId);
  if (date) {
    query = query.eq("date", date);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...(row as VenueClosure),
    date: toDateString((row as { date: string | null }).date),
    created_at: toIsoString((row as { created_at: string | null }).created_at),
  }));
}

export async function getVenueClosureById(
  venueId: string,
  closureId: string,
): Promise<VenueClosure | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("venue_closures")
    .select("*")
    .eq("venue_id", venueId)
    .eq("id", closureId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    ...(data as VenueClosure),
    date: toDateString((data as { date: string | null }).date),
    created_at: toIsoString((data as { created_at: string | null }).created_at),
  };
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

export async function listCourtClosuresByCourt(
  courtId: string,
  date?: string,
): Promise<CourtClosure[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase.from("court_closures").select("*").eq("court_id", courtId);
  if (date) {
    query = query.eq("date", date);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...(row as CourtClosure),
    date: toDateString((row as { date: string | null }).date),
    created_at: toIsoString((row as { created_at: string | null }).created_at),
  }));
}

export async function getCourtClosureById(
  courtId: string,
  closureId: string,
): Promise<CourtClosure | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("court_closures")
    .select("*")
    .eq("court_id", courtId)
    .eq("id", closureId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    ...(data as CourtClosure),
    date: toDateString((data as { date: string | null }).date),
    created_at: toIsoString((data as { created_at: string | null }).created_at),
  };
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

export async function listCourtReviewsByVenue(venueId: string): Promise<CourtReview[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("court_reviews")
    .select("*")
    .eq("venue_id", venueId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...(row as CourtReview),
    booking_id: (row as { booking_id: string }).booking_id,
    created_at: toIsoString((row as { created_at: string | null }).created_at),
    updated_at: toIsoString((row as { updated_at: string | null }).updated_at),
    flagged_at: (row as { flagged_at?: string | null }).flagged_at ?? undefined,
  }));
}

export async function hasReviewForBooking(bookingId: string): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { count, error } = await supabase
    .from("court_reviews")
    .select("id", { count: "exact", head: true })
    .eq("booking_id", bookingId);
  if (error) throw error;
  return (count ?? 0) > 0;
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

export async function getTournamentById(id: string): Promise<Tournament | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tournaments")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    ...(data as Tournament),
    date: toDateString((data as { date: string | null }).date),
  };
}

export async function getCourtWithReviewSummary(id: string): Promise<Court | null> {
  const court = await getCourtById(id);
  if (!court) return null;
  const reviews = await listCourtReviewsByVenue(court.venue_id);
  return {
    ...court,
    review_summary: reviewSummaryForVenue(court.venue_id, reviews),
  };
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

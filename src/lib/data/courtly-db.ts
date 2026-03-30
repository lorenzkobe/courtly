import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { reviewSummaryForVenue } from "@/lib/review-summary";
import { pricingSpanFromRanges } from "@/lib/venue-price-ranges";
import type {
  Booking,
  Court,
  CourtSport,
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

/** Courts/venue embed + optional `profiles.mobile_number` (same query as booking). */
const BOOKING_SELECT_WITH_COURTS_AND_PROFILE =
  "*, courts(id,name,venue_id,venues(id,name,sport)), profiles!bookings_user_id_fkey(mobile_number)";

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
    profiles?: { mobile_number?: string | null } | null;
  };
  const court = record.courts;
  const venue = court?.venues ?? null;

  let player_mobile_number: string | null | undefined;
  if (Object.prototype.hasOwnProperty.call(record, "profiles")) {
    const prof = record.profiles;
    if (prof == null) {
      player_mobile_number = null;
    } else {
      const raw = prof.mobile_number;
      player_mobile_number =
        typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
    }
  }

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
    ...(player_mobile_number !== undefined ? { player_mobile_number } : {}),
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

export async function listVenuesByIds(venueIds: string[]): Promise<Venue[]> {
  if (venueIds.length === 0) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("venues")
    .select("*")
    .in("id", venueIds);
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

export async function getVenueById(venueId: string): Promise<Venue | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("venues")
    .select("*")
    .eq("id", venueId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const v = data as Venue;
  return {
    ...v,
    hourly_rate_windows: v.hourly_rate_windows ?? [],
    created_at: toIsoString((data as { created_at: string | null }).created_at),
  };
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

export async function listManagedUsersByIds(userIds: string[]): Promise<ManagedUser[]> {
  if (userIds.length === 0) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, full_name, first_name, last_name, birthdate, mobile_number, role, is_active, created_at",
    )
    .in("id", userIds);
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

export async function listVenueAdminAssignmentsByAdminUser(
  adminUserId: string,
): Promise<VenueAdminAssignment[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("venue_admin_assignments")
    .select("*")
    .eq("admin_user_id", adminUserId);
  if (error) throw error;
  return (data ?? []) as VenueAdminAssignment[];
}

export async function listVenueAdminAssignmentsByVenue(
  venueId: string,
): Promise<VenueAdminAssignment[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("venue_admin_assignments")
    .select("*")
    .eq("venue_id", venueId);
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

type ListCourtsDirectoryParams = {
  status?: Court["status"];
  sport?: CourtSport;
  venueStatus?: Venue["status"];
  venueIds?: string[];
  courtIds?: string[];
};

/**
 * Scoped directory query with venue join filters (sport, venue status, ids).
 */
export async function listCourtsDirectory(
  params: ListCourtsDirectoryParams,
): Promise<Court[]> {
  if (params.courtIds && params.courtIds.length === 0) return [];
  if (params.venueIds && params.venueIds.length === 0) return [];

  const supabase = await createSupabaseServerClient();
  let query = supabase.from("courts").select("*, venues!inner(*)");
  if (params.status) {
    query = query.eq("status", params.status);
  }
  if (params.sport) {
    query = query.eq("venues.sport", params.sport);
  }
  if (params.venueStatus) {
    query = query.eq("venues.status", params.venueStatus);
  }
  if (params.venueIds && params.venueIds.length > 0) {
    query = query.in("venue_id", params.venueIds);
  }
  if (params.courtIds && params.courtIds.length > 0) {
    query = query.in("id", params.courtIds);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapCourtRow);
}

export async function listCourtsByIds(courtIds: string[]): Promise<Court[]> {
  if (courtIds.length === 0) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("courts")
    .select("*, venues(*)")
    .in("id", courtIds);
  if (error) throw error;
  return (data ?? []).map(mapCourtRow);
}

export async function listBookings(): Promise<Booking[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("bookings")
    .select(
      "*, courts(id,name,venue_id,venues(id,name,sport))",
    );
  if (error) throw error;
  return (data ?? []).map(mapBookingRow);
}

type ListBookingsFilteredParams = {
  courtIds?: string[];
  courtId?: string;
  date?: string;
  playerEmail?: string;
  bookingGroupId?: string;
};

type PaginationParams = {
  offset: number;
  limit: number;
};

type AutoCompletionBookingRow = {
  id: string;
  booking_group_id: string | null;
  court_id: string;
  user_id: string | null;
  player_email: string | null;
  date: string;
  end_time: string;
};

export async function listBookingsFiltered(
  params: ListBookingsFilteredParams,
): Promise<Booking[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("bookings")
    .select(BOOKING_SELECT_WITH_COURTS_AND_PROFILE)
    .order("created_at", { ascending: false });

  if (params.courtId) {
    query = query.eq("court_id", params.courtId);
  }
  if (params.date) {
    query = query.eq("date", params.date);
  }
  if (params.playerEmail) {
    query = query.eq("player_email", params.playerEmail);
  }
  if (params.bookingGroupId) {
    query = query.eq("booking_group_id", params.bookingGroupId);
  }
  if (params.courtIds && params.courtIds.length > 0) {
    query = query.in("court_id", params.courtIds);
  }
  if (params.courtIds && params.courtIds.length === 0) {
    return [];
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapBookingRow);
}

export async function listBookingsFilteredPage(
  params: ListBookingsFilteredParams & PaginationParams,
): Promise<{
  items: Booking[];
  hasMore: boolean;
}> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("bookings")
    .select(BOOKING_SELECT_WITH_COURTS_AND_PROFILE)
    .order("created_at", { ascending: false });

  if (params.courtId) {
    query = query.eq("court_id", params.courtId);
  }
  if (params.date) {
    query = query.eq("date", params.date);
  }
  if (params.playerEmail) {
    query = query.eq("player_email", params.playerEmail);
  }
  if (params.bookingGroupId) {
    query = query.eq("booking_group_id", params.bookingGroupId);
  }
  if (params.courtIds && params.courtIds.length > 0) {
    query = query.in("court_id", params.courtIds);
  }
  if (params.courtIds && params.courtIds.length === 0) {
    return { items: [], hasMore: false };
  }

  const start = Math.max(0, params.offset);
  const end = start + Math.max(1, params.limit) + 1 - 1;
  const { data, error } = await query.range(start, end);
  if (error) throw error;
  const list = (data ?? []).map(mapBookingRow);
  const hasMore = list.length > params.limit;
  return {
    items: hasMore ? list.slice(0, params.limit) : list,
    hasMore,
  };
}

type ListRevenueBookingsParams = {
  courtIds?: string[];
  dateFrom?: string | null;
  dateTo?: string | null;
};

/** Returns only billable statuses for revenue pages. */
export async function listRevenueBookings(
  params: ListRevenueBookingsParams,
): Promise<Booking[]> {
  if (params.courtIds && params.courtIds.length === 0) return [];
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("bookings")
    .select("*, courts(id,name,venue_id,venues(id,name,sport))")
    .in("status", ["confirmed", "completed"]);

  if (params.courtIds && params.courtIds.length > 0) {
    query = query.in("court_id", params.courtIds);
  }
  if (params.dateFrom) {
    query = query.gte("date", params.dateFrom);
  }
  if (params.dateTo) {
    query = query.lte("date", params.dateTo);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapBookingRow);
}

export async function listCourtIdsByVenueIds(venueIds: string[]): Promise<string[]> {
  if (venueIds.length === 0) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("courts")
    .select("id")
    .in("venue_id", venueIds);
  if (error) throw error;
  return (data ?? []).map((row) => (row as { id: string }).id);
}

export async function listBookingsByCourtOnDate(
  courtId: string,
  date: string,
): Promise<Booking[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("*, courts(id,name,venue_id,venues(id,name,sport))")
    .eq("court_id", courtId)
    .eq("date", date);
  if (error) throw error;
  return (data ?? []).map(mapBookingRow);
}

export async function listBookingsByIds(bookingIds: string[]): Promise<Booking[]> {
  if (bookingIds.length === 0) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("*, courts(id,name,venue_id,venues(id,name,sport))")
    .in("id", bookingIds);
  if (error) throw error;
  return (data ?? []).map(mapBookingRow);
}

export async function listBookingsByIdsAdmin(bookingIds: string[]): Promise<Booking[]> {
  if (bookingIds.length === 0) return [];
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("*, courts(id,name,venue_id,venues(id,name,sport))")
    .in("id", bookingIds);
  if (error) throw error;
  return (data ?? []).map(mapBookingRow);
}

export async function listBookingsByPlayerOnDate(
  playerEmail: string,
  date: string,
  sport?: CourtSport | null,
): Promise<Booking[]> {
  const supabase = await createSupabaseServerClient();
  const query = supabase
    .from("bookings")
    .select("*, courts(id,name,venue_id,venues(id,name,sport))")
    .eq("player_email", playerEmail)
    .eq("date", date)
    .order("created_at", { ascending: false });
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data ?? []).map(mapBookingRow);
  if (!sport) return rows;
  return rows.filter((booking) => booking.sport === sport);
}

export async function getBookingById(id: string): Promise<Booking | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("bookings")
    .select(BOOKING_SELECT_WITH_COURTS_AND_PROFILE)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapBookingRow(data) : null;
}

export async function listConfirmedBookingsForAutoCompletion(
  params: {
    upToDate: string;
    limit: number;
  },
): Promise<AutoCompletionBookingRow[]> {
  const supabase = createSupabaseAdminClient();
  const safeLimit = Math.max(1, Math.min(params.limit, 1000));
  const { data, error } = await supabase
    .from("bookings")
    .select("id, booking_group_id, court_id, user_id, player_email, date, end_time")
    .eq("status", "confirmed")
    .lte("date", params.upToDate)
    .order("date", { ascending: true })
    .order("end_time", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(safeLimit);
  if (error) throw error;
  return (data ?? []) as AutoCompletionBookingRow[];
}

export async function listConfirmedBookingsByGroupIds(
  bookingGroupIds: string[],
): Promise<AutoCompletionBookingRow[]> {
  if (bookingGroupIds.length === 0) return [];
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("id, booking_group_id, court_id, user_id, player_email, date, end_time")
    .eq("status", "confirmed")
    .in("booking_group_id", bookingGroupIds)
    .order("date", { ascending: true })
    .order("end_time", { ascending: true });
  if (error) throw error;
  return (data ?? []) as AutoCompletionBookingRow[];
}

export async function markBookingsCompletedByIds(
  bookingIds: string[],
): Promise<Array<{ id: string; booking_group_id: string | null; court_id: string; user_id: string | null }>> {
  if (bookingIds.length === 0) return [];
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("bookings")
    .update({ status: "completed" } as never)
    .eq("status", "confirmed")
    .in("id", bookingIds)
    .select("id, booking_group_id, court_id, user_id");
  if (error) throw error;
  return (data ?? []) as Array<{
    id: string;
    booking_group_id: string | null;
    court_id: string;
    user_id: string | null;
  }>;
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

export async function hasConfirmedBookingsForVenue(venueId: string): Promise<boolean> {
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
    .eq("status", "confirmed");
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

export async function listFlaggedCourtReviews(): Promise<CourtReview[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("court_reviews")
    .select("*")
    .eq("flagged", true)
    .order("flagged_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...(row as CourtReview),
    booking_id: (row as { booking_id: string }).booking_id,
    created_at: toIsoString((row as { created_at: string | null }).created_at),
    updated_at: toIsoString((row as { updated_at: string | null }).updated_at),
    flagged_at: (row as { flagged_at?: string | null }).flagged_at ?? undefined,
  }));
}

export async function listFlaggedCourtReviewsPage(params: PaginationParams): Promise<{
  items: CourtReview[];
  hasMore: boolean;
}> {
  const supabase = await createSupabaseServerClient();
  const start = Math.max(0, params.offset);
  const end = start + Math.max(1, params.limit) + 1 - 1;
  const { data, error } = await supabase
    .from("court_reviews")
    .select("*")
    .eq("flagged", true)
    .order("flagged_at", { ascending: false })
    .range(start, end);
  if (error) throw error;
  const list = (data ?? []).map((row) => ({
    ...(row as CourtReview),
    booking_id: (row as { booking_id: string }).booking_id,
    created_at: toIsoString((row as { created_at: string | null }).created_at),
    updated_at: toIsoString((row as { updated_at: string | null }).updated_at),
    flagged_at: (row as { flagged_at?: string | null }).flagged_at ?? undefined,
  }));
  const hasMore = list.length > params.limit;
  return {
    items: hasMore ? list.slice(0, params.limit) : list,
    hasMore,
  };
}

export async function listReviewSummaryByVenueIds(
  venueIds: string[],
): Promise<Map<string, { average_rating: number; review_count: number }>> {
  const out = new Map<string, { average_rating: number; review_count: number }>();
  if (venueIds.length === 0) return out;
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("court_reviews")
    .select("venue_id, rating")
    .in("venue_id", venueIds);
  if (error) throw error;

  const rollups = new Map<string, { sum: number; count: number }>();
  for (const row of (data ?? []) as Array<{ venue_id: string; rating: number }>) {
    const cur = rollups.get(row.venue_id) ?? { sum: 0, count: 0 };
    cur.sum += Number(row.rating ?? 0);
    cur.count += 1;
    rollups.set(row.venue_id, cur);
  }
  for (const [venueId, agg] of rollups) {
    out.set(venueId, {
      average_rating: agg.count > 0 ? Number((agg.sum / agg.count).toFixed(1)) : 0,
      review_count: agg.count,
    });
  }
  return out;
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

export async function getReviewByUserForVenue(
  userId: string,
  venueId: string,
): Promise<CourtReview | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("court_reviews")
    .select("*")
    .eq("user_id", userId)
    .eq("venue_id", venueId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    ...(data as CourtReview),
    booking_id: (data as { booking_id: string }).booking_id,
    created_at: toIsoString((data as { created_at: string | null }).created_at),
    updated_at: toIsoString((data as { updated_at: string | null }).updated_at),
    flagged_at: (data as { flagged_at?: string | null }).flagged_at ?? undefined,
  };
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

export async function listOpenTournaments(
  sport?: CourtSport | null,
  limit = 2,
): Promise<Tournament[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("tournaments")
    .select("*")
    .eq("status", "registration_open")
    .order("date", { ascending: false })
    .limit(limit);
  if (sport) {
    query = query.eq("sport", sport);
  }
  const { data, error } = await query;
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

export async function listTournamentRegistrationsByPlayer(
  playerEmail: string,
): Promise<TournamentRegistration[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("tournament_registrations")
    .select("*")
    .eq("player_email", playerEmail);
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...(row as TournamentRegistration),
    created_date: toIsoString((row as { created_at: string | null }).created_at),
  }));
}

export async function listTournamentRegistrationsByPlayerPage(
  playerEmail: string,
  params: PaginationParams,
): Promise<{
  items: TournamentRegistration[];
  hasMore: boolean;
}> {
  const supabase = await createSupabaseServerClient();
  const start = Math.max(0, params.offset);
  const end = start + Math.max(1, params.limit) + 1 - 1;
  const { data, error } = await supabase
    .from("tournament_registrations")
    .select("*")
    .eq("player_email", playerEmail)
    .order("created_at", { ascending: false })
    .range(start, end);
  if (error) throw error;
  const list = (data ?? []).map((row) => ({
    ...(row as TournamentRegistration),
    created_date: toIsoString((row as { created_at: string | null }).created_at),
  }));
  const hasMore = list.length > params.limit;
  return {
    items: hasMore ? list.slice(0, params.limit) : list,
    hasMore,
  };
}

export async function listVenuesPage(params: PaginationParams): Promise<{
  items: Venue[];
  hasMore: boolean;
}> {
  const supabase = await createSupabaseServerClient();
  const start = Math.max(0, params.offset);
  const end = start + Math.max(1, params.limit) + 1 - 1;
  const { data, error } = await supabase
    .from("venues")
    .select("*")
    .order("created_at", { ascending: false })
    .range(start, end);
  if (error) throw error;
  const list = (data ?? []).map((row) => {
    const v = row as Venue;
    return {
      ...v,
      hourly_rate_windows: v.hourly_rate_windows ?? [],
      created_at: toIsoString((row as { created_at: string | null }).created_at),
    };
  });
  const hasMore = list.length > params.limit;
  return {
    items: hasMore ? list.slice(0, params.limit) : list,
    hasMore,
  };
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

export async function listOpenPlayByStatus(
  status: OpenPlaySession["status"],
  sport?: CourtSport | null,
  limit?: number,
): Promise<OpenPlaySession[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("open_play_sessions")
    .select("*")
    .eq("status", status)
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });
  if (sport) {
    query = query.eq("sport", sport);
  }
  if (typeof limit === "number" && limit > 0) {
    query = query.limit(limit);
  }
  const { data, error } = await query;
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

export async function insertRows<T extends Record<string, unknown>>(
  table: string,
  payloads: T[],
) {
  if (payloads.length === 0) return [];
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.from(table).insert(payloads).select();
  if (error) throw error;
  return data ?? [];
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

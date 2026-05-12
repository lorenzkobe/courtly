import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { OPEN_PLAY_COMMENT_EDIT_WINDOW_MS } from "@/lib/open-play/open-play-comment-edit";
import { computeOpenPlayLifecycleTargetStatus } from "@/lib/open-play/lifecycle";
import { reviewSummaryForVenue } from "@/lib/review-summary";
import { pricingSpanFromRanges } from "@/lib/venue-price-ranges";
import type {
  Booking,
  Court,
  CourtSport,
  CourtClosure,
  CourtReview,
  ManagedUser,
  OpenPlayComment,
  OpenPlayJoinRequest,
  OpenPlaySession,
  Tournament,
  TournamentRegistration,
  Venue,
  VenueAdminAssignment,
  VenueRequest,
  VenueClosure,
  PaymentTransaction,
  VenueBillingCycle,
  BillingCycleStatus,
  PlatformPaymentMethod,
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
    venue_photo_urls: venue?.photo_urls ?? [],
    description: record.description,
    location: venue?.location ?? "",
    sport: venue?.sport ?? "pickleball",
    image_url: venue?.photo_urls?.[0] ?? "",
    hourly_rate_windows: windows,
    amenities: venue?.amenities ?? [],
    available_hours: span ?? { open: "07:00", close: "22:00" },
    establishment_name: venue?.name,
    contact_phone: venue?.contact_phone,
    facebook_url: venue?.facebook_url,
    instagram_url: venue?.instagram_url,
    map_latitude: venue?.map_latitude,
    map_longitude: venue?.map_longitude,
    accepts_gcash: venue?.accepts_gcash,
    gcash_account_name: venue?.gcash_account_name,
    gcash_account_number: venue?.gcash_account_number,
    accepts_maya: venue?.accepts_maya,
    maya_account_name: venue?.maya_account_name,
    maya_account_number: venue?.maya_account_number,
  };
}

/** Courts/venue embed + optional `profiles.mobile_number` (same query as booking). */
const BOOKING_SELECT_WITH_COURTS_AND_PROFILE =
  "*, courts(id,name,venue_id,venues(id,name,sport)), profiles!bookings_user_id_fkey(mobile_number)";

function mapBookingRow(row: unknown): Booking {
  const record = row as {
    id: string;
    booking_number?: string | null;
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
    hold_expires_at?: string | null;
    payment_provider?: string | null;
    payment_link_id?: string | null;
    payment_link_url?: string | null;
    payment_link_created_at?: string | null;
    payment_attempt_count?: number | null;
    paid_at?: string | null;
    payment_failed_at?: string | null;
    payment_reference_id?: string | null;
    payment_submitted_method?: "gcash" | "maya" | null;
    payment_submitted_at?: string | null;
    payment_proof_url?: string | null;
    payment_proof_mime_type?: string | null;
    payment_proof_bytes?: number | null;
    payment_proof_width?: number | null;
    payment_proof_height?: number | null;
    cancel_reason?: string | null;
    refund_required?: boolean | null;
    refunded_at?: string | null;
    notes?: string;
    admin_note?: string;
    admin_note_updated_by_user_id?: string;
    admin_note_updated_by_name?: string;
    admin_note_updated_at?: string;
    status_updated_by_user_id?: string | null;
    status_updated_by_name?: string | null;
    status_updated_at?: string | null;
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
    booking_number: record.booking_number ?? undefined,
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
    hold_expires_at: record.hold_expires_at ?? null,
    payment_provider: record.payment_provider === "manual" ? "manual" : null,
    payment_link_id: record.payment_link_id ?? null,
    payment_link_url: record.payment_link_url ?? null,
    payment_link_created_at: record.payment_link_created_at ?? null,
    payment_attempt_count: record.payment_attempt_count ?? 0,
    paid_at: record.paid_at ?? null,
    payment_failed_at: record.payment_failed_at ?? null,
    payment_reference_id: record.payment_reference_id ?? null,
    payment_submitted_method:
      record.payment_submitted_method === "gcash" || record.payment_submitted_method === "maya"
        ? record.payment_submitted_method
        : null,
    payment_submitted_at: record.payment_submitted_at ?? null,
    payment_proof_url: record.payment_proof_url ?? null,
    payment_proof_mime_type: record.payment_proof_mime_type ?? null,
    payment_proof_bytes: record.payment_proof_bytes ?? null,
    payment_proof_width: record.payment_proof_width ?? null,
    payment_proof_height: record.payment_proof_height ?? null,
    cancel_reason: record.cancel_reason ?? null,
    refund_required: record.refund_required ?? false,
    refunded_at: record.refunded_at ?? null,
    notes: record.notes,
    admin_note: record.admin_note,
    admin_note_updated_by_user_id: record.admin_note_updated_by_user_id,
    admin_note_updated_by_name: record.admin_note_updated_by_name,
    admin_note_updated_at: record.admin_note_updated_at,
    status_updated_by_user_id: record.status_updated_by_user_id ?? null,
    status_updated_by_name: record.status_updated_by_name ?? null,
    status_updated_at: record.status_updated_at ?? null,
    created_date: toIsoString(record.created_at),
  };
}

function mapPaymentTransactionRow(row: unknown): PaymentTransaction {
  const record = row as Record<string, unknown>;
  return {
    id: String(record.id ?? ""),
    provider: String(record.provider ?? ""),
    booking_id: String(record.booking_id ?? ""),
    booking_group_id: (record.booking_group_id as string | null | undefined) ?? null,
    payment_link_id: (record.payment_link_id as string | null | undefined) ?? null,
    provider_event_id: (record.provider_event_id as string | null | undefined) ?? null,
    event_type: (record.event_type as string | null | undefined) ?? null,
    provider_payment_id: (record.provider_payment_id as string | null | undefined) ?? null,
    provider_payment_intent_id:
      (record.provider_payment_intent_id as string | null | undefined) ?? null,
    provider_balance_transaction_id:
      (record.provider_balance_transaction_id as string | null | undefined) ?? null,
    provider_external_reference_number:
      (record.provider_external_reference_number as string | null | undefined) ?? null,
    amount: (record.amount as number | null | undefined) ?? null,
    currency: (record.currency as string | null | undefined) ?? null,
    fee: (record.fee as number | null | undefined) ?? null,
    net_amount: (record.net_amount as number | null | undefined) ?? null,
    source_id: (record.source_id as string | null | undefined) ?? null,
    source_type: (record.source_type as string | null | undefined) ?? null,
    source_brand: (record.source_brand as string | null | undefined) ?? null,
    source_last4: (record.source_last4 as string | null | undefined) ?? null,
    source_country: (record.source_country as string | null | undefined) ?? null,
    source_provider_id: (record.source_provider_id as string | null | undefined) ?? null,
    refund_id: (record.refund_id as string | null | undefined) ?? null,
    refund_status: (record.refund_status as string | null | undefined) ?? null,
    refund_amount: (record.refund_amount as number | null | undefined) ?? null,
    refund_reason: (record.refund_reason as string | null | undefined) ?? null,
    refund_notes: (record.refund_notes as string | null | undefined) ?? null,
    trace_status: String(record.trace_status ?? ""),
    reconciled_by:
      ((record.reconciled_by as "webhook" | "manual_reconcile" | undefined) ?? "webhook"),
    trace_note: (record.trace_note as string | null | undefined) ?? null,
    provider_created_at: (record.provider_created_at as string | null | undefined) ?? null,
    provider_updated_at: (record.provider_updated_at as string | null | undefined) ?? null,
    paid_at: (record.paid_at as string | null | undefined) ?? null,
    refund_attempted_at: (record.refund_attempted_at as string | null | undefined) ?? null,
    refund_created_at: (record.refund_created_at as string | null | undefined) ?? null,
    raw_payload: (record.raw_payload as Record<string, unknown> | null | undefined) ?? null,
    created_at: toIsoString((record.created_at as string | null | undefined) ?? null),
  };
}

function mapOpenPlaySessionRow(row: unknown): OpenPlaySession {
  const record = row as {
    id: string;
    sport: CourtSport;
    title: string;
    date: string | null;
    start_time: string;
    end_time: string;
    skill_level: OpenPlaySession["skill_level"];
    location: string;
    booking_group_id?: string | null;
    court_id?: string | null;
    max_players: number;
    current_players: number;
    host_user_id?: string | null;
    host_name: string;
    host_email?: string | null;
    description?: string | null;
    fee?: number | null;
    price_per_player?: number | null;
    dupr_min?: number | null;
    dupr_max?: number | null;
    accepts_gcash?: boolean | null;
    gcash_account_name?: string | null;
    gcash_account_number?: string | null;
    accepts_maya?: boolean | null;
    maya_account_name?: string | null;
    maya_account_number?: string | null;
    status: OpenPlaySession["status"];
    courts?: {
      name?: string | null;
      venue_id?: string | null;
      venues?: { id: string; name: string; location: string } | null;
    } | null;
  };
  const court = record.courts ?? null;
  const venue = court?.venues ?? null;
  const price = Number(record.price_per_player ?? record.fee ?? 0);
  return {
    id: record.id,
    sport: record.sport,
    title: record.title,
    date: toDateString(record.date),
    start_time: record.start_time,
    end_time: record.end_time,
    skill_level: record.skill_level,
    location: venue?.location ?? record.location,
    booking_group_id: record.booking_group_id ?? null,
    court_id: record.court_id ?? undefined,
    max_players: record.max_players,
    current_players: record.current_players,
    host_user_id: record.host_user_id ?? null,
    host_name: record.host_name,
    host_email: record.host_email ?? undefined,
    description: record.description ?? undefined,
    fee: Number(record.fee ?? price),
    price_per_player: price,
    dupr_min: record.dupr_min ?? null,
    dupr_max: record.dupr_max ?? null,
    accepts_gcash: Boolean(record.accepts_gcash),
    gcash_account_name: record.gcash_account_name ?? null,
    gcash_account_number: record.gcash_account_number ?? null,
    accepts_maya: Boolean(record.accepts_maya),
    maya_account_name: record.maya_account_name ?? null,
    maya_account_number: record.maya_account_number ?? null,
    status: record.status,
    court_name: court?.name ?? null,
    venue_name: venue?.name ?? null,
    venue_id: venue?.id ?? court?.venue_id ?? null,
  };
}

function mapOpenPlayJoinRequestRow(row: unknown): OpenPlayJoinRequest {
  const record = row as {
    id: string;
    open_play_session_id: string;
    user_id: string;
    status: OpenPlayJoinRequest["status"];
    payment_lock_expires_at?: string | null;
    payment_method?: "gcash" | "maya" | null;
    payment_proof_url?: string | null;
    payment_proof_mime_type?: string | null;
    payment_proof_bytes?: number | null;
    payment_proof_width?: number | null;
    payment_proof_height?: number | null;
    payment_submitted_at?: string | null;
    join_note?: string | null;
    organizer_note?: string | null;
    decided_at?: string | null;
    decided_by_user_id?: string | null;
    created_at?: string | null;
    updated_at?: string | null;
    profiles?: {
      full_name?: string | null;
      dupr_rating?: number | null;
    } | null;
  };
  return {
    id: record.id,
    open_play_session_id: record.open_play_session_id,
    user_id: record.user_id,
    user_name: record.profiles?.full_name ?? null,
    user_email: null,
    user_dupr_rating:
      record.profiles?.dupr_rating == null ? null : Number(record.profiles.dupr_rating),
    status: record.status,
    payment_lock_expires_at: record.payment_lock_expires_at ?? null,
    payment_method: record.payment_method ?? null,
    payment_proof_url: record.payment_proof_url ?? null,
    payment_proof_mime_type: record.payment_proof_mime_type ?? null,
    payment_proof_bytes: record.payment_proof_bytes ?? null,
    payment_proof_width: record.payment_proof_width ?? null,
    payment_proof_height: record.payment_proof_height ?? null,
    payment_submitted_at: record.payment_submitted_at ?? null,
    join_note: record.join_note ?? null,
    organizer_note: record.organizer_note ?? null,
    decided_at: record.decided_at ?? null,
    decided_by_user_id: record.decided_by_user_id ?? null,
    created_at: toIsoString(record.created_at ?? null),
    updated_at: toIsoString(record.updated_at ?? null),
  };
}

function mapOpenPlayCommentRow(row: unknown): OpenPlayComment {
  const record = row as {
    id: string;
    open_play_session_id: string;
    user_id: string;
    comment: string;
    created_at: string | null;
    updated_at: string | null;
    edited_at?: string | null;
    profiles?: { full_name?: string | null } | null;
  };
  return {
    id: record.id,
    open_play_session_id: record.open_play_session_id,
    user_id: record.user_id,
    user_name: record.profiles?.full_name ?? null,
    comment: record.comment,
    created_at: toIsoString(record.created_at),
    updated_at: toIsoString(record.updated_at),
    edited_at: record.edited_at != null ? toIsoString(record.edited_at) : null,
  };
}

function mapVenueRequestRow(row: unknown): VenueRequest {
  const record = row as VenueRequest;
  return {
    ...record,
    hourly_rate_windows: record.hourly_rate_windows ?? [],
    amenities: record.amenities ?? [],
    created_at: toIsoString((row as { created_at: string | null }).created_at),
    updated_at: toIsoString((row as { updated_at: string | null }).updated_at),
    accepts_gcash: Boolean((row as { accepts_gcash?: unknown }).accepts_gcash),
    gcash_account_name:
      ((row as { gcash_account_name?: string | null }).gcash_account_name ?? undefined) ||
      undefined,
    gcash_account_number:
      ((row as { gcash_account_number?: string | null }).gcash_account_number ?? undefined) ||
      undefined,
    accepts_maya: Boolean((row as { accepts_maya?: unknown }).accepts_maya),
    maya_account_name:
      ((row as { maya_account_name?: string | null }).maya_account_name ?? undefined) ||
      undefined,
    maya_account_number:
      ((row as { maya_account_number?: string | null }).maya_account_number ?? undefined) ||
      undefined,
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
      accepts_gcash: Boolean((row as { accepts_gcash?: unknown }).accepts_gcash),
      gcash_account_name:
        ((row as { gcash_account_name?: string | null }).gcash_account_name ?? undefined) ||
        undefined,
      gcash_account_number:
        ((row as { gcash_account_number?: string | null }).gcash_account_number ?? undefined) ||
        undefined,
      accepts_maya: Boolean((row as { accepts_maya?: unknown }).accepts_maya),
      maya_account_name:
        ((row as { maya_account_name?: string | null }).maya_account_name ?? undefined) ||
        undefined,
      maya_account_number:
        ((row as { maya_account_number?: string | null }).maya_account_number ?? undefined) ||
        undefined,
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
      accepts_gcash: Boolean((row as { accepts_gcash?: unknown }).accepts_gcash),
      gcash_account_name:
        ((row as { gcash_account_name?: string | null }).gcash_account_name ?? undefined) ||
        undefined,
      gcash_account_number:
        ((row as { gcash_account_number?: string | null }).gcash_account_number ?? undefined) ||
        undefined,
      accepts_maya: Boolean((row as { accepts_maya?: unknown }).accepts_maya),
      maya_account_name:
        ((row as { maya_account_name?: string | null }).maya_account_name ?? undefined) ||
        undefined,
      maya_account_number:
        ((row as { maya_account_number?: string | null }).maya_account_number ?? undefined) ||
        undefined,
    };
  });
}

/** Parse `platform_settings.value` jsonb — matches superadmin booking-fee API shape `{ amount: number }`. */
function amountFromPlatformSettingsJson(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "object" && value !== null && "amount" in value) {
    const n = Number((value as { amount?: unknown }).amount);
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Reads `booking_fee_default` with the service role (same access as superadmin settings).
 * Typed `from("platform_settings")` can fail silently in some builds; mirror the superadmin route.
 */
export async function getPlatformDefaultBookingFeeAmount(): Promise<number> {
  const supabase = createSupabaseAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { data, error } = await db
    .from("platform_settings")
    .select("value")
    .eq("key", "booking_fee_default")
    .maybeSingle();
  if (error) {
    console.error("[courtly] getPlatformDefaultBookingFeeAmount", error.message);
    return 0;
  }
  return amountFromPlatformSettingsJson(data?.value);
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
    accepts_gcash: Boolean((data as { accepts_gcash?: unknown }).accepts_gcash),
    gcash_account_name:
      ((data as { gcash_account_name?: string | null }).gcash_account_name ?? undefined) ||
      undefined,
    gcash_account_number:
      ((data as { gcash_account_number?: string | null }).gcash_account_number ?? undefined) ||
      undefined,
    accepts_maya: Boolean((data as { accepts_maya?: unknown }).accepts_maya),
    maya_account_name:
      ((data as { maya_account_name?: string | null }).maya_account_name ?? undefined) ||
      undefined,
    maya_account_number:
      ((data as { maya_account_number?: string | null }).maya_account_number ?? undefined) ||
      undefined,
  };
}

export async function getVenueRequestById(requestId: string): Promise<VenueRequest | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("venue_requests")
    .select("*")
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapVenueRequestRow(data) : null;
}

export async function listVenueRequestsByRequester(
  userId: string,
): Promise<VenueRequest[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("venue_requests")
    .select("*")
    .eq("requested_by", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapVenueRequestRow);
}

export async function listVenueRequests(params?: {
  statuses?: VenueRequest["request_status"][];
}): Promise<VenueRequest[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("venue_requests")
    .select("*")
    .order("created_at", { ascending: false });
  if (params?.statuses && params.statuses.length > 0) {
    query = query.in("request_status", params.statuses);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapVenueRequestRow);
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

type ListBookingsFilteredParams = {
  courtIds?: string[];
  courtId?: string;
  date?: string;
  playerEmail?: string;
  bookingGroupId?: string;
  statuses?: Booking["status"][];
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
  if (params.statuses && params.statuses.length > 0) {
    query = query.in("status", params.statuses);
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
  if (params.statuses && params.statuses.length > 0) {
    query = query.in("status", params.statuses);
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

export async function deleteExpiredPendingPaymentBookings(params?: {
  playerEmail?: string;
  bookingGroupId?: string;
  bookingId?: string;
}): Promise<number> {
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("bookings")
    .delete()
    .eq("status", "pending_payment")
    .lte("hold_expires_at", new Date().toISOString());
  if (params?.playerEmail) {
    query = query.eq("player_email", params.playerEmail);
  }
  if (params?.bookingGroupId) {
    query = query.eq("booking_group_id", params.bookingGroupId);
  }
  if (params?.bookingId) {
    query = query.eq("id", params.bookingId);
  }
  const { data, error } = await query.select("id");
  if (error) throw error;
  return (data ?? []).length;
}

/** Hard-delete specific booking rows while they are still `pending_payment` (player cancel / cleanup). */
export async function deletePendingPaymentBookingsByIds(ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("bookings")
    .delete()
    .in("id", ids)
    .eq("status", "pending_payment")
    .select("id");
  if (error) throw error;
  return (data ?? []).map((row) => (row as { id: string }).id);
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

export async function getBookingByIdAdmin(id: string): Promise<Booking | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("bookings")
    .select(BOOKING_SELECT_WITH_COURTS_AND_PROFILE)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? mapBookingRow(data) : null;
}

export async function getBookingByPaymentLinkIdAdmin(
  paymentLinkId: string,
): Promise<Booking | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("bookings")
    .select(BOOKING_SELECT_WITH_COURTS_AND_PROFILE)
    .eq("payment_link_id", paymentLinkId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? mapBookingRow(data) : null;
}

export async function listBookingsByGroupIdAdmin(
  bookingGroupId: string,
): Promise<Booking[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("bookings")
    .select(BOOKING_SELECT_WITH_COURTS_AND_PROFILE)
    .eq("booking_group_id", bookingGroupId)
    .order("start_time", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapBookingRow);
}

export async function markPaymentWebhookEventProcessed(params: {
  provider: string;
  providerEventId: string;
  eventType: string;
  payload?: Record<string, unknown>;
}): Promise<boolean> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.from("payment_webhook_events").insert({
    provider: params.provider,
    provider_event_id: params.providerEventId,
    event_type: params.eventType,
    payload: params.payload ?? null,
  } as never);
  if (!error) return true;
  if (error.code === "23505") return false;
  throw error;
}

export type PaymentTransactionWrite = {
  provider: string;
  booking_id: string;
  booking_group_id?: string | null;
  payment_link_id?: string | null;
  provider_event_id?: string | null;
  event_type?: string | null;
  provider_payment_id?: string | null;
  provider_payment_intent_id?: string | null;
  provider_balance_transaction_id?: string | null;
  provider_external_reference_number?: string | null;
  amount?: number | null;
  currency?: string | null;
  fee?: number | null;
  net_amount?: number | null;
  source_id?: string | null;
  source_type?: string | null;
  source_brand?: string | null;
  source_last4?: string | null;
  source_country?: string | null;
  source_provider_id?: string | null;
  refund_id?: string | null;
  refund_status?: string | null;
  refund_amount?: number | null;
  refund_reason?: string | null;
  refund_notes?: string | null;
  trace_status: string;
  reconciled_by: "webhook" | "manual_reconcile";
  trace_note?: string | null;
  provider_created_at?: string | null;
  provider_updated_at?: string | null;
  paid_at?: string | null;
  refund_attempted_at?: string | null;
  refund_created_at?: string | null;
  raw_payload?: Record<string, unknown> | null;
};

export async function createPaymentTransactionAudit(
  input: PaymentTransactionWrite,
): Promise<PaymentTransaction | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("payment_transactions")
    .insert(input as never)
    .select("*")
    .maybeSingle();
  if (!error) return data ? mapPaymentTransactionRow(data) : null;
  if (error.code === "23505" && input.provider_event_id) {
    return null;
  }
  throw error;
}

export async function listPaymentTransactionsByBookingIdAdmin(
  bookingId: string,
): Promise<PaymentTransaction[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("payment_transactions")
    .select("*")
    .eq("booking_id", bookingId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapPaymentTransactionRow);
}

export async function listPaymentTransactionsByGroupIdAdmin(
  bookingGroupId: string,
): Promise<PaymentTransaction[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("payment_transactions")
    .select("*")
    .eq("booking_group_id", bookingGroupId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapPaymentTransactionRow);
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
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("bookings")
    .update({
      status: "completed",
      status_updated_by_user_id: null,
      status_updated_by_name: "System",
      status_updated_at: nowIso,
    } as never)
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

export type PendingConfirmationDeclineSeedRow = {
  id: string;
  booking_group_id: string | null;
  court_id: string;
  user_id: string | null;
  player_email: string | null;
  date: string;
  start_time: string;
};

export async function listPendingConfirmationBookingsForAutoDecline(params: {
  upToDate: string;
  limit: number;
}): Promise<PendingConfirmationDeclineSeedRow[]> {
  const supabase = createSupabaseAdminClient();
  const safeLimit = Math.max(1, Math.min(params.limit, 1000));
  const { data, error } = await supabase
    .from("bookings")
    .select("id, booking_group_id, court_id, user_id, player_email, date, start_time")
    .eq("status", "pending_confirmation")
    .lte("date", params.upToDate)
    .order("date", { ascending: true })
    .order("start_time", { ascending: true })
    .order("created_at", { ascending: true })
    .limit(safeLimit);
  if (error) throw error;
  return (data ?? []) as PendingConfirmationDeclineSeedRow[];
}

export async function markBookingsAutoDeclinedPendingConfirmationByIds(
  bookingIds: string[],
  cancelReason: string,
): Promise<Array<{ id: string }>> {
  if (bookingIds.length === 0) return [];
  const supabase = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("bookings")
    .update({
      status: "cancelled",
      cancel_reason: cancelReason,
      status_updated_by_user_id: null,
      status_updated_by_name: "System",
      status_updated_at: nowIso,
    } as never)
    .eq("status", "pending_confirmation")
    .in("id", bookingIds)
    .select("id");
  if (error) throw error;
  return (data ?? []) as Array<{ id: string }>;
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

function isActivePendingPaymentHold(
  booking: Pick<Booking, "status" | "hold_expires_at">,
  now = new Date(),
): boolean {
  if (booking.status !== "pending_payment") return false;
  if (!booking.hold_expires_at) return false;
  const holdUntil = new Date(booking.hold_expires_at);
  return holdUntil.getTime() > now.getTime();
}

export function isBlockingBookingNow(
  booking: Pick<Booking, "status" | "hold_expires_at">,
  now = new Date(),
): boolean {
  if (booking.status === "confirmed") return true;
  if (booking.status === "pending_confirmation") return true;
  return isActivePendingPaymentHold(booking, now);
}

export async function hasBlockingBookingConflictForCourt(
  courtId: string,
  date: string,
  startTime: string,
  endTime: string,
): Promise<boolean> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("bookings")
    .select("status, hold_expires_at, start_time, end_time")
    .eq("court_id", courtId)
    .eq("date", date)
    .in("status", ["confirmed", "pending_payment", "pending_confirmation"])
    .lt("start_time", endTime)
    .gt("end_time", startTime);
  if (error) throw error;
  const rows =
    (data ?? []) as Array<Pick<Booking, "status" | "hold_expires_at"> & { start_time: string; end_time: string }>;
  const now = new Date();
  return rows.some((row) => isBlockingBookingNow(row, now));
}

export async function listBlockingBookingsByCourtOnDate(
  courtId: string,
  date: string,
): Promise<Booking[]> {
  const rows = await listBookingsByCourtOnDate(courtId, date);
  const now = new Date();
  return rows.filter((booking) => isBlockingBookingNow(booking, now));
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
      accepts_gcash: Boolean((row as { accepts_gcash?: unknown }).accepts_gcash),
      gcash_account_name:
        ((row as { gcash_account_name?: string | null }).gcash_account_name ?? undefined) ||
        undefined,
      gcash_account_number:
        ((row as { gcash_account_number?: string | null }).gcash_account_number ?? undefined) ||
        undefined,
      accepts_maya: Boolean((row as { accepts_maya?: unknown }).accepts_maya),
      maya_account_name:
        ((row as { maya_account_name?: string | null }).maya_account_name ?? undefined) ||
        undefined,
      maya_account_number:
        ((row as { maya_account_number?: string | null }).maya_account_number ?? undefined) ||
        undefined,
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
  const { data, error } = await supabase
    .from("open_play_sessions")
    .select("*, courts(name,venue_id,venues(id,name,location))")
    .order("date", { ascending: true })
    .order("start_time", { ascending: true });
  if (error) throw error;
  const sessions = (data ?? []).map(mapOpenPlaySessionRow);
  return hydrateOpenPlayRegisteredCounts(sessions);
}

export async function listOpenPlayByStatus(
  status: OpenPlaySession["status"],
  sport?: CourtSport | null,
  limit?: number,
): Promise<OpenPlaySession[]> {
  const supabase = await createSupabaseServerClient();
  let query = supabase
    .from("open_play_sessions")
    .select("*, courts(name,venue_id,venues(id,name,location))")
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
  const sessions = (data ?? []).map(mapOpenPlaySessionRow);
  return hydrateOpenPlayRegisteredCounts(sessions);
}

async function hydrateOpenPlayRegisteredCounts(
  sessions: OpenPlaySession[],
): Promise<OpenPlaySession[]> {
  if (sessions.length === 0) return [];
  const sessionIds = sessions.map((session) => session.id);
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("open_play_join_requests")
    .select("open_play_session_id,status")
    .in("open_play_session_id", sessionIds);
  if (error) throw error;
  const consumingBySession = new Map<string, number>();
  const approvedBySession = new Map<string, number>();
  for (const row of data ?? []) {
    const record = row as { open_play_session_id: string; status: string };
    if (
      ["approved", "pending_approval", "payment_locked"].includes(record.status)
    ) {
      consumingBySession.set(
        record.open_play_session_id,
        (consumingBySession.get(record.open_play_session_id) ?? 0) + 1,
      );
    }
    if (record.status === "approved") {
      approvedBySession.set(
        record.open_play_session_id,
        (approvedBySession.get(record.open_play_session_id) ?? 0) + 1,
      );
    }
  }
  return sessions.map((session) => {
    const consuming = consumingBySession.get(session.id) ?? 0;
    const approvedOnly = approvedBySession.get(session.id) ?? 0;
    const statusValue = consuming >= session.max_players ? "full" : session.status;
    return {
      ...session,
      status: statusValue,
      registered_players_count: consuming,
      current_players: consuming,
      approved_join_count: approvedOnly,
    };
  });
}

export async function getOpenPlayById(id: string): Promise<OpenPlaySession | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("open_play_sessions")
    .select("*, courts(name,venue_id,venues(id,name,location))")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const [session] = await hydrateOpenPlayRegisteredCounts([mapOpenPlaySessionRow(data)]);
  return session ?? null;
}

export async function listOpenPlaySessionsByBookingGroupId(
  bookingGroupId: string,
): Promise<OpenPlaySession[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("open_play_sessions")
    .select("*, courts(name,venue_id,venues(id,name,location))")
    .eq("booking_group_id", bookingGroupId)
    .order("start_time", { ascending: true });
  if (error) throw error;
  const sessions = (data ?? []).map(mapOpenPlaySessionRow);
  return hydrateOpenPlayRegisteredCounts(sessions);
}

export async function getOpenPlaySessionByBookingGroupAndCourt(
  bookingGroupId: string,
  courtId: string,
): Promise<OpenPlaySession | null> {
  const sessions = await listOpenPlaySessionsByBookingGroupId(bookingGroupId);
  return sessions.find((s) => s.court_id === courtId) ?? null;
}

export async function listOpenPlaySessionsByHostUserId(
  hostUserId: string,
): Promise<OpenPlaySession[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("open_play_sessions")
    .select("*, courts(name,venue_id,venues(id,name,location))")
    .eq("host_user_id", hostUserId)
    .order("date", { ascending: false })
    .order("start_time", { ascending: false });
  if (error) throw error;
  const sessions = (data ?? []).map(mapOpenPlaySessionRow);
  return hydrateOpenPlayRegisteredCounts(sessions);
}

export async function getOpenPlayJoinRequestByUser(
  sessionId: string,
  userId: string,
): Promise<OpenPlayJoinRequest | null> {
  const supabase = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();
  await supabase
    .from("open_play_join_requests")
    .delete()
    .eq("open_play_session_id", sessionId)
    .eq("user_id", userId)
    .eq("status", "payment_locked")
    .lte("payment_lock_expires_at", nowIso);
  const { data, error } = await supabase
    .from("open_play_join_requests")
    .select("*, profiles!open_play_join_requests_user_id_fkey(full_name,dupr_rating)")
    .eq("open_play_session_id", sessionId)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? mapOpenPlayJoinRequestRow(data) : null;
}

export async function listOpenPlayJoinRequestsByUser(
  userId: string,
  sessionIds?: string[],
): Promise<OpenPlayJoinRequest[]> {
  const supabase = createSupabaseAdminClient();
  let query = supabase
    .from("open_play_join_requests")
    .select("*, profiles!open_play_join_requests_user_id_fkey(full_name,dupr_rating)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (sessionIds && sessionIds.length > 0) {
    query = query.in("open_play_session_id", sessionIds);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map(mapOpenPlayJoinRequestRow);
}

export async function acquireOpenPlayPaymentLock(params: {
  sessionId: string;
  userId: string;
  lockMinutes?: number;
}): Promise<{ result: "locked" | "full" | "already_active" | "not_found"; request: OpenPlayJoinRequest | null }> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("open_play_acquire_payment_lock", {
    p_session_id: params.sessionId,
    p_user_id: params.userId,
    p_lock_minutes: params.lockMinutes ?? 5,
  } as never);
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : null) as
    | { result?: "locked" | "full" | "already_active" | "not_found"; request_id?: string | null }
    | null;
  const result = row?.result ?? "not_found";
  if (!row?.request_id) {
    return { result, request: null };
  }
  const request = await getOpenPlayJoinRequestById(row.request_id);
  return { result, request };
}

export async function getOpenPlayJoinRequestById(
  requestId: string,
): Promise<OpenPlayJoinRequest | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("open_play_join_requests")
    .select("*, profiles!open_play_join_requests_user_id_fkey(full_name,dupr_rating)")
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapOpenPlayJoinRequestRow(data) : null;
}

export async function submitOpenPlayJoinPaymentProof(params: {
  sessionId: string;
  userId: string;
  paymentMethod: "gcash" | "maya";
  paymentProofUrl: string;
  paymentProofMimeType: "image/jpeg";
  paymentProofBytes: number;
  paymentProofWidth: number;
  paymentProofHeight: number;
  joinNote?: string;
}): Promise<OpenPlayJoinRequest | null> {
  const supabase = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();
  const { data, error } = await supabase
    .from("open_play_join_requests")
    .update({
      status: "pending_approval",
      payment_method: params.paymentMethod,
      payment_proof_url: params.paymentProofUrl,
      payment_proof_mime_type: params.paymentProofMimeType,
      payment_proof_bytes: params.paymentProofBytes,
      payment_proof_width: params.paymentProofWidth,
      payment_proof_height: params.paymentProofHeight,
      payment_submitted_at: nowIso,
      payment_lock_expires_at: null,
      join_note: params.joinNote ?? null,
    } as never)
    .eq("open_play_session_id", params.sessionId)
    .eq("user_id", params.userId)
    .eq("status", "payment_locked")
    .gt("payment_lock_expires_at", nowIso)
    .select("*, profiles!open_play_join_requests_user_id_fkey(full_name,dupr_rating)")
    .maybeSingle();
  if (error) throw error;
  return data ? mapOpenPlayJoinRequestRow(data) : null;
}

export async function listOpenPlayJoinRequestsBySession(
  sessionId: string,
): Promise<OpenPlayJoinRequest[]> {
  const supabase = createSupabaseAdminClient();
  const nowIso = new Date().toISOString();
  await supabase
    .from("open_play_join_requests")
    .delete()
    .eq("open_play_session_id", sessionId)
    .eq("status", "payment_locked")
    .lte("payment_lock_expires_at", nowIso);

  const { data, error } = await supabase
    .from("open_play_join_requests")
    .select("*, profiles!open_play_join_requests_user_id_fkey(full_name,dupr_rating)")
    .eq("open_play_session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map(mapOpenPlayJoinRequestRow);
}

export async function countOpenPlayJoinRequestsBySession(
  sessionId: string,
): Promise<Record<OpenPlayJoinRequest["status"], number>> {
  const requests = await listOpenPlayJoinRequestsBySession(sessionId);
  const out: Record<OpenPlayJoinRequest["status"], number> = {
    waitlisted: 0,
    payment_locked: 0,
    pending_approval: 0,
    approved: 0,
    denied: 0,
    expired: 0,
    cancelled: 0,
  };
  for (const request of requests) {
    out[request.status] = (out[request.status] ?? 0) + 1;
  }
  return out;
}

export async function setOpenPlayJoinRequestDecision(params: {
  sessionId: string;
  requestId: string;
  status: "approved" | "denied";
  decidedByUserId: string;
  organizerNote?: string;
}): Promise<OpenPlayJoinRequest | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("open_play_join_requests")
    .update({
      status: params.status,
      decided_by_user_id: params.decidedByUserId,
      decided_at: new Date().toISOString(),
      organizer_note: params.organizerNote ?? null,
      payment_lock_expires_at: null,
    } as never)
    .eq("id", params.requestId)
    .eq("open_play_session_id", params.sessionId)
    .eq("status", "pending_approval")
    .select("*, profiles!open_play_join_requests_user_id_fkey(full_name,dupr_rating)")
    .maybeSingle();
  if (error) throw error;
  return data ? mapOpenPlayJoinRequestRow(data) : null;
}

export async function cancelOpenPlayJoinRequest(params: {
  sessionId: string;
  requestId: string;
  userId: string;
}): Promise<OpenPlayJoinRequest | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("open_play_join_requests")
    .update({
      status: "cancelled",
      payment_lock_expires_at: null,
    } as never)
    .eq("id", params.requestId)
    .eq("open_play_session_id", params.sessionId)
    .eq("user_id", params.userId)
    .in("status", ["payment_locked", "pending_approval"])
    .select("*, profiles!open_play_join_requests_user_id_fkey(full_name,dupr_rating)")
    .maybeSingle();
  if (error) throw error;
  return data ? mapOpenPlayJoinRequestRow(data) : null;
}

export async function listOpenPlayCommentsBySession(
  sessionId: string,
): Promise<OpenPlayComment[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("open_play_comments")
    .select("*, profiles!open_play_comments_user_id_fkey(full_name)")
    .eq("open_play_session_id", sessionId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(mapOpenPlayCommentRow);
}

export async function createOpenPlayComment(params: {
  sessionId: string;
  userId: string;
  comment: string;
}): Promise<OpenPlayComment> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("open_play_comments")
    .insert({
      open_play_session_id: params.sessionId,
      user_id: params.userId,
      comment: params.comment,
    } as never)
    .select("*, profiles!open_play_comments_user_id_fkey(full_name)")
    .single();
  if (error) throw error;
  return mapOpenPlayCommentRow(data);
}

export type UpdateOpenPlayCommentResult =
  | { ok: true; comment: OpenPlayComment }
  | { ok: false; error: "not_found" | "forbidden" | "edit_window_expired" };

export async function updateOpenPlayComment(params: {
  sessionId: string;
  commentId: string;
  userId: string;
  comment: string;
}): Promise<UpdateOpenPlayCommentResult> {
  const supabase = createSupabaseAdminClient();
  const { data: existing, error: fetchErr } = await supabase
    .from("open_play_comments")
    .select("id, user_id, created_at, open_play_session_id")
    .eq("id", params.commentId)
    .eq("open_play_session_id", params.sessionId)
    .maybeSingle();
  if (fetchErr) throw fetchErr;
  if (!existing) {
    return { ok: false, error: "not_found" };
  }
  const row = existing as { user_id: string; created_at: string };
  if (row.user_id !== params.userId) {
    return { ok: false, error: "forbidden" };
  }
  const createdMs = Date.parse(row.created_at);
  if (!Number.isFinite(createdMs) || Date.now() - createdMs > OPEN_PLAY_COMMENT_EDIT_WINDOW_MS) {
    return { ok: false, error: "edit_window_expired" };
  }

  const editedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from("open_play_comments")
    .update({
      comment: params.comment,
      edited_at: editedAt,
    } as never)
    .eq("id", params.commentId)
    .select("*, profiles!open_play_comments_user_id_fkey(full_name)")
    .single();
  if (error) throw error;
  return { ok: true, comment: mapOpenPlayCommentRow(data) };
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

/** Cron: persist `started` / `closed` from time + approved join counts (admin client). */
export async function syncOpenPlayLifecycleStatuses(nowMs: number): Promise<{
  updated_count: number;
}> {
  const supabase = createSupabaseAdminClient();
  const { data: rows, error } = await supabase
    .from("open_play_sessions")
    .select("id, date, start_time, end_time, status");
  if (error) throw error;
  const list = (rows ?? []) as Array<{
    id: string;
    date: string;
    start_time: string;
    end_time: string;
    status: OpenPlaySession["status"];
  }>;
  const tracked = list.filter(
    (r) => r.status !== "cancelled" && r.status !== "closed",
  );
  if (tracked.length === 0) return { updated_count: 0 };

  const sessionIds = tracked.map((r) => r.id);
  const { data: approvedRows, error: apprErr } = await supabase
    .from("open_play_join_requests")
    .select("open_play_session_id")
    .in("open_play_session_id", sessionIds)
    .eq("status", "approved");
  if (apprErr) throw apprErr;

  const approvedBySession = new Map<string, number>();
  for (const r of approvedRows ?? []) {
    const sid = (r as { open_play_session_id: string }).open_play_session_id;
    approvedBySession.set(sid, (approvedBySession.get(sid) ?? 0) + 1);
  }

  let updated = 0;
  for (const row of tracked) {
    const approvedCount = approvedBySession.get(row.id) ?? 0;
    const target = computeOpenPlayLifecycleTargetStatus(row, nowMs, approvedCount);
    if (!target || target === row.status) continue;
    const { error: upErr } = await supabase
      .from("open_play_sessions")
      .update({ status: target } as never)
      .eq("id", row.id);
    if (!upErr) updated += 1;
    else throw upErr;
  }
  return { updated_count: updated };
}

// ── Billing ──────────────────────────────────────────────────────────────────

type BillingCycleRaw = {
  id: string;
  venue_id: string;
  period_start: string;
  period_end: string;
  booking_count: number;
  total_booking_fees: unknown;
  status: string;
  payment_method: string | null;
  payment_proof_url: string | null;
  payment_proof_mime_type: string | null;
  payment_proof_bytes: number | null;
  payment_proof_width: number | null;
  payment_proof_height: number | null;
  payment_submitted_at: string | null;
  marked_paid_at: string | null;
  marked_paid_by_user_id: string | null;
  created_at: string;
  updated_at: string;
};

function mapBillingCycleRow(row: unknown): VenueBillingCycle {
  const r = row as BillingCycleRaw;
  const pm = r.payment_method;
  return {
    id: r.id,
    venue_id: r.venue_id,
    period_start: r.period_start,
    period_end: r.period_end,
    booking_count: r.booking_count,
    total_booking_fees: Number(r.total_booking_fees ?? 0),
    status: r.status === "paid" ? "paid" : "unsettled",
    payment_method: pm === "gcash" || pm === "maya" ? pm : null,
    payment_proof_url: r.payment_proof_url ?? null,
    payment_proof_mime_type: r.payment_proof_mime_type ?? null,
    payment_proof_bytes: r.payment_proof_bytes ?? null,
    payment_proof_width: r.payment_proof_width ?? null,
    payment_proof_height: r.payment_proof_height ?? null,
    payment_submitted_at: r.payment_submitted_at ?? null,
    marked_paid_at: r.marked_paid_at ?? null,
    marked_paid_by_user_id: r.marked_paid_by_user_id ?? null,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export async function listBillingCyclesByVenue(
  venueId: string,
): Promise<VenueBillingCycle[]> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await (supabase as unknown as ReturnType<typeof createSupabaseAdminClient>)
    .from("venue_billing_cycles" as never)
    .select("*")
    .eq("venue_id", venueId)
    .order("period_start", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as unknown[]).map(mapBillingCycleRow);
}

export async function getBillingCycleById(
  id: string,
): Promise<VenueBillingCycle | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await (supabase as unknown as ReturnType<typeof createSupabaseAdminClient>)
    .from("venue_billing_cycles" as never)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapBillingCycleRow(data);
}

export async function listAllBillingCycles(params?: {
  status?: BillingCycleStatus;
}): Promise<VenueBillingCycle[]> {
  const supabase = createSupabaseAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from("venue_billing_cycles")
    .select("*")
    .order("period_start", { ascending: false });
  if (params?.status) query = query.eq("status", params.status);
  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as unknown[]).map(mapBillingCycleRow);
}

export async function updateBillingCycleProof(
  id: string,
  params: {
    payment_method: "gcash" | "maya";
    payment_proof_url: string;
    payment_proof_mime_type: string;
    payment_proof_bytes: number;
    payment_proof_width: number;
    payment_proof_height: number;
  },
): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await (supabase as unknown as ReturnType<typeof createSupabaseAdminClient>)
    .from("venue_billing_cycles" as never)
    .update({
      payment_method: params.payment_method,
      payment_proof_url: params.payment_proof_url,
      payment_proof_mime_type: params.payment_proof_mime_type,
      payment_proof_bytes: params.payment_proof_bytes,
      payment_proof_width: params.payment_proof_width,
      payment_proof_height: params.payment_proof_height,
      payment_submitted_at: new Date().toISOString(),
      payment_rejected_at: null,
      payment_rejection_note: null,
      payment_rejected_by_user_id: null,
    } as never)
    .eq("id", id)
    .eq("status", "unsettled");
  if (error) throw error;
}

export async function markBillingCyclePaid(
  id: string,
  markedByUserId: string,
): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await (supabase as unknown as ReturnType<typeof createSupabaseAdminClient>)
    .from("venue_billing_cycles" as never)
    .update({
      status: "paid",
      marked_paid_at: new Date().toISOString(),
      marked_paid_by_user_id: markedByUserId,
    } as never)
    .eq("id", id)
    .eq("status", "unsettled");
  if (error) throw error;
}

export async function rejectBillingCycleProof(
  id: string,
  note: string | null,
  rejectedByUserId: string,
): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await (supabase as unknown as ReturnType<typeof createSupabaseAdminClient>)
    .from("venue_billing_cycles" as never)
    .update({
      payment_submitted_at: null,
      payment_rejected_at: new Date().toISOString(),
      payment_rejection_note: note ?? null,
      payment_rejected_by_user_id: rejectedByUserId,
    } as never)
    .eq("id", id)
    .eq("status", "unsettled");
  if (error) throw error;
}

// ── Platform payment methods ──────────────────────────────────────────────────

function mapPlatformPaymentMethodRow(row: unknown): PlatformPaymentMethod {
  const r = row as {
    id: string;
    method: "gcash" | "maya";
    account_name: string;
    account_number: string;
    is_active: boolean;
    created_at: string;
    updated_at: string;
  };
  return {
    id: r.id,
    method: r.method,
    account_name: r.account_name,
    account_number: r.account_number,
    is_active: r.is_active,
    created_at: r.created_at,
    updated_at: r.updated_at,
  };
}

export async function listPlatformPaymentMethods(
  onlyActive = false,
): Promise<PlatformPaymentMethod[]> {
  const supabase = createSupabaseAdminClient();
  let query = (supabase as unknown as ReturnType<typeof createSupabaseAdminClient>)
    .from("platform_payment_methods" as never)
    .select("*")
    .order("created_at", { ascending: true });
  if (onlyActive) {
    query = query.eq("is_active", true) as typeof query;
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data as unknown[]).map(mapPlatformPaymentMethodRow);
}

export async function createPlatformPaymentMethod(params: {
  method: "gcash" | "maya";
  account_name: string;
  account_number: string;
  is_active?: boolean;
}): Promise<PlatformPaymentMethod> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await (supabase as unknown as ReturnType<typeof createSupabaseAdminClient>)
    .from("platform_payment_methods" as never)
    .insert({
      method: params.method,
      account_name: params.account_name,
      account_number: params.account_number,
      is_active: params.is_active ?? true,
    } as never)
    .select()
    .single();
  if (error) throw error;
  return mapPlatformPaymentMethodRow(data);
}

export async function updatePlatformPaymentMethod(
  id: string,
  params: {
    account_name?: string;
    account_number?: string;
    is_active?: boolean;
  },
): Promise<PlatformPaymentMethod> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await (supabase as unknown as ReturnType<typeof createSupabaseAdminClient>)
    .from("platform_payment_methods" as never)
    .update(params as never)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return mapPlatformPaymentMethodRow(data);
}

export async function deletePlatformPaymentMethod(id: string): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await (supabase as unknown as ReturnType<typeof createSupabaseAdminClient>)
    .from("platform_payment_methods" as never)
    .delete()
    .eq("id", id);
  if (error) throw error;
}

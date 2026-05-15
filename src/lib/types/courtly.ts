export type CourtSport = "pickleball" | "tennis" | "badminton" | "padel";

/** Non-overlapping [start, end) hour slots; times are HH:mm on the hour. */
export type CourtRateWindow = {
  start: string;
  end: string;
  hourly_rate: number;
  /** Day-of-week (0=Sun..6=Sat) the window is active on. Omitted/empty = every day. */
  days_of_week?: number[];
};

/** Whole-venue block (all courts at the venue unbookable for the window). */
export type VenueClosure = {
  id: string;
  venue_id: string;
  /** yyyy-MM-dd */
  date: string;
  start_time: string;
  end_time: string;
  reason: string;
  note?: string;
  created_at: string;
};

/** Single-day block when one court is not bookable (maintenance, event, etc.). */
export type CourtClosure = {
  id: string;
  court_id: string;
  /** yyyy-MM-dd */
  date: string;
  start_time: string;
  end_time: string;
  /** e.g. maintenance, special_event */
  reason: string;
  note?: string;
  created_at: string;
};

export type CourtReview = {
  id: string;
  venue_id: string;
  user_id: string;
  user_name: string;
  booking_id: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment?: string;
  created_at: string;
  updated_at: string;
  flagged?: boolean;
  flagged_at?: string;
  flagged_by_user_id?: string;
  flag_reason?: string;
};

export type CourtReviewSummary = {
  average_rating: number;
  review_count: number;
};

export type VenueStatus = "active" | "closed" | "deleted";
export type VenueRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "needs_update";
export type VenueManualPaymentMethod = "gcash" | "maya";

export type VenuePaymentMethodDetails = {
  method: VenueManualPaymentMethod;
  account_name: string;
  account_number: string;
};

/** Establishment/building that contains one or more physical courts. */
export type Venue = {
  id: string;
  name: string;
  location: string;
  contact_phone: string;
  facebook_url?: string;
  instagram_url?: string;
  sport: CourtSport;
  /** Non-overlapping [start, end) price ranges; sole source for bookable hours and rates. */
  hourly_rate_windows: CourtRateWindow[];
  status: VenueStatus;
  amenities: string[];
  photo_urls: string[];
  created_at: string;
  map_latitude?: number;
  map_longitude?: number;
  city?: string;
  address?: string;
  accepts_gcash: boolean;
  gcash_account_name?: string;
  gcash_account_number?: string;
  accepts_maya: boolean;
  maya_account_name?: string;
  maya_account_number?: string;
  /** When set, overrides the platform default booking fee for this venue. */
  booking_fee_override?: number | null;
};

export type VenueAdminAssignment = {
  id: string;
  venue_id: string;
  admin_user_id: string;
  created_at: string;
};

export type VenueRequest = {
  id: string;
  name: string;
  location: string;
  city?: string;
  contact_phone: string;
  facebook_url?: string;
  instagram_url?: string;
  sport: CourtSport;
  hourly_rate_windows: CourtRateWindow[];
  status: VenueStatus;
  amenities: string[];
  photo_urls: string[];
  map_latitude?: number;
  map_longitude?: number;
  accepts_gcash: boolean;
  gcash_account_name?: string;
  gcash_account_number?: string;
  accepts_maya: boolean;
  maya_account_name?: string;
  maya_account_number?: string;
  request_status: VenueRequestStatus;
  requested_by: string;
  requested_by_name?: string;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_note?: string | null;
  approved_venue_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type Court = {
  id: string;
  venue_id: string;
  name: string;
  status: "active" | "closed";
  /** Derived on read from linked venue. */
  establishment_name?: string;
  /** Derived on read from linked venue. */
  contact_phone?: string;
  /** Derived on read from linked venue. */
  facebook_url?: string;
  /** Derived on read from linked venue. */
  instagram_url?: string;
  /** Derived on read from linked venue. */
  location: string;
  /** Derived on read from linked venue. */
  sport: CourtSport;
  /** Derived on read from linked venue. */
  image_url: string;
  /** Deprecated/optional legacy metadata. */
  gallery_urls?: string[];
  /** All venue photos; derived on read from linked venue. */
  venue_photo_urls?: string[];
  /** Deprecated/optional legacy metadata. */
  description?: string;
  /** Derived on read from linked venue (maps). */
  map_latitude?: number;
  /** Derived on read from linked venue (maps). */
  map_longitude?: number;
  /** Derived on read from linked venue. */
  city?: string;
  /** Derived on read from linked venue. */
  address?: string;
  /** Derived on read from linked venue payment settings. */
  accepts_gcash?: boolean;
  /** Derived on read from linked venue payment settings. */
  gcash_account_name?: string;
  /** Derived on read from linked venue payment settings. */
  gcash_account_number?: string;
  /** Derived on read from linked venue payment settings. */
  accepts_maya?: boolean;
  /** Derived on read from linked venue payment settings. */
  maya_account_name?: string;
  /** Derived on read from linked venue payment settings. */
  maya_account_number?: string;
  /** Deprecated but retained for compatibility in current UI. */
  type: "indoor" | "outdoor";
  /** Deprecated but retained for compatibility in current UI. */
  surface: "concrete" | "asphalt" | "wood" | "sport_court";
  /** Derived on read from linked venue. */
  hourly_rate_windows: CourtRateWindow[];
  /** Derived on read from linked venue. */
  amenities: string[];
  /** Earliest range start / latest range end (filters); gaps between ranges may exist. */
  available_hours: { open: string; close: string };
  /** Derived on read from linked venue. */
  venue_status?: VenueStatus;
  /** Populated on read APIs from reviews table — not stored on court row. */
  review_summary?: CourtReviewSummary;
};

export type Booking = {
  id: string;
  booking_number?: string;
  court_id: string;
  court_name?: string;
  /** Hydrated from the court’s venue on read APIs. */
  venue_id?: string;
  establishment_name?: string;
  sport?: CourtSport;
  /** Same id on segments created in one checkout (e.g. split around unavailable hours). */
  booking_group_id?: string;
  date: string;
  start_time: string;
  end_time: string;
  player_name?: string;
  player_email?: string;
  /** Profile id when the booking is tied to a logged-in user (from DB). */
  user_id?: string | null;
  /** Hydrated on read for venue admins / superadmin from `profiles.mobile_number`. */
  player_mobile_number?: string | null;
  players_count?: number;
  /** Amount attributed to the court before booking fee (reservation subtotal). */
  court_subtotal?: number;
  /** Courtly booking fee on this booking (on top of court subtotal). */
  booking_fee?: number;
  /** What the customer paid (court subtotal + booking fee) when both are set. */
  total_cost?: number;
  status:
    | "pending_payment"
    | "pending_confirmation"
    | "confirmed"
    | "cancelled"
    | "completed"
    | "refund"
    | "refunded";
  hold_expires_at?: string | null;
  payment_provider?: "manual" | null;
  payment_attempt_count?: number;
  payment_submitted_method?: VenueManualPaymentMethod | null;
  payment_submitted_at?: string | null;
  payment_proof_url?: string | null;
  payment_proof_mime_type?: string | null;
  payment_proof_bytes?: number | null;
  payment_proof_width?: number | null;
  payment_proof_height?: number | null;
  cancel_reason?: string | null;
  /** Player-provided booking note. Set during booking creation; immutable afterwards. */
  notes?: string;
  /** Internal shared note for court admins/superadmin managing this booking's court. */
  admin_note?: string;
  admin_note_updated_by_user_id?: string;
  admin_note_updated_by_name?: string;
  admin_note_updated_at?: string;
  /** Last actor who changed `status` (admin/superadmin/system). */
  status_updated_by_user_id?: string | null;
  status_updated_by_name?: string | null;
  /** ISO timestamp for last status transition. */
  status_updated_at?: string | null;
  created_date?: string;
};

export type BookingAdminNote = {
  id: string;
  booking_id: string;
  booking_group_id?: string | null;
  author_user_id: string;
  author_name: string;
  body: string;
  created_at: string;
};

export type PaymentTransaction = {
  id: string;
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
  created_at: string;
};

export type Tournament = {
  id: string;
  sport: CourtSport;
  name: string;
  description?: string;
  date: string;
  start_time: string;
  end_time: string;
  format: "singles" | "doubles" | "mixed_doubles" | "round_robin";
  skill_level: "beginner" | "intermediate" | "advanced" | "open";
  max_participants: number;
  current_participants: number;
  entry_fee: number;
  prize?: string;
  location: string;
  image_url?: string;
  status:
    | "upcoming"
    | "registration_open"
    | "registration_closed"
    | "in_progress"
    | "completed";
};

export type TournamentRegistration = {
  id: string;
  tournament_id: string;
  tournament_name?: string;
  player_name: string;
  player_email: string;
  partner_name?: string;
  skill_level: "beginner" | "intermediate" | "advanced";
  status: "registered" | "waitlisted" | "cancelled";
  created_date?: string;
};

export type OpenPlaySession = {
  id: string;
  sport: CourtSport;
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  skill_level: "all_levels" | "beginner" | "intermediate" | "advanced";
  location: string;
  booking_group_id?: string | null;
  court_id?: string;
  max_players: number;
  current_players: number;
  host_user_id?: string | null;
  host_name: string;
  host_email?: string;
  description?: string;
  price_per_player: number;
  dupr_min?: number | null;
  dupr_max?: number | null;
  accepts_gcash: boolean;
  gcash_account_name?: string | null;
  gcash_account_number?: string | null;
  accepts_maya: boolean;
  maya_account_name?: string | null;
  maya_account_number?: string | null;
  status: "open" | "full" | "cancelled" | "completed" | "started" | "closed";
  court_name?: string | null;
  venue_name?: string | null;
  venue_id?: string | null;
  registered_players_count?: number;
  /** Approved join requests only (for lifecycle display). */
  approved_join_count?: number;
  current_user_request_status?: OpenPlayJoinRequestStatus | null;
};

export type OpenPlayJoinRequestStatus =
  | "waitlisted"
  | "payment_locked"
  | "pending_approval"
  | "approved"
  | "denied"
  | "expired"
  | "cancelled";

export type OpenPlayJoinRequest = {
  id: string;
  open_play_session_id: string;
  user_id: string;
  user_name?: string | null;
  user_email?: string | null;
  user_dupr_rating?: number | null;
  status: OpenPlayJoinRequestStatus;
  payment_lock_expires_at?: string | null;
  payment_method?: VenueManualPaymentMethod | null;
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
  created_at: string;
  updated_at: string;
};

export type OpenPlayComment = {
  id: string;
  open_play_session_id: string;
  user_id: string;
  user_name?: string | null;
  comment: string;
  created_at: string;
  updated_at: string;
  /** Set when the message text was edited (for “Edited” label). */
  edited_at?: string | null;
};

export type OpenPlayDetailResponse = {
  session: OpenPlaySession;
  /** Full court row when `session.court_id` is set (venue card, map, contact). */
  court?: Court | null;
  my_request?: OpenPlayJoinRequest | null;
  pending_requests?: OpenPlayJoinRequest[];
  approved_players?: Array<{
    id: string;
    user_id: string;
    user_name?: string | null;
    user_dupr_rating?: number | null;
  }>;
  comments: OpenPlayComment[];
  counts: {
    approved: number;
    pending_approval: number;
    payment_locked: number;
    waitlisted: number;
  };
};

export type OpenPlayCreateResponse = {
  sessions: OpenPlaySession[];
};

export type SessionUser = {
  id: string;
  email: string;
  full_name: string;
  role: "user" | "admin" | "superadmin";
  is_active?: boolean;
  dupr_rating?: number;
};

/** Directory user record (superadmin CRUD); aligns with demo login identities. */
export type ManagedUser = {
  id: string;
  email: string;
  full_name: string;
  first_name?: string | null;
  last_name?: string | null;
  /** yyyy-MM-dd */
  birthdate?: string | null;
  mobile_number?: string | null;
  /** From Supabase Auth; null means invite / signup not completed. */
  email_confirmed_at?: string | null;
  role: "user" | "admin" | "superadmin";
  is_active: boolean;
  created_at: string;
};

export type RevenueByCourtRow = {
  court_id: string;
  court_name: string;
  venue_id: string | null;
  venue_name: string | null;
  booking_count: number;
  court_net: number;
  booking_fees: number;
  customer_total: number;
  rate_breakdown?: RevenueRateBreakdownRow[];
};

export type RevenueRateBreakdownRow = {
  hourly_rate: number;
  hours_booked: number;
  court_subtotal: number;
};

export type RevenueByAccountRow = {
  venue_id: string;
  venue_name: string;
  court_net: number;
  booking_fees: number;
  customer_total: number;
  booking_count: number;
};

export type RevenueSummaryResponse = {
  scope: "platform" | "venue";
  totals: {
    court_net: number;
    booking_fees: number;
    customer_total: number;
    booking_count: number;
  };
  by_court: RevenueByCourtRow[];
  by_account?: RevenueByAccountRow[];
  /** Applied filters (echo for UI). */
  filters: {
    date_from: string | null;
    date_to: string | null;
    /** Set when response is scoped to one venue or "unassigned". */
    venue_id: string | null;
  };
  /** Present when `venue_id` filter is set (drill-down page). */
  focus_venue?: { id: string; name: string } | null;
};

export type CourtDayAvailability = {
  bookings: Booking[];
  court_closures: CourtClosure[];
  venue_closures: VenueClosure[];
};

/** Per-court bookings + closures for a single date. Venue closures live one level up. */
export type CourtAvailabilityForDate = {
  bookings: Booking[];
  court_closures: CourtClosure[];
};

export type CourtBookingSurfaceResponse = {
  court: Court;
  sibling_courts: Court[];
  /** Effective flat booking fee (PHP) for this venue: platform default or venue override. */
  flat_booking_fee: number;
  /** Venue-wide closures (apply to every court in the venue). */
  venue_closures: VenueClosure[];
  /** Per-court availability keyed by court_id, covering the focal court and every sibling. */
  availability_by_court_id: Record<string, CourtAvailabilityForDate>;
  reviews: CourtReview[];
};

export type CourtDetailContextResponse = {
  court: Court;
  sibling_courts: Court[];
};

export type BookingDetailGroupResponse = {
  booking: Booking;
  group_segments: Booking[];
  payment_transactions?: PaymentTransaction[];
};

export type BookingDetailContextResponse = BookingDetailGroupResponse & {
  court?: Court;
  reviews?: CourtReview[];
  /** Server timestamp used by UI for deterministic time-window checks. */
  server_now?: string;
};

export type VenueDetailResponse = {
  venue: Venue;
  courts: Court[];
  admins: ManagedUser[];
};

export type DashboardOverviewResponse = {
  today_bookings: Booking[];
  future_bookings_count: number;
  tournaments_open: Tournament[];
  open_play_sessions: OpenPlaySession[];
};

export type AdminVenueWorkspaceResponse = {
  venue: Venue;
  courts: Court[];
};

export type SuperadminDirectoryResponse = {
  venues: Venue[];
  managed_users: ManagedUser[];
};

export type CursorPage<T> = {
  items: T[];
  has_more: boolean;
  next_cursor: string | null;
};

export type MyBookingsOverviewResponse = {
  bookings: CursorPage<Booking>;
  registrations: CursorPage<TournamentRegistration>;
};

export type BookingCheckoutResponse = {
  booking_id: string;
  booking_group_id: string;
  hold_expires_at: string;
  total_due: number;
  payment_methods: VenuePaymentMethodDetails[];
};

export type SuperadminDirectoryPagedResponse = {
  venues: CursorPage<Venue>;
  managed_users: CursorPage<ManagedUser>;
};

export type AdminVenueRequestsResponse = {
  requests: VenueRequest[];
};

export type SuperadminVenueRequestsResponse = {
  requests: VenueRequest[];
};

// ── Billing ──────────────────────────────────────────────────────────────────

export type BillingCycleStatus = "unsettled" | "paid";

export type VenueBillingCycle = {
  id: string;
  venue_id: string;
  period_start: string;
  period_end: string;
  booking_count: number;
  total_booking_fees: number;
  status: BillingCycleStatus;
  payment_method?: "gcash" | "maya" | null;
  payment_proof_url?: string | null;
  payment_proof_mime_type?: string | null;
  payment_proof_bytes?: number | null;
  payment_proof_width?: number | null;
  payment_proof_height?: number | null;
  payment_submitted_at?: string | null;
  payment_rejected_at?: string | null;
  payment_rejection_note?: string | null;
  payment_rejected_by_user_id?: string | null;
  marked_paid_at?: string | null;
  marked_paid_by_user_id?: string | null;
  created_at: string;
  updated_at: string;
};

export type BillingSummaryVenueRow = {
  venue_id: string;
  venue_name: string;
  total_cycles: number;
  unsettled_cycles: number;
  paid_cycles: number;
  total_fees_all_time: number;
  total_fees_unsettled: number;
  latest_cycle_status: BillingCycleStatus | null;
};

export type BillingSummaryResponse = {
  venues: BillingSummaryVenueRow[];
  platform_totals: {
    total_fees_all_time: number;
    total_fees_unsettled: number;
    total_fees_paid: number;
    unsettled_cycle_count: number;
  };
  venue_cycles?: VenueBillingCycle[];
};

export type BillingCycleBookingRow = {
  booking_id: string;
  booking_number?: string | null;
  court_id: string;
  court_name: string;
  date: string;
  start_time: string;
  end_time: string;
  player_name?: string | null;
  booking_fee: number;
};

export type BillingCycleDetailResponse = {
  cycle: VenueBillingCycle;
  venue: {
    id: string;
    name: string;
    location: string;
    accepts_gcash: boolean;
    gcash_account_name?: string | null;
    gcash_account_number?: string | null;
    accepts_maya: boolean;
    maya_account_name?: string | null;
    maya_account_number?: string | null;
  };
  bookings: BillingCycleBookingRow[];
};

export type AdminBillingListResponse = {
  cycles: VenueBillingCycle[];
  venue: { id: string; name: string };
};

export type GenerateBillingResult = {
  generated: number;
  skipped: number;
  protected_paid: number;
};

export type PlatformPaymentMethod = {
  id: string;
  method: "gcash" | "maya";
  account_name: string;
  account_number: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

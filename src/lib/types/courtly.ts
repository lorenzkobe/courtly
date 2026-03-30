export type CourtSport = "pickleball" | "tennis" | "badminton" | "padel";

/** Non-overlapping [start, end) hour slots; times are HH:mm on the hour. */
export type CourtRateWindow = {
  start: string;
  end: string;
  hourly_rate: number;
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

export type VenueStatus = "active" | "closed";

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
  image_url: string;
  created_at: string;
  map_latitude?: number;
  map_longitude?: number;
};

export type VenueAdminAssignment = {
  id: string;
  venue_id: string;
  admin_user_id: string;
  created_at: string;
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
  /** Deprecated/optional legacy metadata. */
  description?: string;
  /** Derived on read from linked venue (maps). */
  map_latitude?: number;
  /** Derived on read from linked venue (maps). */
  map_longitude?: number;
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
  /** Populated on read APIs from reviews table — not stored on court row. */
  review_summary?: CourtReviewSummary;
};

export type Booking = {
  id: string;
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
  status: "confirmed" | "cancelled" | "completed";
  /** Player-provided booking note. Set during booking creation; immutable afterwards. */
  notes?: string;
  /** Internal shared note for court admins/superadmin managing this booking's court. */
  admin_note?: string;
  admin_note_updated_by_user_id?: string;
  admin_note_updated_by_name?: string;
  admin_note_updated_at?: string;
  created_date?: string;
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
  court_id?: string;
  max_players: number;
  current_players: number;
  host_name: string;
  host_email?: string;
  description?: string;
  fee: number;
  status: "open" | "full" | "cancelled" | "completed";
};

export type SessionUser = {
  id: string;
  email: string;
  full_name: string;
  role: "user" | "admin" | "superadmin";
  is_active?: boolean;
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

export type CourtBookingSurfaceResponse = {
  court: Court;
  sibling_courts: Court[];
  availability: CourtDayAvailability;
  reviews: CourtReview[];
};

export type CourtDetailContextResponse = {
  court: Court;
  sibling_courts: Court[];
};

export type BookingDetailGroupResponse = {
  booking: Booking;
  group_segments: Booking[];
};

export type BookingDetailContextResponse = BookingDetailGroupResponse & {
  court?: Court;
  reviews?: CourtReview[];
};

export type VenueDetailResponse = {
  venue: Venue;
  courts: Court[];
  admins: ManagedUser[];
};

export type DashboardOverviewResponse = {
  today_bookings: Booking[];
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

export type SuperadminDirectoryPagedResponse = {
  venues: CursorPage<Venue>;
  managed_users: CursorPage<ManagedUser>;
};

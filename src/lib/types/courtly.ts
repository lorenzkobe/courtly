export type CourtSport = "pickleball" | "tennis" | "badminton" | "padel";

/** Non-overlapping [start, end) hour slots; times are HH:mm on the hour. */
export type CourtRateWindow = {
  start: string;
  end: string;
  hourly_rate: number;
};

/** Single-day block when the court is not bookable (maintenance, event, etc.). */
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
  court_id: string;
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

export type Court = {
  id: string;
  name: string;
  /** Establishment/building name that owns this court. */
  establishment_name?: string;
  location: string;
  /** Which sport this court is for (filters player app by selected sport). */
  sport: CourtSport;
  type: "indoor" | "outdoor";
  surface: "concrete" | "asphalt" | "wood" | "sport_court";
  image_url: string;
  /** Extra photos for gallery / carousel; if empty, `image_url` is used alone */
  gallery_urls?: string[];
  /** Short venue blurb shown on the book page */
  description?: string;
  /** WGS84 — used for map pin / directions */
  map_latitude?: number;
  map_longitude?: number;
  hourly_rate: number;
  /** Flat booking fee charged on top of court subtotal (whole number, set by superadmin). */
  booking_fee?: number;
  /** Optional time-of-day pricing; each window is [start, end) in whole hours. */
  hourly_rate_windows?: CourtRateWindow[];
  amenities: string[];
  available_hours: { open: string; close: string };
  status: "active" | "maintenance" | "closed";
  /** Court admin who manages this venue; null = platform / superadmin only */
  managed_by_user_id: string | null;
  /** Venue operator account (superadmin assigns courts to accounts). */
  court_account_id: string | null;
  /** Populated on read APIs from reviews table — not stored on court row. */
  review_summary?: CourtReviewSummary;
};

export type Booking = {
  id: string;
  court_id: string;
  court_name?: string;
  establishment_name?: string;
  sport?: CourtSport;
  /** Same id on segments created in one checkout (e.g. split around unavailable hours). */
  booking_group_id?: string;
  date: string;
  start_time: string;
  end_time: string;
  player_name?: string;
  player_email?: string;
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
};

/** Business account for one or more courts (superadmin-managed). */
export type CourtAccount = {
  id: string;
  name: string;
  contact_email: string;
  status: "active" | "suspended";
  /** Primary court admin user for this account, if assigned */
  primary_admin_user_id: string | null;
  notes?: string;
  created_at: string;
};

/** Directory user record (superadmin CRUD); aligns with demo login identities. */
export type ManagedUser = {
  id: string;
  email: string;
  full_name: string;
  role: "user" | "admin" | "superadmin";
  /** When role is admin, links them to a court account */
  court_account_id: string | null;
  created_at: string;
};

export type RevenueByCourtRow = {
  court_id: string;
  court_name: string;
  court_account_id: string | null;
  court_account_name: string | null;
  booking_count: number;
  court_net: number;
  booking_fees: number;
  customer_total: number;
};

export type RevenueByAccountRow = {
  court_account_id: string;
  court_account_name: string;
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
    /** Set when response is scoped to one account or "unassigned". */
    court_account_id: string | null;
  };
  /** Present when `court_account_id` filter is set (drill-down page). */
  focus_account?: { id: string; name: string } | null;
};

export type CourtAccountDetailResponse = {
  account: CourtAccount;
  courts: Court[];
  primaryAdmin: ManagedUser | null;
  admins: ManagedUser[];
};

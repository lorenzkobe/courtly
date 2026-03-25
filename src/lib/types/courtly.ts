export type Court = {
  id: string;
  name: string;
  location: string;
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
  amenities: string[];
  available_hours: { open: string; close: string };
  status: "active" | "maintenance" | "closed";
  /** Court admin who manages this venue; null = platform / superadmin only */
  managed_by_user_id: string | null;
};

export type Booking = {
  id: string;
  court_id: string;
  court_name?: string;
  date: string;
  start_time: string;
  end_time: string;
  player_name?: string;
  player_email?: string;
  players_count?: number;
  total_cost?: number;
  status: "confirmed" | "cancelled" | "completed";
  notes?: string;
  created_date?: string;
};

export type Tournament = {
  id: string;
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

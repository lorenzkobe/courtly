/**
 * Legacy in-memory dataset — not wired into API routes. The app reads/writes
 * real data via Supabase (`src/lib/data/courtly-db.ts`). Kept only as a
 * reference shape for types or future local-only demos; safe to delete if unused.
 */
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

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

const today = new Date();
const soon = new Date(today);
soon.setDate(soon.getDate() + 14);

/** Demo court admin (see auth login route ids) */
const DEMO_ADMIN_ID = "user-admin-1";

const venues: Venue[] = [
  {
    id: "venue-bgcmakati",
    name: "BGC Makati Sports Center",
    status: "active",
    location: "Bonifacio Global City, Taguig",
    contact_phone: "+63 917 800 1001",
    sport: "pickleball",
    hourly_rate_windows: [
      { start: "07:00", end: "17:00", hourly_rate: 45 },
      { start: "17:00", end: "22:00", hourly_rate: 60 },
    ],
    amenities: ["lights", "parking", "restrooms", "seating"],
    image_url: "https://picsum.photos/seed/courtly-bgcs-cover/800/450",
    created_at: new Date().toISOString(),
    map_latitude: 14.5515,
    map_longitude: 121.0483,
  },
  {
    id: "venue-cebubay",
    name: "Cebu Bay Sports Hub",
    location: "Cebu City",
    contact_phone: "+63 32 410 2200",
    sport: "pickleball",
    hourly_rate_windows: [{ start: "08:00", end: "21:00", hourly_rate: 40 }],
    status: "active",
    amenities: ["lights", "parking", "water_fountain"],
    image_url: "https://picsum.photos/seed/courtly-cebu-cover/800/450",
    created_at: new Date().toISOString(),
    map_latitude: 10.3157,
    map_longitude: 123.8854,
  },
];

const managedUsers: ManagedUser[] = [
  {
    id: "user-admin-1",
    email: "admin@courtly.dev",
    full_name: "Court Admin",
    role: "admin",
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "user-superadmin-1",
    email: "superadmin@courtly.dev",
    full_name: "Platform Superadmin",
    role: "superadmin",
    is_active: true,
    created_at: new Date().toISOString(),
  },
  {
    id: "user-player-1",
    email: "player@courtly.dev",
    full_name: "Alex Player",
    role: "user",
    is_active: true,
    created_at: new Date().toISOString(),
  },
];

const venueAdminAssignments: VenueAdminAssignment[] = [
  {
    id: "va-bgcmakati-admin1",
    venue_id: "venue-bgcmakati",
    admin_user_id: DEMO_ADMIN_ID,
    created_at: new Date().toISOString(),
  },
];

const courts: Court[] = [
  {
    id: "court-bgcs-1",
    venue_id: "venue-bgcmakati",
    name: "Court 1",
    location: "Bonifacio Global City, Taguig",
    sport: "pickleball",
    image_url: "https://picsum.photos/seed/courtly-bgcs-cover/800/450",
    hourly_rate_windows: [
      { start: "07:00", end: "17:00", hourly_rate: 45 },
      { start: "17:00", end: "22:00", hourly_rate: 60 },
    ],
    amenities: ["lights", "parking", "restrooms", "seating"],
    available_hours: { open: "07:00", close: "22:00" },
    type: "indoor",
    surface: "sport_court",
    status: "active",
  },
  {
    id: "court-makati-2",
    venue_id: "venue-bgcmakati",
    name: "Court 2",
    location: "Bonifacio Global City, Taguig",
    sport: "pickleball",
    image_url: "https://picsum.photos/seed/courtly-bgcs-cover/800/450",
    hourly_rate_windows: [
      { start: "07:00", end: "17:00", hourly_rate: 45 },
      { start: "17:00", end: "22:00", hourly_rate: 60 },
    ],
    amenities: ["lights", "parking", "restrooms", "seating"],
    available_hours: { open: "07:00", close: "22:00" },
    type: "indoor",
    surface: "sport_court",
    status: "active",
  },
  {
    id: "court-cebu-3",
    venue_id: "venue-cebubay",
    name: "Court 1",
    location: "Cebu City",
    sport: "pickleball",
    image_url: "https://picsum.photos/seed/courtly-cebu-cover/800/450",
    hourly_rate_windows: [{ start: "08:00", end: "21:00", hourly_rate: 40 }],
    amenities: ["lights", "parking", "water_fountain"],
    available_hours: { open: "08:00", close: "21:00" },
    type: "indoor",
    surface: "sport_court",
    status: "active",
  },
];

const tournaments: Tournament[] = [
  {
    id: "tour-metro-smash",
    sport: "pickleball",
    name: "Metro Smash Cup",
    description:
      "Doubles bracket with prizes for top 3 pairs. USA Pickleball rules.",
    date: isoDate(soon),
    start_time: "08:00",
    end_time: "18:00",
    format: "doubles",
    skill_level: "intermediate",
    max_participants: 32,
    current_participants: 18,
    entry_fee: 35,
    prize: "₱25,000 prize pool + medals",
    location: "BGC Makati Sports Center",
    status: "registration_open",
  },
  {
    id: "tour-rookie",
    sport: "pickleball",
    name: "Weekend Rookie Series",
    description: "Friendly round-robin for newer players. Coaching on site.",
    date: isoDate(new Date(soon.getTime() + 86400000 * 3)),
    start_time: "09:00",
    end_time: "14:00",
    format: "round_robin",
    skill_level: "beginner",
    max_participants: 24,
    current_participants: 10,
    entry_fee: 20,
    prize: "Gear vouchers",
    location: "BGC Makati Sports Center",
    status: "registration_open",
  },
];

const openPlay: OpenPlaySession[] = [
  {
    id: "ops-sunset",
    sport: "pickleball",
    title: "Sunset Social Doubles",
    date: isoDate(new Date(today.getTime() + 86400000)),
    start_time: "18:30",
    end_time: "20:30",
    skill_level: "intermediate",
    location: "BGC Makati Sports Center",
    court_id: "court-bgcs-1",
    max_players: 16,
    current_players: 9,
    host_name: "Coach Ana",
    host_email: "ana@example.com",
    description: "Rotating partners every 20 minutes. All welcome after warm-up.",
    fee: 10,
    status: "open",
  },
  {
    id: "ops-beginner",
    sport: "pickleball",
    title: "Beginner Social",
    date: isoDate(new Date(today.getTime() + 86400000 * 2)),
    start_time: "19:00",
    end_time: "21:00",
    skill_level: "beginner",
    location: "BGC Makati Sports Center",
    court_id: "court-makati-2",
    max_players: 12,
    current_players: 5,
    host_name: "Makati Crew",
    fee: 0,
    status: "open",
  },
];

const splitDemoDate = isoDate(new Date(today.getTime() + 86400000 * 5));
/** One checkout split into two segments (unavailable hours in the middle). */
const SPLIT_DEMO_GROUP = "grp-demo-split-makati";

const bookings: Booking[] = [
  {
    id: "book-seed-1",
    court_id: "court-bgcs-1",
    court_name: "Court 1",
    sport: "pickleball",
    date: isoDate(new Date(today.getTime() + 86400000)),
    start_time: "10:00",
    end_time: "11:00",
    player_name: "Demo Player",
    player_email: "player@courtly.dev",
    players_count: 2,
    court_subtotal: 45,
    booking_fee: 3,
    total_cost: 48,
    status: "confirmed",
    created_date: new Date().toISOString(),
  },
  {
    id: "book-demo-split-a",
    court_id: "court-makati-2",
    court_name: "Court 2",
    sport: "pickleball",
    booking_group_id: SPLIT_DEMO_GROUP,
    date: splitDemoDate,
    start_time: "09:00",
    end_time: "14:00",
    player_name: "Alex Player",
    player_email: "player@courtly.dev",
    court_subtotal: 275,
    booking_fee: 4,
    total_cost: 279,
    status: "confirmed",
    notes:
      "Requested 9:00–18:00; 14:00–16:00 was unavailable so this became two reservations in one booking.",
    created_date: new Date().toISOString(),
  },
  {
    id: "book-demo-split-b",
    court_id: "court-makati-2",
    court_name: "Court 2",
    sport: "pickleball",
    booking_group_id: SPLIT_DEMO_GROUP,
    date: splitDemoDate,
    start_time: "16:00",
    end_time: "18:00",
    player_name: "Alex Player",
    player_email: "player@courtly.dev",
    court_subtotal: 110,
    booking_fee: 4,
    total_cost: 114,
    status: "confirmed",
    notes:
      "Requested 9:00–18:00; 14:00–16:00 was unavailable so this became two reservations in one booking.",
    created_date: new Date().toISOString(),
  },
  {
    id: "book-demo-completed",
    court_id: "court-bgcs-1",
    court_name: "Court 1",
    sport: "pickleball",
    date: isoDate(new Date(today.getTime() - 86400000)),
    start_time: "08:00",
    end_time: "09:00",
    player_name: "Alex Player",
    player_email: "player@courtly.dev",
    court_subtotal: 45,
    booking_fee: 3,
    total_cost: 48,
    status: "completed",
    notes: "Demo: past session to show Completed status.",
    created_date: new Date().toISOString(),
  },
  {
    id: "book-demo-makati-completed",
    court_id: "court-makati-2",
    court_name: "Court 2",
    sport: "pickleball",
    date: isoDate(new Date(today.getTime() - 86400000 * 2)),
    start_time: "12:00",
    end_time: "13:00",
    player_name: "River Guest",
    player_email: "guest@example.com",
    court_subtotal: 55,
    booking_fee: 4,
    total_cost: 59,
    status: "completed",
    notes: "Demo: completed visit for flagged-review scenario.",
    created_date: new Date().toISOString(),
  },
  {
    id: "book-seed-2",
    court_id: "court-cebu-3",
    court_name: "Court 1",
    sport: "pickleball",
    date: isoDate(new Date(today.getTime() + 86400000 * 2)),
    start_time: "14:00",
    end_time: "16:00",
    player_name: "River Guest",
    player_email: "guest@example.com",
    players_count: 4,
    court_subtotal: 80,
    booking_fee: 2,
    total_cost: 82,
    status: "confirmed",
    created_date: new Date().toISOString(),
  },
];

const registrations: TournamentRegistration[] = [];

/** Demo: Makati court blocked 14:00–16:00 on split-demo day (matches seeded split booking story). */
const courtClosures: CourtClosure[] = [
  {
    id: "clos-makati-demo",
    court_id: "court-makati-2",
    date: splitDemoDate,
    start_time: "14:00",
    end_time: "16:00",
    reason: "maintenance",
    note: "Scheduled surface maintenance",
    created_at: new Date().toISOString(),
  },
];

const venueClosures: VenueClosure[] = [];

const courtReviews: CourtReview[] = [
  {
    id: "rev-demo-bgcs",
    venue_id: "venue-bgcmakati",
    user_id: "user-player-1",
    user_name: "Alex Player",
    booking_id: "book-demo-completed",
    rating: 5,
    comment: "Great evening lights and breeze. Court was clean.",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  /** Flagged by demo court admin — shows on superadmin moderation queue. */
  {
    id: "rev-demo-flagged-makati",
    venue_id: "venue-bgcmakati",
    user_id: "user-guest-demo",
    user_name: "River Guest",
    booking_id: "book-demo-makati-completed",
    rating: 1,
    comment:
      "Worst court I've played on. Equipment broken and nobody at the desk.",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    flagged: true,
    flagged_at: new Date().toISOString(),
    flagged_by_user_id: DEMO_ADMIN_ID,
    flag_reason:
      "Guest never checked in for this slot — suspect review is fraudulent.",
  },
];

/** In-memory store for mock API route handlers (persists for dev server lifetime). */
export const mockDb = {
  venues,
  venueAdminAssignments,
  venueClosures,
  managedUsers,
  courts,
  bookings,
  tournaments,
  openPlay,
  registrations,
  courtClosures,
  courtReviews,
};

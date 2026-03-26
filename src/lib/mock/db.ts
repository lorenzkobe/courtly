import type {
  Booking,
  Court,
  CourtAccount,
  CourtClosure,
  CourtReview,
  ManagedUser,
  OpenPlaySession,
  Tournament,
  TournamentRegistration,
} from "@/lib/types/courtly";

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

const today = new Date();
const soon = new Date(today);
soon.setDate(soon.getDate() + 14);

/** Demo court admin (see auth login route ids) */
const DEMO_ADMIN_ID = "user-admin-1";

const courtAccounts: CourtAccount[] = [
  {
    id: "acct-skyline-sports",
    name: "Skyline Sports Group",
    contact_email: "ops@skyline-sports.example",
    status: "active",
    primary_admin_user_id: DEMO_ADMIN_ID,
    notes: "BGC + Makati venues",
    created_at: new Date().toISOString(),
  },
  {
    id: "acct-cebu-bay",
    name: "Cebu Bay Leisure",
    contact_email: "frontdesk@cebubay.example",
    status: "active",
    primary_admin_user_id: null,
    created_at: new Date().toISOString(),
  },
];

const managedUsers: ManagedUser[] = [
  {
    id: "user-admin-1",
    email: "admin@courtly.dev",
    full_name: "Court Admin",
    role: "admin",
    court_account_id: "acct-skyline-sports",
    created_at: new Date().toISOString(),
  },
  {
    id: "user-superadmin-1",
    email: "superadmin@courtly.dev",
    full_name: "Platform Superadmin",
    role: "superadmin",
    court_account_id: null,
    created_at: new Date().toISOString(),
  },
  {
    id: "user-player-1",
    email: "player@courtly.dev",
    full_name: "Alex Player",
    role: "user",
    court_account_id: null,
    created_at: new Date().toISOString(),
  },
];

const courts: Court[] = [
  {
    id: "court-bgcs-1",
    name: "BGC Skyline Court 1",
    location: "Bonifacio Global City, Taguig",
    sport: "pickleball",
    type: "outdoor",
    surface: "sport_court",
    image_url: "https://picsum.photos/seed/courtly-bgcs-cover/800/450",
    gallery_urls: [
      "https://picsum.photos/seed/courtly-bgcs-g1/1400/788",
      "https://picsum.photos/seed/courtly-bgcs-g2/1400/788",
      "https://picsum.photos/seed/courtly-bgcs-g3/1400/788",
    ],
    description:
      "Rooftop outdoor court with skyline views — great evening lights and breeze. Popular for doubles and open play.",
    map_latitude: 14.5515,
    map_longitude: 121.0483,
    hourly_rate: 45,
    hourly_rate_windows: [
      { start: "17:00", end: "22:00", hourly_rate: 60 },
    ],
    amenities: ["lights", "parking", "restrooms", "seating"],
    available_hours: { open: "07:00", close: "22:00" },
    status: "active",
    managed_by_user_id: DEMO_ADMIN_ID,
    court_account_id: "acct-skyline-sports",
  },
  {
    id: "court-makati-2",
    name: "Makati Social Club — Court A",
    location: "Makati City",
    sport: "pickleball",
    type: "indoor",
    surface: "wood",
    image_url: "https://picsum.photos/seed/courtly-makati-cover/800/450",
    gallery_urls: [
      "https://picsum.photos/seed/courtly-makati-g1/1400/788",
      "https://picsum.photos/seed/courtly-makati-g2/1400/788",
      "https://picsum.photos/seed/courtly-makati-g3/1400/788",
    ],
    description:
      "Competition-grade indoor wood surface, climate-controlled. Pro shop and lockers on the same floor.",
    map_latitude: 14.5547,
    map_longitude: 121.0244,
    hourly_rate: 55,
    amenities: ["lights", "restrooms", "pro_shop", "locker_room"],
    available_hours: { open: "06:00", close: "23:00" },
    status: "active",
    managed_by_user_id: DEMO_ADMIN_ID,
    court_account_id: "acct-skyline-sports",
  },
  {
    id: "court-cebu-3",
    name: "Cebu Bay Sports Hub — Court 3",
    location: "Cebu City",
    sport: "pickleball",
    type: "indoor",
    surface: "sport_court",
    image_url: "https://picsum.photos/seed/courtly-cebu-cover/800/450",
    gallery_urls: [
      "https://picsum.photos/seed/courtly-cebu-g1/1400/788",
      "https://picsum.photos/seed/courtly-cebu-g2/1400/788",
    ],
    description:
      "Spacious indoor sport court surface with easy parking — ideal for club nights and lessons.",
    map_latitude: 10.3157,
    map_longitude: 123.8854,
    hourly_rate: 40,
    amenities: ["lights", "parking", "water_fountain"],
    available_hours: { open: "08:00", close: "21:00" },
    status: "active",
    managed_by_user_id: null,
    court_account_id: "acct-cebu-bay",
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
    location: "BGC Skyline Courts",
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
    location: "Makati Social Club",
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
    location: "BGC Skyline Courts",
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
    location: "Makati Social Club",
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
    court_name: "BGC Skyline Court 1",
    sport: "pickleball",
    date: isoDate(new Date(today.getTime() + 86400000)),
    start_time: "10:00",
    end_time: "11:00",
    player_name: "Demo Player",
    player_email: "player@courtly.dev",
    players_count: 2,
    court_subtotal: 45,
    platform_fee: 2.25,
    total_cost: 47.25,
    status: "confirmed",
    created_date: new Date().toISOString(),
  },
  {
    id: "book-demo-split-a",
    court_id: "court-makati-2",
    court_name: "Makati Social Club — Court A",
    sport: "pickleball",
    booking_group_id: SPLIT_DEMO_GROUP,
    date: splitDemoDate,
    start_time: "09:00",
    end_time: "14:00",
    player_name: "Alex Player",
    player_email: "player@courtly.dev",
    court_subtotal: 275,
    platform_fee: 13.75,
    total_cost: 288.75,
    status: "confirmed",
    notes:
      "Requested 9:00–18:00; 14:00–16:00 was unavailable so this became two reservations in one booking.",
    created_date: new Date().toISOString(),
  },
  {
    id: "book-demo-split-b",
    court_id: "court-makati-2",
    court_name: "Makati Social Club — Court A",
    sport: "pickleball",
    booking_group_id: SPLIT_DEMO_GROUP,
    date: splitDemoDate,
    start_time: "16:00",
    end_time: "18:00",
    player_name: "Alex Player",
    player_email: "player@courtly.dev",
    court_subtotal: 110,
    platform_fee: 5.5,
    total_cost: 115.5,
    status: "confirmed",
    notes:
      "Requested 9:00–18:00; 14:00–16:00 was unavailable so this became two reservations in one booking.",
    created_date: new Date().toISOString(),
  },
  {
    id: "book-demo-completed",
    court_id: "court-bgcs-1",
    court_name: "BGC Skyline Court 1",
    sport: "pickleball",
    date: isoDate(new Date(today.getTime() - 86400000)),
    start_time: "08:00",
    end_time: "09:00",
    player_name: "Alex Player",
    player_email: "player@courtly.dev",
    court_subtotal: 45,
    platform_fee: 2.25,
    total_cost: 47.25,
    status: "completed",
    notes: "Demo: past session to show Completed status.",
    created_date: new Date().toISOString(),
  },
  {
    id: "book-demo-makati-completed",
    court_id: "court-makati-2",
    court_name: "Makati Social Club — Court A",
    sport: "pickleball",
    date: isoDate(new Date(today.getTime() - 86400000 * 2)),
    start_time: "12:00",
    end_time: "13:00",
    player_name: "River Guest",
    player_email: "guest@example.com",
    court_subtotal: 55,
    platform_fee: 2.75,
    total_cost: 57.75,
    status: "completed",
    notes: "Demo: completed visit for flagged-review scenario.",
    created_date: new Date().toISOString(),
  },
  {
    id: "book-seed-2",
    court_id: "court-cebu-3",
    court_name: "Cebu Bay Sports Hub — Court 3",
    sport: "pickleball",
    date: isoDate(new Date(today.getTime() + 86400000 * 2)),
    start_time: "14:00",
    end_time: "16:00",
    player_name: "River Guest",
    player_email: "guest@example.com",
    players_count: 4,
    court_subtotal: 80,
    platform_fee: 4,
    total_cost: 84,
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

const courtReviews: CourtReview[] = [
  {
    id: "rev-demo-bgcs",
    court_id: "court-bgcs-1",
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
    court_id: "court-makati-2",
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
  courtAccounts,
  managedUsers,
  courts,
  bookings,
  tournaments,
  openPlay,
  registrations,
  courtClosures,
  courtReviews,
};

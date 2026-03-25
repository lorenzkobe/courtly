import type {
  Booking,
  Court,
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

const courts: Court[] = [
  {
    id: "court-bgcs-1",
    name: "BGC Skyline Court 1",
    location: "Bonifacio Global City, Taguig",
    type: "outdoor",
    surface: "sport_court",
    image_url:
      "https://images.unsplash.com/photo-1622163642998-1ea49b0e6f3f?w=800&q=80",
    hourly_rate: 45,
    amenities: ["lights", "parking", "restrooms", "seating"],
    available_hours: { open: "07:00", close: "22:00" },
    status: "active",
    managed_by_user_id: DEMO_ADMIN_ID,
  },
  {
    id: "court-makati-2",
    name: "Makati Social Club — Court A",
    location: "Makati City",
    type: "indoor",
    surface: "wood",
    image_url:
      "https://images.unsplash.com/photo-1595435934249-5dfced6acedd?w=800&q=80",
    hourly_rate: 55,
    amenities: ["lights", "restrooms", "pro_shop", "locker_room"],
    available_hours: { open: "06:00", close: "23:00" },
    status: "active",
    managed_by_user_id: DEMO_ADMIN_ID,
  },
  {
    id: "court-cebu-3",
    name: "Cebu Bay Sports Hub — Court 3",
    location: "Cebu City",
    type: "indoor",
    surface: "sport_court",
    image_url:
      "https://images.unsplash.com/photo-1554068865-24cecd4e34b8?w=800&q=80",
    hourly_rate: 40,
    amenities: ["lights", "parking", "water_fountain"],
    available_hours: { open: "08:00", close: "21:00" },
    status: "active",
    managed_by_user_id: null,
  },
];

const tournaments: Tournament[] = [
  {
    id: "tour-metro-smash",
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

const bookings: Booking[] = [
  {
    id: "book-seed-1",
    court_id: "court-bgcs-1",
    court_name: "BGC Skyline Court 1",
    date: isoDate(new Date(today.getTime() + 86400000)),
    start_time: "10:00",
    end_time: "11:00",
    player_name: "Demo Player",
    player_email: "player@courtly.dev",
    players_count: 2,
    total_cost: 45,
    status: "confirmed",
    created_date: new Date().toISOString(),
  },
  {
    id: "book-seed-2",
    court_id: "court-cebu-3",
    court_name: "Cebu Bay Sports Hub — Court 3",
    date: isoDate(new Date(today.getTime() + 86400000 * 2)),
    start_time: "14:00",
    end_time: "16:00",
    player_name: "River Guest",
    player_email: "guest@example.com",
    players_count: 4,
    total_cost: 80,
    status: "confirmed",
    created_date: new Date().toISOString(),
  },
];

const registrations: TournamentRegistration[] = [];

/** In-memory store for mock API route handlers (persists for dev server lifetime). */
export const mockDb = {
  courts,
  bookings,
  tournaments,
  openPlay,
  registrations,
};

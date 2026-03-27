import { mockDb } from "@/lib/mock/db";
import { reviewSummaryForVenue } from "@/lib/review-summary";
import type { Court } from "@/lib/types/courtly";

/** Merge venue fields and review summary onto a stored court row (mock API responses). */
export function withVenueHydration(court: Court): Court {
  const venue = mockDb.venues.find((row) => row.id === court.venue_id);
  return {
    ...court,
    establishment_name: venue?.name ?? court.establishment_name,
    contact_phone: venue?.contact_phone ?? court.contact_phone,
    location: venue?.location ?? court.location,
    sport: venue?.sport ?? court.sport,
    image_url: venue?.image_url ?? court.image_url,
    type: "indoor",
    surface: "sport_court",
    hourly_rate: venue?.hourly_rate ?? court.hourly_rate,
    hourly_rate_windows: venue?.hourly_rate_windows ?? court.hourly_rate_windows,
    amenities: venue?.amenities ?? court.amenities,
    available_hours: venue
      ? { open: venue.opens_at, close: venue.closes_at }
      : court.available_hours,
    map_latitude: venue?.map_latitude,
    map_longitude: venue?.map_longitude,
    review_summary: reviewSummaryForVenue(court.venue_id, mockDb.courtReviews),
  };
}

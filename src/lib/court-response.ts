import { reviewSummaryForVenue } from "@/lib/review-summary";
import { pricingSpanFromRanges } from "@/lib/venue-price-ranges";
import type { Court, CourtReview, Venue } from "@/lib/types/courtly";

/** Merge venue fields and review summary onto a stored court row (mock API responses). */
export function withVenueHydration(
  court: Court,
  venues: Venue[],
  reviews: CourtReview[],
): Court {
  const venue = venues.find((row) => row.id === court.venue_id);
  const windows = venue?.hourly_rate_windows ?? court.hourly_rate_windows ?? [];
  const span = pricingSpanFromRanges(windows);
  return {
    ...court,
    establishment_name: venue?.name ?? court.establishment_name,
    contact_phone: venue?.contact_phone ?? court.contact_phone,
    facebook_url: venue?.facebook_url ?? court.facebook_url,
    instagram_url: venue?.instagram_url ?? court.instagram_url,
    location: venue?.location ?? court.location,
    sport: venue?.sport ?? court.sport,
    image_url: venue?.image_url ?? court.image_url,
    type: "indoor",
    surface: "sport_court",
    hourly_rate_windows: windows,
    amenities: venue?.amenities ?? court.amenities,
    available_hours: span ?? court.available_hours,
    map_latitude: venue?.map_latitude,
    map_longitude: venue?.map_longitude,
    review_summary: reviewSummaryForVenue(court.venue_id, reviews),
  };
}

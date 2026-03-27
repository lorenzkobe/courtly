import type { CourtReview, CourtReviewSummary } from "@/lib/types/courtly";

export function reviewSummaryForVenue(
  venueId: string,
  reviews: CourtReview[],
): CourtReviewSummary {
  const list = reviews.filter((review) => review.venue_id === venueId);
  if (list.length === 0) {
    return { average_rating: 0, review_count: 0 };
  }
  const sum = list.reduce((acc, review) => acc + review.rating, 0);
  return {
    average_rating: Math.round((sum / list.length) * 10) / 10,
    review_count: list.length,
  };
}

import type { CourtReview, CourtReviewSummary } from "@/lib/types/courtly";

export function reviewSummaryForCourt(
  courtId: string,
  reviews: CourtReview[],
): CourtReviewSummary {
  const list = reviews.filter((r) => r.court_id === courtId);
  if (list.length === 0) {
    return { average_rating: 0, review_count: 0 };
  }
  const sum = list.reduce((s, r) => s + r.rating, 0);
  return {
    average_rating: Math.round((sum / list.length) * 10) / 10,
    review_count: list.length,
  };
}

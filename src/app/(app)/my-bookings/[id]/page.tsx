"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowLeft,
  Calendar,
  Clock,
  ExternalLink,
  MapPin,
  Star,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import PageHeader from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { apiErrorMessage } from "@/lib/api/api-error-message";
import { courtlyApi } from "@/lib/api/courtly-client";
import { queryKeys } from "@/lib/query/query-keys";
import { formatPhp } from "@/lib/format-currency";
import {
  bookingDurationHours,
  formatTimeShort,
} from "@/lib/booking-range";
import { formatAmenityLabel } from "@/lib/format-amenity";
import { useAuth } from "@/lib/auth/auth-context";
import { useBookingsRealtime } from "@/lib/bookings/use-bookings-realtime";
import { cn, formatStatusLabel } from "@/lib/utils";
import type { Booking, Court, CourtReview } from "@/lib/types/courtly";

const statusStyles: Record<string, string> = {
  pending_payment: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  confirmed: "bg-primary/10 text-primary border-primary/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
  completed: "bg-muted text-muted-foreground border-border",
};

/** Remount when `myReview` appears/changes so draft state stays in sync without an effect. */
function BookingReviewSection({
  bookingId,
  court,
  myReview,
}: {
  bookingId: string;
  court: Court;
  myReview: CourtReview | undefined;
}) {
  const queryClient = useQueryClient();
  const [ratingDraft, setRatingDraft] = useState(myReview?.rating ?? 0);
  const [commentDraft, setCommentDraft] = useState(myReview?.comment ?? "");
  const [confirmDeleteReviewOpen, setConfirmDeleteReviewOpen] = useState(false);

  const invalidateReviews = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: queryKeys.reviews.venue(court.venue_id),
    });
    void queryClient.invalidateQueries({ queryKey: queryKeys.courts.detail(court.id) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.courts.all() });
  }, [queryClient, court.id, court.venue_id]);

  const createReviewMut = useMutation({
    mutationFn: async () => {
      await courtlyApi.venueReviews.create(court.venue_id, {
        booking_id: bookingId,
        rating: ratingDraft,
        comment: commentDraft.trim() || undefined,
      });
    },
    onSuccess: () => {
      invalidateReviews();
      toast.success("Thanks for your review!");
    },
    onError: (err: unknown) =>
      toast.error(apiErrorMessage(err, "Could not save review")),
  });

  const updateReviewMut = useMutation({
    mutationFn: async () => {
      if (!myReview) throw new Error("No review");
      await courtlyApi.venueReviews.update(court.venue_id, myReview.id, {
        rating: ratingDraft,
        comment: commentDraft.trim() || undefined,
      });
    },
    onSuccess: () => {
      invalidateReviews();
      toast.success("Review updated");
    },
    onError: (err: unknown) =>
      toast.error(apiErrorMessage(err, "Could not update review")),
  });

  const deleteReviewMut = useMutation({
    mutationFn: async () => {
      if (!myReview) throw new Error("No review");
      await courtlyApi.venueReviews.remove(court.venue_id, myReview.id);
    },
    onSuccess: () => {
      invalidateReviews();
      toast.success("Review removed");
    },
    onError: (err: unknown) =>
      toast.error(apiErrorMessage(err, "Could not remove review")),
  });

  return (
    <>
      <ConfirmDialog
        open={confirmDeleteReviewOpen}
        onOpenChange={setConfirmDeleteReviewOpen}
        title="Delete your review?"
        description="This action cannot be undone."
        confirmLabel="Delete review"
        isPending={deleteReviewMut.isPending}
        onConfirm={() => {
          deleteReviewMut.mutate();
          setConfirmDeleteReviewOpen(false);
        }}
      />
      <Card className="border-border/50">
        <CardContent className="space-y-4 p-6">
          <h2 className="font-heading text-lg font-semibold text-foreground">
            {myReview ? "Your review" : "Rate this court"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {myReview
              ? "Update your star rating or note, or remove your review."
              : "Share a 1–5 star rating after your visit. A short note is optional."}
          </p>
          <div className="space-y-2">
            <Label>Stars</Label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((starValue) => (
                <button
                  key={starValue}
                  type="button"
                  onClick={() => setRatingDraft(starValue)}
                  className="rounded-md p-1 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`${starValue} stars`}
                >
                  <Star
                    className={cn(
                      "h-8 w-8",
                      starValue <= ratingDraft
                        ? "fill-amber-400 text-amber-400"
                        : "text-muted-foreground/30",
                    )}
                  />
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="review-comment">Review (optional)</Label>
            <Textarea
              id="review-comment"
              rows={3}
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
              placeholder="How was the court?"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {myReview ? (
              <>
                <Button
                  type="button"
                  disabled={
                    ratingDraft < 1 ||
                    ratingDraft > 5 ||
                    updateReviewMut.isPending
                  }
                  onClick={() => updateReviewMut.mutate()}
                >
                  Save changes
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="border-destructive/30 text-destructive hover:bg-destructive/10"
                  disabled={deleteReviewMut.isPending}
                  onClick={() => setConfirmDeleteReviewOpen(true)}
                >
                  <Trash2 className="mr-1.5 h-4 w-4" />
                  Delete review
                </Button>
              </>
            ) : (
              <Button
                type="button"
                disabled={
                  ratingDraft < 1 ||
                  ratingDraft > 5 ||
                  createReviewMut.isPending
                }
                onClick={() => createReviewMut.mutate()}
              >
                Submit review
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </>
  );
}

export default function BookingDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const bookingId = params.id;
  const bookingRealtimeKeys = useMemo(
    () => [["my-booking-detail", bookingId, "with-group"], queryKeys.bookings.all()],
    [bookingId],
  );
  useBookingsRealtime({
    playerEmail: user?.email,
    enabled: !!user?.email,
    queryKeysToInvalidate: bookingRealtimeKeys,
  });

  const { data: bookingPayload, isLoading: loadingBooking } = useQuery({
    queryKey: ["my-booking-detail", bookingId, "with-group"],
    queryFn: async () => {
      const { data } = await courtlyApi.bookings.getDetailContext(bookingId);
      return data;
    },
    enabled: !!bookingId,
  });
  const booking = bookingPayload?.booking;
  const groupMembers = bookingPayload?.group_segments;
  const court = bookingPayload?.court;

  const segments = useMemo((): Booking[] => {
    if (!booking) return [];
    if (booking.booking_group_id && (groupMembers?.length ?? 0) > 0) {
      return groupMembers ?? [];
    }
    return [booking];
  }, [booking, groupMembers]);

  const combinedNote = useMemo(() => {
    const texts = new Set<string>();
    for (const s of segments) {
      const t = s.notes?.trim();
      if (t) texts.add(t);
    }
    return [...texts].join("\n\n");
  }, [segments]);

  const sessionTotal = useMemo(
    () => segments.reduce((sum, s) => sum + (s.total_cost ?? 0), 0),
    [segments],
  );

  const isMyBooking =
    user &&
    booking &&
    booking.player_email?.toLowerCase() === user.email.toLowerCase();
  const visitCompleted = booking?.status === "completed";
  const shouldFetchReviews =
    Boolean(isMyBooking) && Boolean(visitCompleted) && Boolean(court?.venue_id);

  const reviews = useMemo(
    () => (shouldFetchReviews ? (bookingPayload?.reviews ?? []) : []),
    [shouldFetchReviews, bookingPayload?.reviews],
  );
  const loadingReviews = loadingBooking && shouldFetchReviews;

  const myReview = useMemo(() => {
    if (!reviews || !bookingId) return undefined;
    return reviews.find(
      (review) => review.booking_id === bookingId,
    );
  }, [reviews, bookingId]);

  const loading = loadingBooking;

  const hasMapPin =
    court &&
    court.map_latitude != null &&
    court.map_longitude != null &&
    Number.isFinite(court.map_latitude) &&
    Number.isFinite(court.map_longitude);
  const mapLat = court?.map_latitude ?? 0;
  const mapLon = court?.map_longitude ?? 0;
  const mapOpenHref = court
    ? hasMapPin
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${mapLat},${mapLon}`)}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(court.location)}`
    : "#";

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-6 py-8 md:px-10">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-12 text-center md:px-10">
        <p className="text-muted-foreground">Booking not found.</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/my-bookings">Back to My Bookings</Link>
        </Button>
      </div>
    );
  }

  const multi = segments.length > 1;

  const canReviewBooking = Boolean(isMyBooking) && Boolean(visitCompleted);
  const canRate =
    canReviewBooking &&
    !loadingReviews &&
    !myReview &&
    booking.court_id;
  const canEditReview = Boolean(
    canReviewBooking &&
    !loadingReviews &&
    myReview &&
    user &&
    myReview.user_id === user.id,
  );

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 md:px-10">
      <Button
        variant="ghost"
        className="mb-4 -ml-2 text-muted-foreground"
        onClick={() => router.push("/my-bookings")}
      >
        <ArrowLeft className="mr-2 h-4 w-4" /> My bookings
      </Button>

      <PageHeader
        title="Booking details"
        subtitle={
          multi
            ? `${booking.court_name ?? "Court"} — one checkout, ${segments.length} reserved times`
            : (booking.court_name ?? "Court reservation")
        }
      />

      <div className="space-y-6">
        <Card className="border-border/50">
          <CardContent className="space-y-4 p-6">
            <h2 className="font-heading text-lg font-semibold text-foreground">
              Summary
            </h2>
            <dl className="grid gap-3 text-sm sm:grid-cols-[8rem_1fr] sm:gap-x-6">
              <dt className="text-muted-foreground">Court</dt>
              <dd className="font-medium">{booking.court_name ?? "—"}</dd>
              <dt className="text-muted-foreground">Date</dt>
              <dd className="flex items-center gap-2 font-medium">
                <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                {booking.date
                  ? format(new Date(`${booking.date}T12:00:00`), "EEE, MMM d, yyyy")
                  : "—"}
              </dd>
            </dl>

            <div className="space-y-3 border-t border-border/60 pt-4">
              <p className="text-xs font-medium text-muted-foreground">
                Reserved time{multi ? "s" : ""}
              </p>
              <ul className="space-y-3">
                {segments.map((segment) => {
                  const hours = bookingDurationHours(segment);
                  return (
                    <li
                      key={segment.id}
                      className="flex flex-col gap-2 rounded-lg border border-border/50 bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-foreground">
                          <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          {formatTimeShort(segment.start_time)} –{" "}
                          {formatTimeShort(segment.end_time)}
                          <span className="text-muted-foreground">
                            ({hours} {hours === 1 ? "hr" : "hrs"})
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant="outline"
                            className={statusStyles[segment.status] ?? ""}
                          >
                            {formatStatusLabel(segment.status)}
                          </Badge>
                          <span className="text-sm font-semibold text-foreground tabular-nums">
                            {formatPhp(segment.total_cost ?? 0)}
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="flex items-center justify-between border-t border-border/60 pt-4 text-sm">
              <span className="font-medium text-muted-foreground">Total</span>
              <span className="font-heading text-lg font-bold text-primary tabular-nums">
                {formatPhp(sessionTotal)}
              </span>
            </div>

            {combinedNote ? (
              <div className="border-t border-border/60 pt-4">
                <p className="mb-1 text-sm text-muted-foreground">Your note</p>
                <p className="whitespace-pre-wrap text-sm text-foreground">
                  {combinedNote}
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {canRate || canEditReview ? (
          court ? (
            <BookingReviewSection
              key={myReview?.id ?? "new-review"}
              bookingId={bookingId}
              court={court}
              myReview={myReview}
            />
          ) : null
        ) : null}

        {court ? (
          <Card className="border-border/50">
            <CardContent className="space-y-5 p-6">
              <h2 className="font-heading text-lg font-semibold text-foreground">
                Venue
              </h2>
              <div className="rounded-xl border border-border/60 bg-muted/10 p-4">
                <p className="text-base font-semibold text-foreground">
                  {court.establishment_name ?? booking.establishment_name ?? "—"}
                </p>
                <p className="mt-0.5 text-sm text-muted-foreground">{court.name}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-3 rounded-xl border border-border/60 p-4 text-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Location
                  </p>
                  <div className="space-y-3">
                    <p className="flex items-start gap-2 text-foreground">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0">{court.location}</span>
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-fit"
                      asChild
                    >
                      <a
                        href={mapOpenHref}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Open in Map
                        <ExternalLink className="ml-1.5 h-3 w-3 opacity-70" />
                      </a>
                    </Button>
                  </div>
                </div>
                <div className="space-y-3 rounded-xl border border-border/60 p-4 text-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Contact
                  </p>
                  <p className="font-medium text-foreground">{court.contact_phone ?? "—"}</p>
                  {court.facebook_url || court.instagram_url ? (
                    <div className="flex flex-wrap gap-2 pt-0.5">
                      {court.facebook_url ? (
                        <a
                          href={court.facebook_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-muted/20 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-muted/40 hover:underline"
                        >
                          Facebook <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                      {court.instagram_url ? (
                        <a
                          href={court.instagram_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-muted/20 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-muted/40 hover:underline"
                        >
                          Instagram <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
              {court.amenities?.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {court.amenities.map((amenity) => (
                    <Badge key={amenity} variant="outline" className="font-normal">
                      {formatAmenityLabel(amenity)}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

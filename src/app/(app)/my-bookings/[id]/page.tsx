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
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import PageHeader from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { courtlyApi } from "@/lib/api/courtly-client";
import { formatPhp } from "@/lib/format-currency";
import {
  bookingDurationHours,
  formatTimeShort,
} from "@/lib/booking-range";
import { formatAmenityLabel } from "@/lib/format-amenity";
import { useAuth } from "@/lib/auth/auth-context";
import { cn, formatStatusLabel } from "@/lib/utils";
import type { Booking, CourtReview } from "@/lib/types/courtly";

const statusStyles: Record<string, string> = {
  confirmed: "bg-primary/10 text-primary border-primary/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
  completed: "bg-muted text-muted-foreground border-border",
};

export default function BookingDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const bookingId = params.id;

  const { data: booking, isLoading: loadingBooking } = useQuery({
    queryKey: ["booking", bookingId],
    queryFn: async () => {
      const { data } = await courtlyApi.bookings.get(bookingId);
      return data;
    },
    enabled: !!bookingId,
  });

  const { data: groupMembers = [], isLoading: loadingGroup } = useQuery({
    queryKey: ["booking-group", booking?.booking_group_id, user?.email],
    queryFn: async () => {
      const { data } = await courtlyApi.bookings.list({
        player_email: user!.email,
        booking_group_id: booking!.booking_group_id!,
      });
      return data.sort((a, b) => a.start_time.localeCompare(b.start_time));
    },
    enabled: !!booking?.booking_group_id && !!user?.email,
  });

  const segments = useMemo((): Booking[] => {
    if (!booking) return [];
    if (booking.booking_group_id && groupMembers.length > 0) {
      return groupMembers;
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

  const { data: court, isLoading: loadingCourt } = useQuery({
    queryKey: ["court", booking?.court_id],
    queryFn: async () => {
      const { data } = await courtlyApi.courts.get(booking!.court_id);
      return data;
    },
    enabled: !!booking?.court_id,
  });

  const { data: reviewBundle } = useQuery({
    queryKey: ["court-reviews", booking?.court_id],
    queryFn: async () => {
      const { data: payload } = await courtlyApi.courtReviews.bundle(
        booking!.court_id,
      );
      if (payload == null)
        return { court: undefined, reviews: [] as CourtReview[] };
      if (Array.isArray(payload)) {
        return { court: undefined, reviews: payload };
      }
      const reviews = Array.isArray(payload.reviews) ? payload.reviews : [];
      return { ...payload, reviews };
    },
    enabled: !!booking?.court_id,
  });

  const myReview = useMemo(() => {
    if (!reviewBundle?.reviews || !bookingId) return undefined;
    return reviewBundle.reviews.find((r) => r.booking_id === bookingId);
  }, [reviewBundle, bookingId]);

  const [ratingDraft, setRatingDraft] = useState(0);
  const [commentDraft, setCommentDraft] = useState("");
  const [confirmDeleteReviewOpen, setConfirmDeleteReviewOpen] = useState(false);

  useEffect(() => {
    if (myReview) {
      setRatingDraft(myReview.rating);
      setCommentDraft(myReview.comment ?? "");
    } else {
      setRatingDraft(0);
      setCommentDraft("");
    }
  }, [myReview]);

  const invalidateReviews = () => {
    void queryClient.invalidateQueries({
      queryKey: ["court-reviews", booking?.court_id],
    });
    void queryClient.invalidateQueries({ queryKey: ["court", booking?.court_id] });
    void queryClient.invalidateQueries({ queryKey: ["courts"] });
  };

  const createReviewMut = useMutation({
    mutationFn: async () => {
      if (!booking?.court_id) throw new Error("No court");
      await courtlyApi.courtReviews.create(booking.court_id, {
        booking_id: bookingId,
        rating: ratingDraft,
        comment: commentDraft.trim() || undefined,
      });
    },
    onSuccess: () => {
      invalidateReviews();
      toast.success("Thanks for your review!");
    },
    onError: () => toast.error("Could not save review"),
  });

  const updateReviewMut = useMutation({
    mutationFn: async () => {
      if (!booking?.court_id || !myReview) throw new Error("No review");
      await courtlyApi.courtReviews.update(
        booking.court_id,
        myReview.id,
        {
          rating: ratingDraft,
          comment: commentDraft.trim() || undefined,
        },
      );
    },
    onSuccess: () => {
      invalidateReviews();
      toast.success("Review updated");
    },
    onError: () => toast.error("Could not update review"),
  });

  const deleteReviewMut = useMutation({
    mutationFn: async () => {
      if (!booking?.court_id || !myReview) throw new Error("No review");
      await courtlyApi.courtReviews.remove(booking.court_id, myReview.id);
    },
    onSuccess: () => {
      invalidateReviews();
      toast.success("Review removed");
    },
  });

  const loading =
    loadingBooking ||
    (booking?.booking_group_id && loadingGroup) ||
    (booking?.court_id && loadingCourt);

  const hasMapPin =
    court &&
    court.map_latitude != null &&
    court.map_longitude != null &&
    Number.isFinite(court.map_latitude) &&
    Number.isFinite(court.map_longitude);
  const mapLat = court?.map_latitude ?? 0;
  const mapLon = court?.map_longitude ?? 0;
  const mapBboxPad = 0.018;
  const mapEmbedSrc =
    hasMapPin && court
      ? `https://www.openstreetmap.org/export/embed.html?bbox=${mapLon - mapBboxPad},${mapLat - mapBboxPad},${mapLon + mapBboxPad},${mapLat + mapBboxPad}&layer=mapnik`
      : null;
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

  const isMyBooking =
    user &&
    booking.player_email?.toLowerCase() === user.email.toLowerCase();
  const visitCompleted = booking.status === "completed";
  const canRate =
    isMyBooking &&
    visitCompleted &&
    !myReview &&
    booking.court_id;
  const canEditReview = Boolean(
    isMyBooking && myReview && user && myReview.user_id === user.id,
  );

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 md:px-10">
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
                {segments.map((s) => {
                  const hours = bookingDurationHours(s);
                  return (
                    <li
                      key={s.id}
                      className="flex flex-col gap-2 rounded-lg border border-border/50 bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium text-foreground">
                          <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          {formatTimeShort(s.start_time)} –{" "}
                          {formatTimeShort(s.end_time)}
                          <span className="text-muted-foreground">
                            ({hours} {hours === 1 ? "hr" : "hrs"})
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge
                            variant="outline"
                            className={statusStyles[s.status] ?? ""}
                          >
                            {formatStatusLabel(s.status)}
                          </Badge>
                          <span className="text-sm font-semibold text-foreground tabular-nums">
                            {formatPhp(s.total_cost ?? 0)}
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
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setRatingDraft(n)}
                      className="rounded-md p-1 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      aria-label={`${n} stars`}
                    >
                      <Star
                        className={cn(
                          "h-8 w-8",
                          n <= ratingDraft
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
        ) : null}

        {court ? (
          <Card className="border-border/50">
            <CardContent className="space-y-4 p-6">
              <h2 className="font-heading text-lg font-semibold text-foreground">
                Venue
              </h2>
              <div className="space-y-1 text-sm">
                <p className="font-medium text-foreground">
                  {court.establishment_name ?? booking.establishment_name ?? "—"}
                </p>
                <p className="text-muted-foreground">{court.name}</p>
                <p className="flex items-start gap-2 text-muted-foreground">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {court.location}
                </p>
                <p className="text-muted-foreground">Contact: {court.contact_phone ?? "—"}</p>
              </div>
              {court.amenities?.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {court.amenities.map((a) => (
                    <Badge key={a} variant="outline" className="font-normal">
                      {formatAmenityLabel(a)}
                    </Badge>
                  ))}
                </div>
              ) : null}
              <p className="text-sm text-muted-foreground">
                {hasMapPin
                  ? "Use the map below or open Google Maps for directions to the pinned location."
                  : "Search the address in your maps app for directions."}
              </p>
              {mapEmbedSrc ? (
                <div className="overflow-hidden rounded-2xl border border-border">
                  <iframe
                    title={`Map — ${court.name}`}
                    src={mapEmbedSrc}
                    className="aspect-video w-full max-h-56 border-0"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={mapOpenHref}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MapPin className="mr-1.5 h-3.5 w-3.5" />
                    Open in Map
                    <ExternalLink className="ml-1.5 h-3 w-3 opacity-70" />
                  </a>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

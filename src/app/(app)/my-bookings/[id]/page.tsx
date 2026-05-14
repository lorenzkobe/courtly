"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowLeft,
  Calendar,
  Clock,
  ExternalLink,
  Loader2,
  MapPin,
  RefreshCw,
  Star,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import PageHeader from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { apiErrorMessage } from "@/lib/api/api-error-message";
import { httpStatusOf } from "@/lib/api/http-status";
import { courtlyApi } from "@/lib/api/courtly-client";
import { queryKeys } from "@/lib/query/query-keys";
import { formatPhp } from "@/lib/format-currency";
import {
  bookingDurationHours,
  formatTimeShort,
  formatHourToken,
} from "@/lib/booking-range";
import { segmentPricingTiers } from "@/lib/court-pricing";
import { formatAmenityLabel } from "@/lib/format-amenity";
import { useAuth } from "@/lib/auth/auth-context";
import {
  bookingSegmentStartMs,
  segmentStatusForDisplay,
} from "@/lib/bookings/booking-time-display";
import {
  aggregateSessionStatus,
  sessionFullyCompletedForReview,
} from "@/lib/bookings/session-display-status";
import { isValidOpenPlayDuprRange, roundDuprBound } from "@/lib/open-play/dupr-range";
import { cn, formatBookingStatusLabel } from "@/lib/utils";
import { BookingStatusStepper } from "@/components/booking/BookingStatusStepper";
import { VenueMapPinPicker } from "@/components/admin/VenueMapPinPicker";
import type { Booking, Court, CourtReview } from "@/lib/types/courtly";
import { isValidPhMobile } from "@/lib/validation/person-fields";

const statusStyles: Record<string, string> = {
  pending_payment: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  pending_confirmation: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  confirmed: "bg-primary/10 text-primary border-primary/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
  completed: "bg-muted text-muted-foreground border-border",
  refund: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  refunded: "bg-muted text-muted-foreground border-border",
  __session_mixed__: "bg-sky-500/10 text-sky-900 border-sky-500/25 dark:text-sky-100",
};

/** Remount when `myReview` appears/changes so draft state stays in sync without an effect. */
function BookingReviewSection({
  bookingId,
  court,
  myReview,
  serverNowMs,
}: {
  bookingId: string;
  court: Court;
  myReview: CourtReview | undefined;
  serverNowMs: number | null;
}) {
  const queryClient = useQueryClient();
  const [ratingDraft, setRatingDraft] = useState(myReview?.rating ?? 0);
  const [commentDraft, setCommentDraft] = useState(myReview?.comment ?? "");
  const [confirmDeleteReviewOpen, setConfirmDeleteReviewOpen] = useState(false);
  const canModifyExistingReview = useMemo(() => {
    if (!myReview) return true;
    if (serverNowMs == null) return true;
    const createdAtMs = Date.parse(myReview.created_at);
    if (Number.isNaN(createdAtMs)) return false;
    return serverNowMs - createdAtMs <= 24 * 60 * 60 * 1000;
  }, [myReview, serverNowMs]);
  const reviewInputsLocked = Boolean(myReview && !canModifyExistingReview);
  const reviewEditDeadlineLabel = useMemo(() => {
    if (!myReview) return null;
    const createdAtMs = Date.parse(myReview.created_at);
    if (Number.isNaN(createdAtMs)) return null;
    return format(new Date(createdAtMs + 24 * 60 * 60 * 1000), "PPp");
  }, [myReview]);

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
          <div>
            <h2 className="font-heading text-lg font-semibold text-foreground pb-2">
              {myReview ? "Your review" : "Rate this court"}
            </h2>
            <p className="text-xs text-muted-foreground">
              {myReview
                ? "Update your star rating or note, or remove your review."
                : "Share a 1–5 star rating after your visit. A short note is optional."}
            </p>
            {myReview ? (
              <p className="mt-1 text-xs text-muted-foreground">
                You can edit or delete your review within 24 hours of posting.
                {!canModifyExistingReview
                  ? reviewEditDeadlineLabel
                    ? ` Editing window ended on ${reviewEditDeadlineLabel}.`
                    : " Editing window has ended."
                  : ""}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label>Stars</Label>
            <div
              className={cn("flex gap-1", reviewInputsLocked && "opacity-60")}
            >
              {[1, 2, 3, 4, 5].map((starValue) => (
                <button
                  key={starValue}
                  type="button"
                  disabled={reviewInputsLocked}
                  onClick={() => setRatingDraft(starValue)}
                  className={cn(
                    "rounded-md p-1 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    reviewInputsLocked
                      ? "cursor-not-allowed"
                      : "hover:bg-muted",
                  )}
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
              disabled={reviewInputsLocked}
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
                    updateReviewMut.isPending ||
                    !canModifyExistingReview
                  }
                  onClick={() => updateReviewMut.mutate()}
                >
                  Save changes
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="border-destructive/30 text-destructive hover:bg-destructive/10"
                  disabled={deleteReviewMut.isPending || !canModifyExistingReview}
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
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const bookingId = params.id;
  const {
    data: bookingPayload,
    isLoading: loadingBooking,
    isError: isBookingError,
    error: bookingError,
    isFetching: fetchingBooking,
    refetch,
  } = useQuery({
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
  const serverNowMs = useMemo(() => {
    const raw = bookingPayload?.server_now;
    if (!raw) return null;
    const parsed = Date.parse(raw);
    return Number.isNaN(parsed) ? null : parsed;
  }, [bookingPayload?.server_now]);
  const [clientNowMs, setClientNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setClientNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const statusNowMs = serverNowMs ?? clientNowMs;
  const bookingMissing =
    !loadingBooking &&
    !bookingPayload &&
    (!isBookingError || httpStatusOf(bookingError) === 404);
  const bookingFallbackPath =
    user?.role === "admin" || user?.role === "superadmin"
      ? "/admin/bookings"
      : "/my-bookings";
  useEffect(() => {
    if (!bookingMissing) return;
    router.replace(bookingFallbackPath);
  }, [bookingFallbackPath, bookingMissing, router]);

  const segments = useMemo((): Booking[] => {
    if (!booking) return [];
    if (booking.booking_group_id && (groupMembers?.length ?? 0) > 0) {
      return groupMembers ?? [];
    }
    return [booking];
  }, [booking, groupMembers]);

  /** Distinct courts in this checkout (order follows first segment appearance). */
  const sessionCourts = useMemo(() => {
    const byId = new Map<string, string>();
    for (const s of segments) {
      if (!byId.has(s.court_id)) {
        const label = (s.court_name ?? "").trim() || "Court";
        byId.set(s.court_id, label);
      }
    }
    const labelsInOrder = [...byId.values()];
    return {
      labelsInOrder,
      multiple: labelsInOrder.length > 1,
    };
  }, [segments]);

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

  const bookingGroupIdForOpenPlay = booking?.booking_group_id ?? booking?.id;

  const openPlayFromBookingEligible =
    Boolean(isMyBooking) &&
    (() => {
      const courtIds = [...new Set(segments.map((s) => s.court_id))];
      return courtIds.some((courtId) => {
        const forCourt = segments.filter((s) => s.court_id === courtId);
        return (
          forCourt.length > 0 &&
          forCourt.every((s) => s.status === "confirmed")
        );
      });
    })();

  const eligibleSegmentsForOpenPlay = useMemo(
    () => segments.filter((segment) => segment.status === "confirmed"),
    [segments],
  );

  const { data: groupOpenPlaySessions = [] } = useQuery({
    queryKey: queryKeys.openPlay.list({
      booking_group_id: bookingGroupIdForOpenPlay,
    }),
    queryFn: async () => {
      const { data } = await courtlyApi.openPlay.list({
        booking_group_id: bookingGroupIdForOpenPlay!,
      });
      return data;
    },
    /** Booker's booking group may include completed segments; still need sessions for “View open play” links. */
    enabled: Boolean(bookingGroupIdForOpenPlay && isMyBooking),
  });

  const openPlaySessionIdByCourtId = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of groupOpenPlaySessions) {
      if (s.court_id) m.set(s.court_id, s.id);
    }
    return m;
  }, [groupOpenPlaySessions]);

  const distinctCourtsForOpenPlay = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of eligibleSegmentsForOpenPlay) {
      if (!m.has(s.court_id)) {
        m.set(s.court_id, (s.court_name ?? "").trim() || "Court");
      }
    }
    return [...m.entries()].map(([id, name]) => ({ id, name }));
  }, [eligibleSegmentsForOpenPlay]);

  const openPlaySelectableCourts = useMemo(() => {
    const existing = new Set(
      groupOpenPlaySessions
        .map((s) => s.court_id)
        .filter((id): id is string => Boolean(id)),
    );
    return distinctCourtsForOpenPlay.filter((c) => {
      if (existing.has(c.id)) return false;
      const courtSegs = segments
        .filter((s) => s.status === "confirmed")
        .filter((s) => s.court_id === c.id)
        .sort((a, b) => a.start_time.localeCompare(b.start_time));
      const first = courtSegs[0];
      if (!first) return false;
      const startMs = bookingSegmentStartMs(first);
      if (!Number.isFinite(startMs)) return false;
      return statusNowMs < startMs;
    });
  }, [distinctCourtsForOpenPlay, groupOpenPlaySessions, segments, statusNowMs]);

  const [optOutCourtIds, setOptOutCourtIds] = useState<string[]>([]);

  const selectedOpenPlayCourtIds = useMemo(() => {
    const opt = new Set(
      optOutCourtIds.filter((id) =>
        openPlaySelectableCourts.some((c) => c.id === id),
      ),
    );
    return openPlaySelectableCourts.filter((c) => !opt.has(c.id)).map((c) => c.id);
  }, [openPlaySelectableCourts, optOutCourtIds]);

  const visitCompleted = sessionFullyCompletedForReview(segments, statusNowMs);
  const dateLabels = useMemo(() => {
    const labels = new Set<string>();
    for (const segment of segments) {
      if (!segment.date) continue;
      labels.add(format(new Date(`${segment.date}T12:00:00`), "EEE, MMM d, yyyy"));
    }
    return [...labels];
  }, [segments]);
  const segmentsByDate = useMemo(() => {
    const groups = new Map<string, Booking[]>();
    for (const segment of segments) {
      const key = segment.date || "Unknown date";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(segment);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [segments]);
  const shouldFetchReviews =
    Boolean(isMyBooking) && Boolean(visitCompleted) && Boolean(court?.venue_id);

  const reviews = useMemo(
    () => (shouldFetchReviews ? (bookingPayload?.reviews ?? []) : []),
    [shouldFetchReviews, bookingPayload?.reviews],
  );
  const loadingReviews = loadingBooking && shouldFetchReviews;

  const myReview = !reviews || !user?.id
    ? undefined
    : reviews.find((review) => review.user_id === user.id);

  const loading = loadingBooking || fetchingBooking;
  const [openPlayTitle, setOpenPlayTitle] = useState("");
  const [openPlaySlots, setOpenPlaySlots] = useState("");
  const [openPlayPrice, setOpenPlayPrice] = useState("");
  const [openPlayDuprMin, setOpenPlayDuprMin] = useState("2");
  const [openPlayDuprMax, setOpenPlayDuprMax] = useState("8");
  const [openPlayDescription, setOpenPlayDescription] = useState("");
  const [openPlayAcceptsGcash, setOpenPlayAcceptsGcash] = useState(false);
  const [openPlayGcashAccountName, setOpenPlayGcashAccountName] = useState("");
  const [openPlayGcashAccountNumber, setOpenPlayGcashAccountNumber] = useState("");
  const [openPlayAcceptsMaya, setOpenPlayAcceptsMaya] = useState(false);
  const [openPlayMayaAccountName, setOpenPlayMayaAccountName] = useState("");
  const [openPlayMayaAccountNumber, setOpenPlayMayaAccountNumber] = useState("");

  const createOpenPlayMutation = useMutation({
    mutationFn: async () => {
      if (!booking) throw new Error("Booking missing");
      const parsedSlots = Number.parseInt(openPlaySlots.trim(), 10);
      const parsedPrice = Number.parseInt(openPlayPrice.trim(), 10);
      const parsedDuprMin = roundDuprBound(openPlayDuprMin);
      const parsedDuprMax = roundDuprBound(openPlayDuprMax);
      if (!Number.isInteger(parsedSlots) || parsedSlots < 2) {
        throw new Error("Slots must be a whole number (minimum 2).");
      }
      if (!Number.isInteger(parsedPrice) || parsedPrice < 0) {
        throw new Error("Price per player must be a whole number (0 or higher).");
      }
      if (!isValidOpenPlayDuprRange(parsedDuprMin, parsedDuprMax)) {
        throw new Error("DUPR range must be between 2.00 and 8.00 (decimals allowed).");
      }
      if (openPlayAcceptsGcash && !isValidPhMobile(openPlayGcashAccountNumber)) {
        throw new Error("GCash account number must be a valid PH mobile number.");
      }
      if (openPlayAcceptsMaya && !isValidPhMobile(openPlayMayaAccountNumber)) {
        throw new Error("Maya account number must be a valid PH mobile number.");
      }
      if (
        parsedPrice > 0 &&
        !openPlayAcceptsGcash &&
        !openPlayAcceptsMaya
      ) {
        throw new Error("Select at least one payment method for paid open play.");
      }
      const bookingGroupId = booking.booking_group_id ?? booking.id;
      return courtlyApi.openPlay.create({
        booking_group_id: bookingGroupId,
        court_ids:
          selectedOpenPlayCourtIds.length > 0 ? selectedOpenPlayCourtIds : undefined,
        title: openPlayTitle.trim(),
        max_players: parsedSlots,
        price_per_player: parsedPrice,
        dupr_min: parsedDuprMin,
        dupr_max: parsedDuprMax,
        description: openPlayDescription.trim() || undefined,
        accepts_gcash: openPlayAcceptsGcash,
        gcash_account_name: openPlayAcceptsGcash
          ? openPlayGcashAccountName.trim() || undefined
          : undefined,
        gcash_account_number: openPlayAcceptsGcash
          ? openPlayGcashAccountNumber.trim() || undefined
          : undefined,
        accepts_maya: openPlayAcceptsMaya,
        maya_account_name: openPlayAcceptsMaya
          ? openPlayMayaAccountName.trim() || undefined
          : undefined,
        maya_account_number: openPlayAcceptsMaya
          ? openPlayMayaAccountNumber.trim() || undefined
          : undefined,
      });
    },
    onSuccess: ({ data }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.openPlay.all() });
      const created = data.sessions ?? [];
      if (created.length === 1) {
        toast.success("Open play created.");
        router.push(`/open-play/${created[0]!.id}`);
        return;
      }
      toast.success(`Created ${created.length} open play sessions.`);
      router.push("/open-play");
    },
    onError: (error: unknown) => {
      toast.error(apiErrorMessage(error, "Could not create open play"));
    },
  });

  const openPlayDuprInputsValid = useMemo(() => {
    if (!openPlayDuprMin.trim() || !openPlayDuprMax.trim()) return false;
    return isValidOpenPlayDuprRange(
      roundDuprBound(openPlayDuprMin),
      roundDuprBound(openPlayDuprMax),
    );
  }, [openPlayDuprMin, openPlayDuprMax]);
  const openPlayWalletPhonesValid = useMemo(
    () =>
      (!openPlayAcceptsGcash || isValidPhMobile(openPlayGcashAccountNumber)) &&
      (!openPlayAcceptsMaya || isValidPhMobile(openPlayMayaAccountNumber)),
    [
      openPlayAcceptsGcash,
      openPlayAcceptsMaya,
      openPlayGcashAccountNumber,
      openPlayMayaAccountNumber,
    ],
  );

  const hasMapPin =
    court &&
    court.map_latitude != null &&
    court.map_longitude != null &&
    Number.isFinite(court.map_latitude) &&
    Number.isFinite(court.map_longitude);
  const mapLat = court?.map_latitude ?? 0;
  const mapLon = court?.map_longitude ?? 0;

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
  const { statusKey: sessionStatusKey } = aggregateSessionStatus(
    segments,
    statusNowMs,
  );

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
  const canCreateOpenPlay =
    openPlayFromBookingEligible && openPlaySelectableCourts.length > 0;

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
            ? `${dateLabels.join(" • ")} — ${sessionCourts.labelsInOrder.join(", ")} • ${segments.length} reserved slot${segments.length === 1 ? "" : "s"}`
            : (booking.court_name ?? "Court reservation")
        }
      >
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={fetchingBooking}
          onClick={() => void refetch()}
        >
          <RefreshCw className={`h-4 w-4 ${fetchingBooking ? "animate-spin" : ""}`} />
        </Button>
      </PageHeader>

      <div className="space-y-6">
        <Card className="border-border/50">
          <CardContent className="space-y-4 p-6">
            <h2 className="font-heading text-lg font-semibold text-foreground">
              Summary
            </h2>
            <BookingStatusStepper status={sessionStatusKey} />
            <dl className="grid gap-3 text-sm sm:grid-cols-[8rem_1fr] sm:gap-x-6">
              <dt className="text-muted-foreground">
                Court{sessionCourts.multiple ? "s" : ""}
              </dt>
              <dd className="font-medium">
                {sessionCourts.labelsInOrder.length > 0
                  ? sessionCourts.labelsInOrder.join(", ")
                  : (booking.court_name ?? "—")}
              </dd>
              <dt className="text-muted-foreground">Booking #</dt>
              <dd className="font-mono text-xs">{booking.booking_number ?? "—"}</dd>
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
                {segmentsByDate.map(([dateKey, dateSegments]) => (
                  <li key={dateKey} className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      {dateKey === "Unknown date"
                        ? "Unknown date"
                        : format(new Date(`${dateKey}T12:00:00`), "EEE, MMM d, yyyy")}
                    </p>
                    <ul className="space-y-2">
                      {dateSegments.map((segment) => {
                  const hours = bookingDurationHours(segment);
                  const segmentCourtLabel =
                    (segment.court_name ?? "").trim() || "Court";
                  const displayStatus = segmentStatusForDisplay(
                    segment,
                    statusNowMs,
                  );
                  const openPlaySessionId = openPlaySessionIdByCourtId.get(
                    segment.court_id,
                  );
                  const segTiers =
                    court && segment.court_id === court.id
                      ? segmentPricingTiers(court, segment)
                      : [];
                        return (
                          <li
                            key={segment.id}
                            className="rounded-lg border border-border/50 bg-muted/20 p-3"
                          >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          {sessionCourts.multiple ? (
                            <span className="block text-sm font-medium text-foreground">
                              {segmentCourtLabel}
                            </span>
                          ) : null}
                          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-medium text-foreground">
                            <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                            {formatTimeShort(segment.start_time)} –{" "}
                            {formatTimeShort(segment.end_time)}
                            <span className="text-muted-foreground">
                              ({hours} {hours === 1 ? "hr" : "hrs"})
                            </span>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                          <Badge
                            variant="outline"
                            className={statusStyles[displayStatus] ?? ""}
                          >
                            {formatBookingStatusLabel(displayStatus)}
                          </Badge>
                          <span className="text-sm font-semibold text-foreground tabular-nums">
                            {formatPhp(segment.total_cost ?? 0)}
                          </span>
                        </div>
                      </div>
                      {segTiers.length > 0 ? (
                        <div className="mt-3 space-y-1 border-t border-border/50 pt-3 text-xs tabular-nums">
                          {segTiers.map((tier) => (
                            <div key={tier.startHour} className="flex items-baseline justify-between gap-3">
                              <span className="text-muted-foreground">
                                {formatTimeShort(formatHourToken(tier.startHour))} – {formatTimeShort(formatHourToken(tier.endHour))}
                                {" · "}{formatPhp(tier.ratePerHour)}/hr × {tier.hours} {tier.hours === 1 ? "hr" : "hrs"}
                              </span>
                              <span className="shrink-0 text-foreground/75">{formatPhp(tier.subtotal)}</span>
                            </div>
                          ))}
                          {typeof segment.booking_fee === "number" ? (
                            <div className="flex items-baseline justify-between gap-3 border-t border-border/40 pt-1">
                              <span className="text-muted-foreground">Booking fee</span>
                              <span className="shrink-0 text-foreground/75">{formatPhp(segment.booking_fee)}</span>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {openPlaySessionId ? (
                        <div className="mt-2">
                          <Button
                            variant="link"
                            className="h-auto min-h-0 justify-start p-0 text-xs font-medium text-primary"
                            asChild
                          >
                            <Link href={`/open-play/${openPlaySessionId}`}>
                              View open play
                              <ExternalLink
                                className="ml-1 h-3.5 w-3.5 shrink-0"
                                aria-hidden
                              />
                            </Link>
                          </Button>
                        </div>
                      ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
            </div>

            <div className="flex items-center justify-between border-t border-border/60 pt-4 text-sm">
              <span className="font-medium text-muted-foreground">Total</span>
              <span className="font-heading text-lg font-bold text-primary tabular-nums">
                {formatPhp(sessionTotal)}
              </span>
            </div>
            {segments.some((s) => s.status === "pending_payment") ? (
              <div className="border-t border-border/60 pt-4">
                <p className="text-sm text-muted-foreground">
                  Payment is still pending for at least one reservation. Open this page
                  again to submit proof before the timer expires.
                </p>
              </div>
            ) : null}
            {segments.some((s) => s.status === "pending_confirmation") ? (
              <div className="border-t border-border/60 pt-4">
                <p className="text-sm text-muted-foreground">
                  Payment proof submitted for at least one reservation. Waiting for venue
                  confirmation.
                </p>
              </div>
            ) : null}

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

        {canCreateOpenPlay ? (
          <Card className="border-border/50">
            <CardContent className="space-y-4 p-6">
              <h2 className="font-heading text-lg font-semibold text-foreground">
                Create open play from this booking
              </h2>
              <p className="text-sm text-muted-foreground">
                Turn each <strong className="font-medium text-foreground">confirmed</strong>{" "}
                court reservation into an open play lobby before play starts. Each court you
                select becomes its own session (same title, price, and settings). If this
                checkout has multiple courts, only the courts that are fully confirmed count—
                other courts can be cancelled or still pending without blocking a confirmed
                court.
              </p>
              {distinctCourtsForOpenPlay.length > 1 ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">
                    Courts for open play
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {distinctCourtsForOpenPlay.map((c) => {
                      const already = groupOpenPlaySessions.some(
                        (sess) => sess.court_id === c.id,
                      );
                      const selectable = openPlaySelectableCourts.some(
                        (x) => x.id === c.id,
                      );
                      const isSelected = selectedOpenPlayCourtIds.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          disabled={!selectable}
                          aria-pressed={selectable ? isSelected : undefined}
                          aria-label={
                            already
                              ? `${c.name}, open play already created`
                              : !selectable
                                ? `${c.name}, booking time has already started`
                                : isSelected
                                  ? `${c.name}, selected for open play`
                                  : `${c.name}, not selected`
                          }
                          onClick={() => {
                            if (!selectable) return;
                            setOptOutCourtIds((prev) =>
                              isSelected
                                ? prev.includes(c.id)
                                  ? prev
                                  : [...prev, c.id]
                                : prev.filter((x) => x !== c.id),
                            );
                          }}
                          className={cn(
                            "min-h-10 min-w-[8.5rem] max-w-full rounded-md border px-3 py-2 text-center text-sm font-medium transition-colors",
                            !selectable &&
                              "cursor-not-allowed border-border bg-muted text-muted-foreground/80",
                            selectable &&
                              isSelected &&
                              "border-primary bg-primary text-primary-foreground shadow-sm",
                            selectable &&
                              !isSelected &&
                              "border-border bg-background hover:border-primary/40 hover:bg-primary/5",
                          )}
                        >
                          <span className="block truncate">{c.name}</span>
                          <span
                            className={cn(
                              "mt-0.5 block text-[11px] font-normal leading-tight",
                              !selectable && "text-muted-foreground/90",
                              selectable && isSelected && "text-primary-foreground/90",
                              selectable && !isSelected && "text-muted-foreground",
                            )}
                          >
                            {already
                              ? "Created"
                              : !selectable
                                ? "Started"
                                : isSelected
                                  ? "Selected"
                                  : "Tap to add"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Tap courts like booking slots—selected courts each get their own open
                    play with the same details below.
                  </p>
                </div>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="open-play-title">Lobby name</Label>
                  <Input
                    id="open-play-title"
                    value={openPlayTitle}
                    onChange={(event) => setOpenPlayTitle(event.target.value)}
                    placeholder="Friday Evening Games"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="open-play-slots">Slots</Label>
                  <Input
                    id="open-play-slots"
                    type="number"
                    min={2}
                    step={1}
                    value={openPlaySlots}
                    onChange={(event) => setOpenPlaySlots(event.target.value)}
                    placeholder="e.g. 8"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="open-play-price">Price per player (PHP)</Label>
                  <Input
                    id="open-play-price"
                    type="number"
                    min={0}
                    step={1}
                    value={openPlayPrice}
                    onChange={(event) => setOpenPlayPrice(event.target.value)}
                    placeholder="e.g. 100"
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>DUPR range</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min={2}
                      max={8}
                      step={0.01}
                      value={openPlayDuprMin}
                      onChange={(event) => setOpenPlayDuprMin(event.target.value)}
                      placeholder="Min"
                      required
                    />
                    <Input
                      type="number"
                      min={2}
                      max={8}
                      step={0.01}
                      value={openPlayDuprMax}
                      onChange={(event) => setOpenPlayDuprMax(event.target.value)}
                      placeholder="Max"
                      required
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="open-play-description">Description</Label>
                <Textarea
                  id="open-play-description"
                  rows={3}
                  value={openPlayDescription}
                  onChange={(event) => setOpenPlayDescription(event.target.value)}
                  placeholder="Optional notes for players"
                />
              </div>
              <div className="space-y-3 rounded-xl border border-border/60 p-4">
                <p className="text-sm font-medium text-foreground">
                  Organizer payment methods
                </p>
                <p className="text-xs text-muted-foreground">
                  Players pay you directly for this open play.
                </p>
                <div className="space-y-2 rounded-lg border border-border/60 p-3">
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <input
                      type="checkbox"
                      checked={openPlayAcceptsGcash}
                      onChange={(event) => setOpenPlayAcceptsGcash(event.target.checked)}
                    />
                    Accept GCash
                  </label>
                  {openPlayAcceptsGcash ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input
                        value={openPlayGcashAccountName}
                        onChange={(event) => setOpenPlayGcashAccountName(event.target.value)}
                        placeholder="GCash account name"
                      />
                      <Input
                        value={openPlayGcashAccountNumber}
                        onChange={(event) => setOpenPlayGcashAccountNumber(event.target.value)}
                        placeholder="GCash account number"
                      />
                    </div>
                  ) : null}
                </div>
                <div className="space-y-2 rounded-lg border border-border/60 p-3">
                  <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <input
                      type="checkbox"
                      checked={openPlayAcceptsMaya}
                      onChange={(event) => setOpenPlayAcceptsMaya(event.target.checked)}
                    />
                    Accept Maya
                  </label>
                  {openPlayAcceptsMaya ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input
                        value={openPlayMayaAccountName}
                        onChange={(event) => setOpenPlayMayaAccountName(event.target.value)}
                        placeholder="Maya account name"
                      />
                      <Input
                        value={openPlayMayaAccountNumber}
                        onChange={(event) => setOpenPlayMayaAccountNumber(event.target.value)}
                        placeholder="Maya account number"
                      />
                    </div>
                  ) : null}
                </div>
              </div>
              <Button
                onClick={() => createOpenPlayMutation.mutate()}
                disabled={
                  createOpenPlayMutation.isPending ||
                  !openPlayTitle.trim() ||
                  !openPlaySlots.trim() ||
                  !openPlayPrice.trim() ||
                  !openPlayDuprMin.trim() ||
                  !openPlayDuprMax.trim() ||
                  (Number.parseInt(openPlaySlots.trim(), 10) || 0) < 2 ||
                  (Number.parseInt(openPlayPrice.trim(), 10) || 0) < 0 ||
                  !Number.isInteger(Number.parseInt(openPlaySlots.trim(), 10)) ||
                  !Number.isInteger(Number.parseInt(openPlayPrice.trim(), 10)) ||
                  !openPlayDuprInputsValid ||
                  !openPlayWalletPhonesValid ||
                  ((Number.parseInt(openPlayPrice.trim(), 10) || 0) > 0 &&
                    !openPlayAcceptsGcash &&
                    !openPlayAcceptsMaya) ||
                  (openPlayAcceptsGcash &&
                    (!openPlayGcashAccountName.trim() ||
                      !openPlayGcashAccountNumber.trim())) ||
                  (openPlayAcceptsMaya &&
                    (!openPlayMayaAccountName.trim() || !openPlayMayaAccountNumber.trim())) ||
                  selectedOpenPlayCourtIds.length === 0
                }
              >
                {createOpenPlayMutation.isPending ? "Creating..." : "Create Open Play"}
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {canRate || canEditReview ? (
          court ? (
            <BookingReviewSection
              key={myReview?.id ?? "new-review"}
              bookingId={bookingId}
              court={court}
              myReview={myReview}
              serverNowMs={serverNowMs}
            />
          ) : null
        ) : null}

        {court ? (
          <Card className="border-border/50">
            <CardContent className="space-y-4 p-6">
              <h2 className="font-heading text-lg font-semibold text-foreground">
                Venue
              </h2>
              <div>
                <p className="text-base font-semibold text-foreground">
                  {court.establishment_name ?? booking.establishment_name ?? "—"}
                </p>
                {court.contact_phone ? (
                  <p className="mt-0.5 text-sm text-muted-foreground">{court.contact_phone}</p>
                ) : null}
              </div>
              {court.facebook_url || court.instagram_url ? (
                <div className="flex flex-wrap gap-2">
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
              {court.amenities?.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {court.amenities.map((amenity) => (
                    <Badge key={amenity} variant="outline" className="font-normal">
                      {formatAmenityLabel(amenity)}
                    </Badge>
                  ))}
                </div>
              ) : null}
              {(hasMapPin || court.location) ? (
                <div className="space-y-2">
                  {hasMapPin && (
                    <VenueMapPinPicker
                      value={{ lat: mapLat, lng: mapLon }}
                      onChange={() => {}}
                      readOnly
                    />
                  )}
                  {court.location ? (
                    <p className="flex items-start gap-2 text-sm text-foreground">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0">{court.location}</span>
                    </p>
                  ) : null}
                  {hasMapPin && (
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" className="w-fit" asChild>
                        <a
                          href={`https://maps.google.com/?q=${mapLat},${mapLon}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Google Maps
                        </a>
                      </Button>
                      <Button variant="outline" size="sm" className="w-fit" asChild>
                        <a
                          href={`https://maps.apple.com/?ll=${mapLat},${mapLon}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Apple Maps
                        </a>
                      </Button>
                    </div>
                  )}
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}

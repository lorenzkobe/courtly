"use client";

import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  addDays,
  addMonths,
  format,
  isAfter,
  isBefore,
  startOfDay,
} from "date-fns";
import {
  ArrowLeft,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Heart,
  Loader2,
  MapPin,
  Star,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import PaymentLockOverlay from "@/components/payments/PaymentLockOverlay";
import PageHeader from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiErrorMessage } from "@/lib/api/api-error-message";
import { httpStatusOf } from "@/lib/api/http-status";
import { courtlyApi } from "@/lib/api/courtly-client";
import { queryKeys } from "@/lib/query/query-keys";
import { segmentsTotalCost } from "@/lib/court-pricing";
import {
  splitBookingAmounts,
} from "@/lib/platform-fee";
import { useAuth } from "@/lib/auth/auth-context";
import { useBookingsRealtime } from "@/lib/bookings/use-bookings-realtime";
import {
  availableSegmentsInRange,
  exclusiveEndAfterLastIncludedHour,
  formatBookableHourSlotRange,
  formatSegmentLine,
  formatTimeShort,
  groupIntoContiguousHourRuns,
  hourFromTime,
  isBookableHourStartInPast,
  occupiedHourStarts,
  occupiedHourStartsFromClosures,
} from "@/lib/booking-range";
import { formatPhp, formatPhpCompact } from "@/lib/format-currency";
import { formatAmenityLabel } from "@/lib/format-amenity";
import { bookableHourTokensFromRanges } from "@/lib/venue-price-ranges";
import { canCourtVenueAdminFlagReview, isSuperadmin } from "@/lib/auth/management";
import type {
  Booking,
  Court,
  CourtClosure,
  VenueClosure,
} from "@/lib/types/courtly";
import { formatStatusLabel } from "@/lib/utils";
import { useFavoriteVenueIds } from "@/hooks/use-favorite-venue-ids";
import { cn } from "@/lib/utils";
import { venuePaymentMethodsForCheckout } from "@/lib/venue-payment-methods";
import { optimizePaymentProofImage } from "@/lib/payments/optimize-payment-proof";
import {
  PAYMENT_PROOF_ALLOWED_INPUT_MIME_TYPES,
} from "@/lib/payments/payment-proof-constraints";
import { buildBookingPayloads } from "@/lib/bookings/booking-payloads";
import { useBookingCart } from "@/lib/stores/booking-cart";

function courtGalleryUrls(court: Court): string[] {
  const g = court.gallery_urls?.filter(Boolean);
  if (g && g.length > 0) return g;
  if (court.image_url) return [court.image_url];
  return [];
}

function courtNumberLabel(court: Court): string {
  const establishment = court.establishment_name?.trim();
  const rawName = court.name.trim();
  if (!establishment) return rawName;
  const prefix = `${establishment} - `;
  if (rawName.startsWith(prefix)) {
    return rawName.slice(prefix.length).trim();
  }
  return rawName;
}

function cartLineLabel(slots: string[]): string {
  const runs = groupIntoContiguousHourRuns(slots);
  return runs
    .map((run) => {
      const start = run[0]!;
      const endExclusive = exclusiveEndAfterLastIncludedHour(run[run.length - 1]!);
      return formatSegmentLine({
        start_time: start,
        end_time: endExclusive,
        hours: run.length,
      });
    })
    .join(" and ");
}

function formatMatrixTimeLabel(time: string): string {
  return formatBookableHourSlotRange(time).replace(/\s*[-–]\s*/g, " - ");
}

const EMPTY_BOOKINGS: Booking[] = [];
const EMPTY_COURT_CLOSURES: CourtClosure[] = [];
const EMPTY_VENUE_CLOSURES: VenueClosure[] = [];

type PaymentOverlayState = {
  booking_id: string;
  booking_group_id: string;
  hold_expires_at: string;
  total_due: number;
  payment_methods: Array<{
    method: "gcash" | "maya";
    account_name: string;
    account_number: string;
  }>;
};

function StarRow({ rating, className }: { rating: number; className?: string }) {
  const filled = Math.round(rating);
  return (
    <div className={cn("flex items-center gap-0.5", className)} aria-hidden>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={cn(
            "h-4 w-4 shrink-0",
            i < filled ? "fill-amber-400 text-amber-400" : "text-muted-foreground/25",
          )}
        />
      ))}
    </div>
  );
}

function CourtGalleryCarousel({ urls, name }: { urls: string[]; name: string }) {
  const [index, setIndex] = useState(0);
  const n = urls.length;
  const safeIndex = n > 0 ? index % n : 0;

  if (n === 0) {
    return (
      <div
        className="flex aspect-video w-full items-center justify-center rounded-2xl border border-border bg-muted text-sm text-muted-foreground"
        role="img"
        aria-label={`${name} — no photos`}
      >
        No photos for this court yet
      </div>
    );
  }

  const go = (dir: -1 | 1) => {
    setIndex((i) => (i + dir + n) % n);
  };

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-border/80 bg-muted shadow-sm">
      {/* eslint-disable-next-line @next/next/no-img-element -- external venue URLs */}
      <img
        src={urls[safeIndex]}
        alt={`${name} — photo ${safeIndex + 1} of ${n}`}
        className="h-full w-full object-cover transition-opacity duration-300"
        referrerPolicy="no-referrer"
        loading="eager"
        decoding="async"
      />
      {n > 1 ? (
        <>
          <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/25 to-transparent" />
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="absolute left-2 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full border border-border/60 bg-background/90 shadow-md backdrop-blur-sm pointer-events-auto opacity-90 hover:opacity-100"
            onClick={() => go(-1)}
            aria-label="Previous photo"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="secondary"
            className="absolute right-2 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full border border-border/60 bg-background/90 shadow-md backdrop-blur-sm pointer-events-auto opacity-90 hover:opacity-100"
            onClick={() => go(1)}
            aria-label="Next photo"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <div
            className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5"
            role="tablist"
            aria-label="Photo navigation"
          >
            {urls.map((_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={i === safeIndex}
                aria-label={`Show photo ${i + 1}`}
                onClick={() => setIndex(i)}
                className={cn(
                  "h-2 rounded-full transition-all",
                  i === safeIndex
                    ? "w-6 bg-primary"
                    : "w-2 bg-background/70 ring-1 ring-border/60 hover:bg-background",
                )}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

export default function BookCourtPage() {
  const params = useParams<{ id: string }>();
  const paramCourtId = params.id;
  const [activeCourtId, setActiveCourtId] = useState(paramCourtId);
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toggleFavorite, isFavorite } = useFavoriteVenueIds();
  const addOrMergeCartItem = useBookingCart((state) => state.addOrMergeItem);
  const removeCartItem = useBookingCart((state) => state.removeItem);
  const clearCart = useBookingCart((state) => state.clearCart);
  const cartItems = useBookingCart((state) => state.items);

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [notes, setNotes] = useState("");
  const [cartCheckoutReviewOpen, setCartCheckoutReviewOpen] = useState(false);
  const [paymentOverlay, setPaymentOverlay] = useState<PaymentOverlayState | null>(null);
  const [countdownNow, setCountdownNow] = useState(() => Date.now());
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<"gcash" | "maya" | null>(
    null,
  );
  const [optimizedProof, setOptimizedProof] = useState<{
    dataUrl: string;
    mimeType: "image/jpeg";
    bytes: number;
    width: number;
    height: number;
  } | null>(null);
  const [proofOptimizing, setProofOptimizing] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  useEffect(() => {
    setActiveCourtId(paramCourtId);
  }, [paramCourtId]);

  const dateIso = format(selectedDate, "yyyy-MM-dd");
  const todayStart = useMemo(() => startOfDay(new Date()), []);
  const maxSelectableDate = useMemo(() => addMonths(todayStart, 4), [todayStart]);
  const bookingSurfaceKey = queryKeys.bookingSurface.courtDay(activeCourtId, dateIso);
  const myPendingBookingsQueryKey = useMemo(
    () =>
      queryKeys.bookings.list({
        player_email: user?.email,
      }),
    [user?.email],
  );
  const {
    data: bookingSurface,
    isLoading: isLoadingBookingSurface,
    isFetching: isFetchingBookingSurface,
    isError: isBookingSurfaceError,
    error: bookingSurfaceError,
  } = useQuery({
    queryKey: bookingSurfaceKey,
    queryFn: async () => {
      const { data } = await courtlyApi.courts.bookingSurface(activeCourtId, {
        date: dateIso,
      });
      return data;
    },
    enabled: !!activeCourtId,
    staleTime: 15_000,
  });

  const { data: myPendingBookings = [] } = useQuery({
    queryKey: myPendingBookingsQueryKey,
    queryFn: async () => {
      if (!user?.email) return [] as Booking[];
      const { data } = await courtlyApi.bookings.list({
        player_email: user.email,
      });
      return data;
    },
    enabled: !!user?.email,
  });
  const court = bookingSurface?.court;
  const missingCourt =
    !isLoadingBookingSurface &&
    !court &&
    (!isBookingSurfaceError || httpStatusOf(bookingSurfaceError) === 404);
  useEffect(() => {
    if (!missingCourt) return;
    router.replace("/courts");
  }, [missingCourt, router]);
  const establishmentCourts = useMemo(
    () => bookingSurface?.sibling_courts ?? [],
    [bookingSurface?.sibling_courts],
  );
  const matrixCourts = useMemo(() => {
    const unique = new Map<string, Court>();
    if (court) unique.set(court.id, court);
    for (const sibling of establishmentCourts) unique.set(sibling.id, sibling);
    return Array.from(unique.values());
  }, [court, establishmentCourts]);
  const matrixSurfaceQueries = useQueries({
    queries: matrixCourts.map((matrixCourt) => ({
      queryKey: queryKeys.bookingSurface.courtDay(matrixCourt.id, dateIso),
      queryFn: async () => {
        const { data } = await courtlyApi.courts.bookingSurface(matrixCourt.id, {
          date: dateIso,
        });
        return data;
      },
      staleTime: 15_000,
      enabled: !!matrixCourt.id,
    })),
  });
  const cartSurfaceQueries = useQueries({
    queries: cartItems.map((item) => ({
      queryKey: queryKeys.bookingSurface.courtDay(item.courtId, item.date),
      queryFn: async () => {
        const { data } = await courtlyApi.courts.bookingSurface(item.courtId, {
          date: item.date,
        });
        return data;
      },
      staleTime: 15_000,
      enabled: !!item.courtId,
    })),
  });

  const matrixBookingSurfaceKeys = useMemo(() => {
    if (matrixCourts.length > 0) {
      return matrixCourts.map((c) => queryKeys.bookingSurface.courtDay(c.id, dateIso));
    }
    if (activeCourtId) {
      return [queryKeys.bookingSurface.courtDay(activeCourtId, dateIso)];
    }
    return [];
  }, [matrixCourts, activeCourtId, dateIso]);

  const cartBookingSurfaceKeys = useMemo(
    () =>
      cartItems.map((item) => queryKeys.bookingSurface.courtDay(item.courtId, item.date)),
    [cartItems],
  );

  const bookingsRealtimeKeys = useMemo(
    () => [...matrixBookingSurfaceKeys, ...cartBookingSurfaceKeys, myPendingBookingsQueryKey],
    [matrixBookingSurfaceKeys, cartBookingSurfaceKeys, myPendingBookingsQueryKey],
  );

  const bookingCourtRealtimeFilter = useMemo(() => {
    const ids = matrixCourts.map((c) => c.id).filter(Boolean);
    const idList = ids.length > 0 ? ids : activeCourtId ? [activeCourtId] : [];
    if (idList.length === 0) return null;
    if (idList.length === 1) return `court_id=eq.${idList[0]}`;
    return `court_id=in.(${idList.join(",")})`;
  }, [matrixCourts, activeCourtId]);

  useBookingsRealtime({
    filter: bookingCourtRealtimeFilter,
    enabled: Boolean(activeCourtId && bookingCourtRealtimeFilter),
    queryKeysToInvalidate: bookingsRealtimeKeys,
  });

  const isSlotMatrixFetching =
    (!isLoadingBookingSurface && isFetchingBookingSurface) ||
    matrixSurfaceQueries.some((q) => q.isFetching || q.isLoading);

  const isLoading = isLoadingBookingSurface;

  const courtReviews = useMemo(
    () => bookingSurface?.reviews ?? [],
    [bookingSurface?.reviews],
  );
  const isLoadingReviews = isLoadingBookingSurface;

  const reviewsNewestFirst = useMemo(
    () =>
      [...courtReviews].sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
      ),
    [courtReviews],
  );

  const reviewsSummaryLine = useMemo(() => {
    const s = court?.review_summary;
    if (s && s.review_count > 0) {
      return {
        average: s.average_rating,
        count: s.review_count,
      };
    }
    if (courtReviews.length > 0) {
      const sum = courtReviews.reduce((acc, r) => acc + r.rating, 0);
      return {
        average: sum / courtReviews.length,
        count: courtReviews.length,
      };
    }
    return null;
  }, [court?.review_summary, courtReviews]);

  const galleryUrls = useMemo(
    () => (court ? courtGalleryUrls(court) : []),
    [court],
  );

  const matrixOccupationByCourtId = useMemo(() => {
    const out = new Map<
      string,
      {
        bookingBlocked: Set<string>;
        closureBlocked: Set<string>;
      }
    >();
    matrixCourts.forEach((matrixCourt, idx) => {
      const surface = matrixSurfaceQueries[idx]?.data;
      const bookings = surface?.availability.bookings ?? EMPTY_BOOKINGS;
      const courtClosures = surface?.availability.court_closures ?? EMPTY_COURT_CLOSURES;
      const venueClosures = surface?.availability.venue_closures ?? EMPTY_VENUE_CLOSURES;
      const bookingBlocked = occupiedHourStarts(bookings);
      const closureBlocked = occupiedHourStartsFromClosures(courtClosures, dateIso);
      for (const token of occupiedHourStartsFromClosures(venueClosures, dateIso)) {
        closureBlocked.add(token);
      }
      out.set(matrixCourt.id, { bookingBlocked, closureBlocked });
    });
    return out;
  }, [dateIso, matrixCourts, matrixSurfaceQueries]);

  const cartLines = useMemo(() => {
    return cartItems.map((item, index) => {
      const surface = cartSurfaceQueries[index]?.data;
      const lineCourt = (surface?.court ?? null) as Court | null;
      const bookings = surface?.availability.bookings ?? EMPTY_BOOKINGS;
      const courtClosures = surface?.availability.court_closures ?? EMPTY_COURT_CLOSURES;
      const venueClosures = surface?.availability.venue_closures ?? EMPTY_VENUE_CLOSURES;
      const occupiedForLine = occupiedHourStarts(bookings);
      for (const token of occupiedHourStartsFromClosures(courtClosures, item.date)) {
        occupiedForLine.add(token);
      }
      for (const token of occupiedHourStartsFromClosures(venueClosures, item.date)) {
        occupiedForLine.add(token);
      }
      const runs = groupIntoContiguousHourRuns(item.slots);
      const lineSegments = runs.flatMap((run) => {
        const a = run[0]!;
        const b = run[run.length - 1]!;
        return availableSegmentsInRange(
          a,
          exclusiveEndAfterLastIncludedHour(b),
          occupiedForLine,
        );
      });
      const unavailableSlots = item.slots.filter((slot) => occupiedForLine.has(slot));
      const subtotal = lineCourt ? segmentsTotalCost(lineCourt, lineSegments) : 0;
      const flatFee = surface?.flat_booking_fee;
      return {
        item,
        court: lineCourt,
        segments: lineSegments,
        unavailableSlots,
        flatBookingFeePhp: flatFee ?? 0,
        totals: splitBookingAmounts(subtotal, flatFee),
      };
    });
  }, [cartItems, cartSurfaceQueries]);
  const groupedCartLines = useMemo(() => {
    const byDate = new Map<string, typeof cartLines>();
    for (const line of cartLines) {
      const existing = byDate.get(line.item.date) ?? [];
      existing.push(line);
      byDate.set(line.item.date, existing);
    }
    return Array.from(byDate.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [cartLines]);
  const cartHasConflicts = useMemo(
    () =>
      cartLines.some(
        (line) =>
          !line.court || line.unavailableSlots.length > 0 || line.segments.length === 0,
      ),
    [cartLines],
  );
  const cartGrandTotal = useMemo(
    () => cartLines.reduce((sum, line) => sum + line.totals.total_cost, 0),
    [cartLines],
  );

  const [flagReviewId, setFlagReviewId] = useState<string | null>(null);
  const [flagNote, setFlagNote] = useState("");
  const [confirmDeleteReviewId, setConfirmDeleteReviewId] = useState<string | null>(null);

  const deleteReviewMut = useMutation({
    mutationFn: async (reviewId: string) => {
      if (!court?.venue_id) return;
      await courtlyApi.venueReviews.remove(court.venue_id, reviewId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: bookingSurfaceKey,
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.courts.all() });
      toast.success("Review removed");
    },
  });

  const flagReviewMut = useMutation({
    mutationFn: async (p: { reviewId: string; reason: string }) => {
      if (!court?.venue_id) return;
      await courtlyApi.venueReviews.flag(court.venue_id, p.reviewId, {
        reason: p.reason || undefined,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: bookingSurfaceKey,
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.reviews.flagged() });
      setFlagReviewId(null);
      setFlagNote("");
      toast.success("Review flagged for platform review");
    },
  });

  const createBookings = useMutation({
    mutationFn: async (payloads: Partial<Booking>[]) => {
      const { data } = await courtlyApi.bookings.checkout(payloads);
      return data;
    },
    onSuccess: (checkout) => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.bookings.list({
          player_email: user?.email,
          sport: court?.sport,
        }),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.bookings.my(user?.email, court?.sport),
      });
      void queryClient.invalidateQueries({
        queryKey: bookingSurfaceKey,
      });
      for (const item of cartItems) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.bookingSurface.courtDay(item.courtId, item.date),
        });
      }
      setCartCheckoutReviewOpen(false);
      clearCart();
      setPaymentOverlay(checkout);
      setSelectedPaymentMethod(checkout.payment_methods[0]?.method ?? null);
      setOptimizedProof(null);
      toast.success("Booking hold created. Submit payment proof within 5 minutes.");
    },
    onError: (err: unknown) => {
      toast.error(
        apiErrorMessage(err, "Could not complete booking. Please try again."),
      );
    },
  });

  const submitPaymentProof = useMutation({
    mutationFn: async () => {
      if (!paymentOverlay) throw new Error("No active booking hold.");
      if (!selectedPaymentMethod) throw new Error("Select a payment method.");
      if (!optimizedProof) throw new Error("Upload a payment screenshot first.");
      const { data } = await courtlyApi.bookings.submitPaymentProof(paymentOverlay.booking_id, {
        payment_method: selectedPaymentMethod,
        payment_proof_data_url: optimizedProof.dataUrl,
        payment_proof_mime_type: optimizedProof.mimeType,
        payment_proof_bytes: optimizedProof.bytes,
        payment_proof_width: optimizedProof.width,
        payment_proof_height: optimizedProof.height,
      });
      return data;
    },
    onSuccess: () => {
      const nextBookingId = paymentOverlay?.booking_id ?? null;
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all() });
      void queryClient.invalidateQueries({ queryKey: bookingSurfaceKey });
      setPaymentOverlay(null);
      setOptimizedProof(null);
      setSelectedPaymentMethod(null);
      toast.success("Payment submitted. Waiting for venue confirmation.");
      if (nextBookingId) {
        router.push(`/my-bookings/${nextBookingId}`);
      }
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, "Could not submit payment proof."));
    },
  });
  const cancelPendingPayment = useMutation({
    mutationFn: async () => {
      if (!paymentOverlay) throw new Error("No active booking hold.");
      await courtlyApi.bookings.cancelPending({
        booking_id: paymentOverlay.booking_id,
        booking_group_id: paymentOverlay.booking_group_id,
      });
    },
    onMutate: () => {
      const previous = paymentOverlay;
      const previousProof = optimizedProof;
      const previousMethod = selectedPaymentMethod;
      setPaymentOverlay(null);
      setOptimizedProof(null);
      setSelectedPaymentMethod(null);
      return { previousOverlay: previous, previousProof, previousMethod };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all() });
      void queryClient.invalidateQueries({ queryKey: ["booking-surface"] });
      setPaymentOverlay(null);
      setOptimizedProof(null);
      setSelectedPaymentMethod(null);
      toast.success("Pending booking cancelled. Slots are now available again.");
    },
    onError: (error, _vars, ctx) => {
      if (ctx?.previousOverlay) {
        setPaymentOverlay(ctx.previousOverlay);
      }
      setOptimizedProof(ctx?.previousProof ?? null);
      setSelectedPaymentMethod(ctx?.previousMethod ?? null);
      toast.error(apiErrorMessage(error, "Could not cancel pending booking."));
    },
  });

  useEffect(() => {
    const timer = window.setInterval(() => setCountdownNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const activePendingBooking = useMemo(() => {
    const now = countdownNow;
    const candidates = myPendingBookings
      .filter(
        (booking) =>
          booking.status === "pending_payment" &&
          booking.hold_expires_at &&
          new Date(booking.hold_expires_at).getTime() > now &&
          !booking.payment_failed_at,
      )
      .sort((a, b) => (b.created_date ?? "").localeCompare(a.created_date ?? ""));
    return candidates[0] ?? null;
  }, [myPendingBookings, countdownNow]);
  const pendingPaymentCourtId = activePendingBooking?.court_id ?? null;
  const { data: pendingPaymentCourt } = useQuery({
    queryKey: pendingPaymentCourtId
      ? queryKeys.courts.detail(pendingPaymentCourtId)
      : queryKeys.courts.detail(""),
    queryFn: async () => {
      if (!pendingPaymentCourtId) return null as Court | null;
      const { data } = await courtlyApi.courts.get(pendingPaymentCourtId);
      return data;
    },
    enabled: !!pendingPaymentCourtId,
  });

  useEffect(() => {
    if (!activePendingBooking || !activePendingBooking.hold_expires_at) {
      return;
    }
    const holdExpiresAt = activePendingBooking.hold_expires_at;
    const paymentMethods = venuePaymentMethodsForCheckout(pendingPaymentCourt ?? court ?? {});
    if (paymentMethods.length === 0) return;
    const relatedPending = myPendingBookings.filter(
      (booking) =>
        (booking.booking_group_id ===
          (activePendingBooking.booking_group_id ?? activePendingBooking.id) ||
          booking.id === activePendingBooking.id) &&
        booking.status === "pending_payment",
    );
    const totalDue = relatedPending.reduce(
      (sum, booking) => sum + Number(booking.total_cost ?? 0),
      0,
    );
    const bookingGroupId = activePendingBooking.booking_group_id ?? activePendingBooking.id;
    setPaymentOverlay((current) => {
      if (
        current &&
        current.booking_group_id === bookingGroupId &&
        current.hold_expires_at === holdExpiresAt
      ) {
        return { ...current, total_due: totalDue, payment_methods: paymentMethods };
      }
      return {
        booking_id: activePendingBooking.id,
        booking_group_id: bookingGroupId,
        hold_expires_at: holdExpiresAt,
        total_due: totalDue,
        payment_methods: paymentMethods,
      };
    });
    setSelectedPaymentMethod((current) => {
      if (current && paymentMethods.some((method) => method.method === current)) return current;
      return paymentMethods[0]?.method ?? null;
    });
  }, [activePendingBooking, court, myPendingBookings, pendingPaymentCourt]);

  useEffect(() => {
    if (!paymentOverlay) return;
    const related = myPendingBookings.filter(
      (booking) =>
        booking.booking_group_id === paymentOverlay.booking_group_id ||
        booking.id === paymentOverlay.booking_id,
    );
    if (related.length === 0) return;
    const hasConfirmed = related.some((booking) => booking.status === "confirmed");
    const hasSubmitted = related.some(
      (booking) => booking.status === "pending_confirmation",
    );
    const hasFailed = related.some((booking) => booking.status === "cancelled");
    const holdExpired = related.every(
      (booking) =>
        booking.status !== "pending_payment" ||
        !booking.hold_expires_at ||
        new Date(booking.hold_expires_at).getTime() <= Date.now(),
    );
    if (hasConfirmed || hasSubmitted || hasFailed || holdExpired) {
      setPaymentOverlay(null);
    }
  }, [myPendingBookings, paymentOverlay]);

  const overlayRemainingSeconds = paymentOverlay
    ? Math.max(
        0,
        Math.ceil((new Date(paymentOverlay.hold_expires_at).getTime() - countdownNow) / 1000),
      )
    : 0;
  const overlayTotalDue = useMemo(() => {
    if (!paymentOverlay) return 0;
    const relatedPending = myPendingBookings.filter(
      (booking) =>
        (booking.booking_group_id === paymentOverlay.booking_group_id ||
          booking.id === paymentOverlay.booking_id) &&
        booking.status === "pending_payment",
    );
    if (relatedPending.length === 0) return Number(paymentOverlay.total_due ?? 0);
    return relatedPending.reduce((sum, booking) => sum + Number(booking.total_cost ?? 0), 0);
  }, [myPendingBookings, paymentOverlay]);

  useEffect(() => {
    if (!paymentOverlay) return;
    if (overlayRemainingSeconds <= 0) {
      window.location.reload();
    }
  }, [overlayRemainingSeconds, paymentOverlay]);

  const processProofFile = async (file: File) => {
    const allowed = PAYMENT_PROOF_ALLOWED_INPUT_MIME_TYPES as readonly string[];
    if (!allowed.includes(file.type)) {
      toast.error("Please use a JPG, PNG, or WebP photo.");
      return;
    }
    setProofOptimizing(true);
    setOptimizedProof(null);
    try {
      const optimized = await optimizePaymentProofImage(file);
      setOptimizedProof(optimized);
      toast.success("Photo uploaded");
    } catch (error) {
      toast.error(
        apiErrorMessage(error, "Could not use that image. Try another photo."),
      );
      setOptimizedProof(null);
    } finally {
      setProofOptimizing(false);
    }
  };

  const clearProofSelection = () => {
    setOptimizedProof(null);
  };

  const performCartCheckout = () => {
    if (!user) {
      toast.error("You need to be signed in to checkout.");
      return;
    }
    if (cartLines.length === 0) {
      toast.error("Select at least one timeslot to continue.");
      return;
    }
    if (cartHasConflicts) {
      toast.error("Some selected lines are unavailable. Fix highlighted lines first.");
      return;
    }
    const bookingGroupId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `grp-${Date.now()}`;
    const displayName = user.full_name?.trim() || user.email;
    const venueMessage = notes.trim() || "";
    const payloads = cartLines.flatMap((line) =>
      buildBookingPayloads(line.segments, line.court!, {
        date: line.item.date,
        playerName: displayName,
        playerEmail: user.email,
        notes: venueMessage || (line.item.notes?.trim() ?? ""),
        bookingGroupId,
        flatBookingFeePhp: line.flatBookingFeePhp,
      }),
    );
    createBookings.mutate(payloads);
  };

  const openCartCheckoutReview = () => {
    if (!user) {
      toast.error("You need to be signed in to checkout.");
      return;
    }
    if (cartLines.length === 0) {
      toast.error("Select at least one timeslot to continue.");
      return;
    }
    if (cartHasConflicts) {
      toast.error("Some selected lines are unavailable. Fix highlighted lines first.");
      return;
    }
    setCartCheckoutReviewOpen(true);
  };

  const shiftSelectedDate = (days: number) => {
    const next = addDays(selectedDate, days);
    const normalizedNext = startOfDay(next);
    if (isBefore(normalizedNext, todayStart)) return;
    if (isAfter(normalizedNext, maxSelectableDate)) return;
    setSelectedDate(next);
  };

  const toggleMatrixSlotForCourt = (matrixCourt: Court, time: string) => {
    if (!user) {
      toast.error("You need to be signed in to book.");
      return;
    }
    if (isBookableHourStartInPast(time, selectedDate)) return;
    const occupation = matrixOccupationByCourtId.get(matrixCourt.id) ?? {
      bookingBlocked: new Set<string>(),
      closureBlocked: new Set<string>(),
    };
    const occupiedForCourt = new Set<string>([
      ...occupation.bookingBlocked,
      ...occupation.closureBlocked,
    ]);
    if (occupiedForCourt.has(time)) return;

    const existingLine =
      cartItems.find((item) => item.courtId === matrixCourt.id && item.date === dateIso) ??
      null;
    const nextSlots = new Set(existingLine?.slots ?? []);
    if (nextSlots.has(time)) {
      nextSlots.delete(time);
    } else {
      nextSlots.add(time);
    }
    const normalizedSlots = Array.from(nextSlots).sort(
      (a, b) => hourFromTime(a) - hourFromTime(b),
    );

    if (normalizedSlots.length === 0) {
      if (existingLine) removeCartItem(existingLine.id);
      return;
    }

    const outcome = addOrMergeCartItem({
      venueId: matrixCourt.venue_id,
      venueName: matrixCourt.establishment_name ?? "Selected venue",
      courtId: matrixCourt.id,
      courtName: matrixCourt.name,
      sport: matrixCourt.sport,
      date: dateIso,
      slots: normalizedSlots,
      notes: notes.trim() || existingLine?.notes?.trim() || "",
    });
    if (!outcome.ok) {
      toast.error(outcome.reason);
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 sm:px-6 md:px-10">
        <Skeleton className="aspect-video w-full rounded-2xl" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  const timeSlots = court
    ? bookableHourTokensFromRanges(court.hourly_rate_windows ?? [])
    : [];

  if (!court) {
    return (
      <div className="px-6 py-8 text-center md:px-10">
        <p className="text-muted-foreground">Court not found.</p>
        <Button
          variant="outline"
          onClick={() => router.push("/courts")}
          className="mt-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Courts
        </Button>
      </div>
    );
  }

  const hasMapPin =
    court.map_latitude != null &&
    court.map_longitude != null &&
    Number.isFinite(court.map_latitude) &&
    Number.isFinite(court.map_longitude);
  const mapLat = court.map_latitude ?? 0;
  const mapLon = court.map_longitude ?? 0;
  const mapOpenHref = hasMapPin
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${mapLat},${mapLon}`)}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(court.location)}`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 md:px-10">
      <ConfirmDialog
        open={!!confirmDeleteReviewId}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteReviewId(null);
        }}
        title="Delete review?"
        description="This action cannot be undone."
        confirmLabel="Delete review"
        isPending={deleteReviewMut.isPending}
        onConfirm={() => {
          if (!confirmDeleteReviewId) return;
          deleteReviewMut.mutate(confirmDeleteReviewId);
          setConfirmDeleteReviewId(null);
        }}
      />
      <Dialog
        open={cartCheckoutReviewOpen}
        onOpenChange={setCartCheckoutReviewOpen}
      >
        <DialogContent
          className="flex max-h-[min(90dvh,36rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
          linkDescription
        >
          <DialogHeader className="space-y-2 border-b border-border/60 px-6 py-4">
            <DialogTitle className="font-heading text-lg">
              Review bookings
            </DialogTitle>
            <DialogDescription>
              Confirm courts, dates, and times before we create your payment hold.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <div className="space-y-5">
              {groupedCartLines.map(([date, lines]) => (
                <div key={date} className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {format(new Date(`${date}T12:00:00`), "EEE, MMM d, yyyy")}
                  </p>
                  <ul className="space-y-2">
                    {lines.map((line) => (
                      <li
                        key={line.item.id}
                        className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2.5"
                      >
                        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                          <div className="min-w-0 flex-1 space-y-1">
                            <p className="font-heading text-sm font-semibold text-foreground">
                              {line.item.courtName}
                            </p>
                            <p className="text-sm text-foreground/75">
                              {cartLineLabel(line.item.slots)}
                            </p>
                            {line.item.notes?.trim() ? (
                              <p className="text-xs text-muted-foreground">
                                Note: {line.item.notes.trim()}
                              </p>
                            ) : null}
                          </div>
                          <div className="shrink-0 text-right">
                            <p className="font-heading text-sm font-bold tabular-nums text-primary">
                              {formatPhp(line.totals.total_cost)}
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {formatPhp(line.totals.court_subtotal)} +{" "}
                              {formatPhp(line.totals.booking_fee)} fee
                            </p>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-border/60 px-6 py-3">
            <span className="text-sm font-medium text-muted-foreground">
              Total
            </span>
            <span className="font-heading text-lg font-bold text-primary tabular-nums">
              {formatPhp(cartGrandTotal)}
            </span>
          </div>
          {cartHasConflicts ? (
            <p className="border-t border-amber-500/30 bg-amber-500/8 px-6 py-2 text-xs text-amber-900 dark:text-amber-200">
              Some lines are no longer available. Close this dialog and update your
              selections.
            </p>
          ) : null}
          <DialogFooter className="gap-2 border-t border-border/60 px-6 py-4 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setCartCheckoutReviewOpen(false)}
            >
              Back
            </Button>
            <Button
              type="button"
              className="font-heading font-semibold"
              onClick={() => performCartCheckout()}
              disabled={
                createBookings.isPending ||
                cartHasConflicts ||
                cartLines.length === 0
              }
            >
              {createBookings.isPending ? "Booking…" : "Confirm all bookings"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!flagReviewId}
        onOpenChange={(o) => {
          if (!o) {
            setFlagReviewId(null);
            setFlagNote("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md" linkDescription>
          <DialogHeader>
            <DialogTitle className="font-heading">Report review</DialogTitle>
            <DialogDescription>
              Flag this review for the platform team. The review stays visible
              until a superadmin removes it or clears the flag.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="flag-note">Note (optional)</Label>
            <Textarea
              id="flag-note"
              value={flagNote}
              onChange={(e) => setFlagNote(e.target.value)}
              rows={3}
              placeholder="Why should we look at this?"
            />
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setFlagReviewId(null);
                setFlagNote("");
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="font-heading font-semibold"
              disabled={!flagReviewId || flagReviewMut.isPending}
              onClick={() => {
                if (!flagReviewId) return;
                flagReviewMut.mutate({
                  reviewId: flagReviewId,
                  reason: flagNote.trim(),
                });
              }}
            >
              {flagReviewMut.isPending ? "Sending…" : "Submit report"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Button
        variant="ghost"
        onClick={() => router.push("/courts")}
        className="mb-4 -ml-2 text-muted-foreground"
      >
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Courts
      </Button>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
        <div className="order-2 min-w-0 space-y-6 lg:order-2">
          <CourtGalleryCarousel
            key={galleryUrls.join("|")}
            urls={galleryUrls}
            name={court.name}
          />

          <PageHeader
            title={`Book ${court.establishment_name ?? court.name}`}
            subtitle={court.location}
            alignActions="start"
          >
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={cn(
                "shrink-0",
                isFavorite(court.venue_id) && "border-primary/50",
              )}
              aria-label={
                isFavorite(court.venue_id)
                  ? "Remove from favorites"
                  : "Add to favorites"
              }
              onClick={() => toggleFavorite(court.venue_id)}
            >
              <Heart
                className={cn(
                  "h-4 w-4",
                  isFavorite(court.venue_id)
                    ? "fill-primary stroke-primary"
                    : "text-muted-foreground",
                )}
              />
            </Button>
          </PageHeader>

          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="font-heading text-lg">Court details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6 pb-6">
              {court.description ? (
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {court.description}
                </p>
              ) : null}
              <dl className="grid gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Type</dt>
                  <dd className="mt-0.5 text-foreground">
                    {formatStatusLabel(court.type)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Surface</dt>
                  <dd className="mt-0.5 text-foreground">
                    {formatAmenityLabel(court.surface)}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">Rates by time</dt>
                  <dd className="mt-1 space-y-1 font-medium text-foreground">
                    {(court.hourly_rate_windows ?? []).map((rateWindow) => (
                      <div
                        key={`${rateWindow.start}-${rateWindow.end}-${rateWindow.hourly_rate}`}
                      >
                        {formatTimeShort(rateWindow.start)} –{" "}
                        {formatTimeShort(rateWindow.end)}:{" "}
                        {formatPhpCompact(rateWindow.hourly_rate)}/hr
                      </div>
                    ))}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Contact</dt>
                  <dd className="mt-0.5 font-medium text-foreground">
                    {court.contact_phone ?? "—"}
                  </dd>
                </div>
                {court.facebook_url || court.instagram_url ? (
                  <div>
                    <dt className="text-muted-foreground">Links</dt>
                    <dd className="mt-0.5 flex flex-wrap gap-2">
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
                    </dd>
                  </div>
                ) : null}
                <div className="sm:col-span-2">
                  <dt className="mb-2 text-muted-foreground">Amenities</dt>
                  <dd className="flex flex-wrap gap-1.5">
                    {court.amenities?.length ? (
                      court.amenities.map((amenity) => (
                        <Badge
                          key={amenity}
                          variant="outline"
                          className="font-normal"
                        >
                          {formatAmenityLabel(amenity)}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </dd>
                </div>
              </dl>

              <div className="space-y-3 border-t border-border/60 pt-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <h3 className="flex items-center gap-2 font-heading text-base font-semibold text-foreground">
                      <MapPin className="h-4 w-4 text-primary" aria-hidden />
                      Location
                    </h3>
                    <p className="text-sm text-foreground">{court.location}</p>
                    <p className="text-xs text-muted-foreground">
                      {hasMapPin
                        ? "Opens in Google Maps at the venue pin."
                        : "Opens in Google Maps using this address."}
                    </p>
                  </div>
                  <Button variant="outline" size="sm" className="shrink-0 self-start sm:mt-7" asChild>
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

              <div className="space-y-3 border-t border-border/60 pt-4">
                <h3 className="font-heading text-base font-semibold text-foreground">
                  Reviews
                </h3>
                {isLoadingReviews ? (
                  <div className="space-y-2">
                    <Skeleton className="h-8 w-56 rounded-lg" />
                    <Skeleton className="h-14 rounded-lg" />
                    <Skeleton className="h-14 rounded-lg" />
                  </div>
                ) : (
                  <>
                    {reviewsSummaryLine ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <StarRow rating={reviewsSummaryLine.average} />
                        <span className="text-sm text-muted-foreground">
                          {reviewsSummaryLine.average.toFixed(1)} average ·{" "}
                          {reviewsSummaryLine.count}{" "}
                          {reviewsSummaryLine.count === 1
                            ? "rating"
                            : "ratings"}
                        </span>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No reviews yet. Leave one after a completed visit.
                      </p>
                    )}
                    {reviewsNewestFirst.length > 0 ? (
                      <ul className="space-y-3">
                        {reviewsNewestFirst.map((review) => {
                          const isOwner = user?.id === review.user_id;
                          const canFlag =
                            user &&
                            canCourtVenueAdminFlagReview(user, court) &&
                            review.user_id !== user.id &&
                            !review.flagged;
                          const canPlatformDelete =
                            user && isSuperadmin(user);
                          return (
                            <li
                              key={review.id}
                              className="rounded-xl border border-border/60 bg-muted/10 px-3 py-3 text-sm"
                            >
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0 space-y-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <StarRow rating={review.rating} />
                                    <span className="font-medium text-foreground">
                                      {review.user_name}
                                    </span>
                                    {review.flagged ? (
                                      <Badge
                                        variant="outline"
                                        className="text-[10px] text-amber-800 border-amber-500/40 bg-amber-500/10"
                                      >
                                        Flagged for review
                                      </Badge>
                                    ) : null}
                                  </div>
                                  <p className="text-xs text-muted-foreground">
                                    {format(
                                      new Date(review.created_at),
                                      "MMM d, yyyy",
                                    )}
                                  </p>
                                  {review.comment ? (
                                    <p className="pt-1 text-foreground/90">
                                      {review.comment}
                                    </p>
                                  ) : null}
                                </div>
                                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                                  {canFlag ? (
                                    <Button
                                      type="button"
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setFlagNote("");
                                        setFlagReviewId(review.id);
                                      }}
                                    >
                                      Report
                                    </Button>
                                  ) : null}
                                  {isOwner ? (
                                    <Button variant="outline" size="sm" asChild>
                                      <Link
                                        href={`/my-bookings/${review.booking_id}`}
                                      >
                                        Edit review
                                      </Link>
                                    </Button>
                                  ) : null}
                                  {canPlatformDelete ? (
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="sm"
                                      className="text-destructive hover:text-destructive"
                                      disabled={deleteReviewMut.isPending}
                                      onClick={() =>
                                        setConfirmDeleteReviewId(review.id)
                                      }
                                    >
                                      Delete
                                    </Button>
                                  ) : null}
                                </div>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    ) : null}
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="order-1 min-w-0 space-y-6 lg:order-1">
        <Card className="border-border/50">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-lg">Choose your slots</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border border-border/60 bg-muted/20 p-2">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Previous day"
                onClick={() => shiftSelectedDate(-1)}
                disabled={isBefore(startOfDay(addDays(selectedDate, -1)), todayStart)}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-foreground">
                  {format(selectedDate, "EEE, MMM d")}
                </p>
                <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="Open date picker"
                      className="h-8 w-8"
                    >
                      <CalendarDays className="h-4 w-4" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="center" className="w-auto p-2">
                    <Calendar
                      mode="single"
                      selected={selectedDate}
                      onSelect={(date) => {
                        if (!date) return;
                        setSelectedDate(date);
                        setDatePickerOpen(false);
                      }}
                      disabled={(date) =>
                        isBefore(startOfDay(date), todayStart) ||
                        isAfter(startOfDay(date), maxSelectableDate)
                      }
                      defaultMonth={selectedDate}
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Next day"
                onClick={() => shiftSelectedDate(1)}
                disabled={isAfter(startOfDay(addDays(selectedDate, 1)), maxSelectableDate)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <div className="relative max-h-[min(46vh,22rem)] overflow-auto rounded-xl border border-border/60">
              {isSlotMatrixFetching ? (
                <div
                  className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-xl bg-background/55 backdrop-blur-[1px]"
                  aria-busy
                  aria-label="Updating availability"
                >
                  <span className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground shadow-sm">
                    Updating slots…
                  </span>
                </div>
              ) : null}
              <table className="min-w-full text-xs">
                <thead className="sticky top-0 z-10 bg-muted/70 backdrop-blur">
                  <tr>
                    <th className="w-44 px-4 py-2 text-left font-semibold text-muted-foreground">
                      Time
                    </th>
                    {matrixCourts.map((matrixCourt) => (
                      <th
                        key={matrixCourt.id}
                        className="min-w-28 px-2 py-2 text-center font-semibold text-foreground"
                      >
                        {courtNumberLabel(matrixCourt)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {timeSlots.map((time) => (
                    <tr key={time} className="border-t border-border/40">
                      <td className="w-44 whitespace-nowrap px-4 py-2.5 font-medium tracking-[0.01em] text-foreground/90">
                        {formatMatrixTimeLabel(time)}
                      </td>
                      {matrixCourts.map((matrixCourt) => {
                        const occupation = matrixOccupationByCourtId.get(matrixCourt.id) ?? {
                          bookingBlocked: new Set<string>(),
                          closureBlocked: new Set<string>(),
                        };
                        const isBookedOrPending = occupation.bookingBlocked.has(time);
                        const isClosureBlocked = occupation.closureBlocked.has(time);
                        const isUnavailable = isBookedOrPending || isClosureBlocked;
                        const isPastHour = isBookableHourStartInPast(time, selectedDate);
                        const line =
                          cartItems.find(
                            (item) =>
                              item.courtId === matrixCourt.id && item.date === dateIso,
                          ) ?? null;
                        const isSelected = Boolean(line?.slots.includes(time));
                        return (
                          <td key={`${matrixCourt.id}-${time}`} className="p-1.5">
                            <button
                              type="button"
                              onClick={() => toggleMatrixSlotForCourt(matrixCourt, time)}
                              disabled={isUnavailable || isPastHour}
                              className={cn(
                                "h-10 w-full rounded-md border text-[11px] font-medium transition-colors",
                                isSelected &&
                                  !isUnavailable &&
                                  !isPastHour &&
                                  "border-primary bg-primary text-primary-foreground",
                                !isSelected &&
                                  !isUnavailable &&
                                  !isPastHour &&
                                  "border-border bg-background hover:border-primary/40 hover:bg-primary/5",
                                isUnavailable &&
                                  "cursor-not-allowed border-border bg-muted text-muted-foreground/70",
                                isPastHour &&
                                  "cursor-not-allowed border-dashed border-border bg-muted/60 text-muted-foreground/70",
                              )}
                            >
                              {isUnavailable
                                ? isClosureBlocked
                                  ? "Blocked"
                                  : "Booked"
                                : isPastHour
                                  ? "Past"
                                  : isSelected
                                    ? "Selected"
                                    : "Open"}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-muted-foreground">
              Tap cells to build your booking across courts. Selected cells are added
              to the inline summary below.
            </p>
          </CardContent>
        </Card>
          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="font-heading text-lg">Notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {!user ? (
                <p className="text-sm text-muted-foreground">
                  <Link
                    href={`/login?next=${encodeURIComponent(`/courts/${activeCourtId}/book`)}`}
                    className="font-medium text-primary underline underline-offset-2"
                  >
                    Sign in
                  </Link>{" "}
                  to book this court.
                </p>
              ) : null}
              <div>
                <Label htmlFor="notes">Optional message for the venue</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any special requests..."
                  rows={3}
                  className="mt-2"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="sticky top-4 border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="font-heading text-lg">
                Booking summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {groupedCartLines.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No selections yet. Use the venue matrix to pick courts and times.
                </p>
              ) : (
                <div className="max-h-[min(36vh,18rem)] space-y-3 overflow-auto pr-1">
                  {groupedCartLines.map(([date, lines]) => (
                    <div key={date} className="space-y-2 rounded-lg border border-border/60 p-2.5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {format(new Date(`${date}T12:00:00`), "EEE, MMM d")}
                      </p>
                      {lines.map((line) => (
                        <div
                          key={line.item.id}
                          className="rounded-lg border border-border/60 bg-muted/10 px-3 py-2.5 transition-colors hover:border-border hover:bg-muted/20"
                        >
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-heading text-sm font-semibold tracking-tight text-foreground">
                                {line.item.courtName}
                              </p>
                              <p className="mt-0.5 truncate text-sm text-foreground/70">
                                {cartLineLabel(line.item.slots)}
                              </p>
                            </div>
                            <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-2.5">
                              <span className="font-heading text-base font-bold tabular-nums text-primary">
                                {formatPhp(line.totals.total_cost)}
                              </span>
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground hover:border-destructive/40 hover:bg-destructive/5 hover:text-destructive"
                                aria-label={`Remove ${line.item.courtName} from summary`}
                                onClick={() => removeCartItem(line.item.id)}
                              >
                                <Trash2 className="h-4 w-4" aria-hidden />
                              </Button>
                            </div>
                          </div>
                          {line.unavailableSlots.length > 0 ? (
                            <p className="mt-2 border-t border-border/40 pt-2 text-[11px] leading-snug text-destructive">
                              Unavailable:{" "}
                              {line.unavailableSlots
                                .map(formatBookableHourSlotRange)
                                .join(", ")}
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
              {cartHasConflicts ? (
                <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-900 dark:text-amber-200">
                  Some lines are no longer available. Update those lines before checkout.
                </p>
              ) : null}
              <div className="flex items-center justify-between border-t border-border/60 pt-3">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="font-heading text-lg font-bold text-primary">
                  {formatPhp(cartGrandTotal)}
                </span>
              </div>
              <Button
                className="w-full font-heading font-semibold shadow-lg shadow-primary/20"
                size="lg"
                onClick={openCartCheckoutReview}
                disabled={
                  !user ||
                  cartLines.length === 0 ||
                  cartHasConflicts ||
                  createBookings.isPending ||
                  !!paymentOverlay
                }
              >
                {createBookings.isPending ? "Processing…" : "Review & confirm"}
              </Button>
              <Button
                className="w-full"
                variant="ghost"
                onClick={clearCart}
                disabled={cartLines.length === 0}
              >
                Clear selections
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
      {paymentOverlay ? (
        <PaymentLockOverlay
          description="Send the amount to the account below, then add a clear photo of your receipt or transfer screen."
          remainingSeconds={overlayRemainingSeconds}
          totalDue={overlayTotalDue}
          paymentMethods={paymentOverlay.payment_methods}
          selectedPaymentMethod={selectedPaymentMethod}
          onPaymentMethodChange={(value) => setSelectedPaymentMethod(value)}
          onPickProofFile={processProofFile}
          proofPreviewUrl={optimizedProof?.dataUrl ?? null}
          proofOptimizing={proofOptimizing}
          onClearProof={clearProofSelection}
          onSubmit={() => submitPaymentProof.mutate()}
          submitDisabled={
            submitPaymentProof.isPending ||
            proofOptimizing ||
            !selectedPaymentMethod ||
            !optimizedProof
          }
          submitPending={submitPaymentProof.isPending}
          onCancel={() => cancelPendingPayment.mutate()}
          cancelDisabled={submitPaymentProof.isPending}
          cancelPending={cancelPendingPayment.isPending}
        />
      ) : null}
      {createBookings.isPending ? (
        <div className="fixed bottom-4 right-4 z-50 rounded-full border border-border bg-background/95 px-4 py-2 text-sm shadow-lg">
          <span className="inline-flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Creating booking hold...
          </span>
        </div>
      ) : null}
    </div>
  );
}

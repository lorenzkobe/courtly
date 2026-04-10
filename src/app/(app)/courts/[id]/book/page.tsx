"use client";

import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
  type QueryKey,
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
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Heart,
  Loader2,
  MapPin,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiErrorMessage } from "@/lib/api/api-error-message";
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
  const proofFileInputRef = useRef<HTMLInputElement>(null);
  const [proofOptimizing, setProofOptimizing] = useState(false);
  const [proofDragActive, setProofDragActive] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  useEffect(() => {
    setActiveCourtId(paramCourtId);
  }, [paramCourtId]);

  const dateIso = format(selectedDate, "yyyy-MM-dd");
  const todayStart = useMemo(() => startOfDay(new Date()), []);
  const maxSelectableDate = useMemo(() => addMonths(todayStart, 4), [todayStart]);
  const bookingSurfaceKey = queryKeys.bookingSurface.courtDay(activeCourtId, dateIso);
  const myDayBookingsQueryKey = useMemo(
    () =>
      user?.email
        ? queryKeys.bookings.list({
            court_id: activeCourtId,
            date: dateIso,
            player_email: user.email,
          })
        : null,
    [activeCourtId, dateIso, user?.email],
  );
  const bookingRealtimeKeys = useMemo((): QueryKey[] => {
    const keys: QueryKey[] = [bookingSurfaceKey];
    if (myDayBookingsQueryKey) keys.push(myDayBookingsQueryKey);
    return keys;
  }, [bookingSurfaceKey, myDayBookingsQueryKey]);
  useBookingsRealtime({
    filter: activeCourtId ? `court_id=eq.${activeCourtId}` : null,
    enabled: !!activeCourtId,
    queryKeysToInvalidate: bookingRealtimeKeys,
  });

  const { data: bookingSurface, isLoading: isLoadingBookingSurface } = useQuery({
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

  const { data: myDayBookings = [] } = useQuery({
    queryKey:
      myDayBookingsQueryKey ??
      queryKeys.bookings.list({
        court_id: activeCourtId,
        date: dateIso,
        player_email: user?.email,
      }),
    queryFn: async () => {
      if (!user?.email) return [] as Booking[];
      const { data } = await courtlyApi.bookings.list({
        court_id: activeCourtId,
        date: dateIso,
        player_email: user.email,
      });
      return data;
    },
    enabled: !!user?.email && !!activeCourtId,
  });
  const court = bookingSurface?.court;
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

  const matrixOccupiedByCourtId = useMemo(() => {
    const out = new Map<string, Set<string>>();
    matrixCourts.forEach((matrixCourt, idx) => {
      const surface = matrixSurfaceQueries[idx]?.data;
      const bookings = surface?.availability.bookings ?? EMPTY_BOOKINGS;
      const courtClosures = surface?.availability.court_closures ?? EMPTY_COURT_CLOSURES;
      const venueClosures = surface?.availability.venue_closures ?? EMPTY_VENUE_CLOSURES;
      const occupiedForCourt = occupiedHourStarts(bookings);
      for (const token of occupiedHourStartsFromClosures(courtClosures, dateIso)) {
        occupiedForCourt.add(token);
      }
      for (const token of occupiedHourStartsFromClosures(venueClosures, dateIso)) {
        occupiedForCourt.add(token);
      }
      out.set(matrixCourt.id, occupiedForCourt);
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
      return {
        item,
        court: lineCourt,
        segments: lineSegments,
        unavailableSlots,
        totals: splitBookingAmounts(subtotal, undefined),
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
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all() });
      void queryClient.invalidateQueries({ queryKey: bookingSurfaceKey });
      setPaymentOverlay(null);
      setOptimizedProof(null);
      setSelectedPaymentMethod(null);
      toast.success("Payment submitted. Waiting for venue confirmation.");
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, "Could not submit payment proof."));
    },
  });

  useEffect(() => {
    const timer = window.setInterval(() => setCountdownNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const activePendingBooking = useMemo(() => {
    const now = countdownNow;
    const candidates = myDayBookings
      .filter(
        (booking) =>
          booking.status === "pending_payment" &&
          booking.hold_expires_at &&
          new Date(booking.hold_expires_at).getTime() > now &&
          !booking.payment_failed_at,
      )
      .sort((a, b) => (b.created_date ?? "").localeCompare(a.created_date ?? ""));
    return candidates[0] ?? null;
  }, [myDayBookings, countdownNow]);

  useEffect(() => {
    if (!activePendingBooking || !activePendingBooking.hold_expires_at) {
      return;
    }
    const holdExpiresAt = activePendingBooking.hold_expires_at;
    const paymentMethods = venuePaymentMethodsForCheckout(court ?? {});
    setPaymentOverlay((current) => {
      if (current?.booking_id === activePendingBooking.id) return current;
      return {
        booking_id: activePendingBooking.id,
        booking_group_id: activePendingBooking.booking_group_id ?? activePendingBooking.id,
        hold_expires_at: holdExpiresAt,
        payment_methods: paymentMethods,
      };
    });
    setSelectedPaymentMethod((current) => current ?? paymentMethods[0]?.method ?? null);
  }, [activePendingBooking, court]);

  useEffect(() => {
    if (!paymentOverlay) return;
    const related = myDayBookings.filter(
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
  }, [myDayBookings, paymentOverlay]);

  const overlayRemainingSeconds = paymentOverlay
    ? Math.max(
        0,
        Math.ceil((new Date(paymentOverlay.hold_expires_at).getTime() - countdownNow) / 1000),
      )
    : 0;

  useEffect(() => {
    if (!paymentOverlay) return;
    if (overlayRemainingSeconds <= 0) {
      setPaymentOverlay(null);
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

  const onProofFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await processProofFile(file);
    event.target.value = "";
  };

  const clearProofSelection = () => {
    setOptimizedProof(null);
    if (proofFileInputRef.current) proofFileInputRef.current.value = "";
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
    const payloads = cartLines.flatMap((line) =>
      buildBookingPayloads(line.segments, line.court!, {
        date: line.item.date,
        playerName: displayName,
        playerEmail: user.email,
        notes: line.item.notes ?? "",
        bookingGroupId,
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
    const occupiedForCourt = matrixOccupiedByCourtId.get(matrixCourt.id) ?? new Set<string>();
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
      notes: existingLine?.notes ?? notes,
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
            <CardTitle className="font-heading text-lg">
              Venue schedule matrix
            </CardTitle>
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
            <div className="max-h-[min(46vh,22rem)] overflow-auto rounded-xl border border-border/60">
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
                        const occupiedForCourt =
                          matrixOccupiedByCourtId.get(matrixCourt.id) ?? new Set<string>();
                        const isUnavailable = occupiedForCourt.has(time);
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
                              {isSelected
                                ? "Selected"
                                : isUnavailable
                                  ? "Booked"
                                  : isPastHour
                                    ? "Past"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 p-4 backdrop-blur-sm">
          <Card className="w-full max-w-md border-primary/25 shadow-2xl">
            <CardContent className="space-y-5 p-6">
              <div className="space-y-1.5 text-center">
                <h2 className="font-heading text-xl font-semibold tracking-tight">
                  Complete your payment
                </h2>
                <p className="text-sm text-muted-foreground leading-snug">
                  Send the amount to the account below, then add a clear photo of your
                  receipt or transfer screen.
                </p>
              </div>
              <div className="rounded-2xl bg-primary/10 px-4 py-4 text-center ring-1 ring-primary/20">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                  Time left to submit
                </p>
                <p className="mt-1 font-heading text-3xl font-bold text-primary tabular-nums">
                  {Math.floor(overlayRemainingSeconds / 60)
                    .toString()
                    .padStart(2, "0")}
                  :
                  {(overlayRemainingSeconds % 60).toString().padStart(2, "0")}
                </p>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="payment-method-select" className="text-sm font-medium">
                    Pay with
                  </Label>
                  <Select
                    value={selectedPaymentMethod ?? ""}
                    onValueChange={(value) =>
                      setSelectedPaymentMethod(value as "gcash" | "maya")
                    }
                  >
                    <SelectTrigger id="payment-method-select" className="h-11">
                      <SelectValue placeholder="Choose GCash or Maya" />
                    </SelectTrigger>
                    <SelectContent>
                      {paymentOverlay.payment_methods.map((method) => (
                        <SelectItem key={method.method} value={method.method}>
                          {formatStatusLabel(method.method)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedPaymentMethod ? (
                    <div className="rounded-xl bg-muted/50 px-3.5 py-3 text-sm">
                      {(() => {
                        const selected = paymentOverlay.payment_methods.find(
                          (method) => method.method === selectedPaymentMethod,
                        );
                        if (!selected) return null;
                        return (
                          <dl className="space-y-1">
                            <div>
                              <dt className="text-xs text-muted-foreground">Account name</dt>
                              <dd className="font-medium text-foreground">
                                {selected.account_name}
                              </dd>
                            </div>
                            <div>
                              <dt className="text-xs text-muted-foreground">Number</dt>
                              <dd className="font-mono text-[15px] font-medium tracking-wide text-foreground">
                                {selected.account_number}
                              </dd>
                            </div>
                          </dl>
                        );
                      })()}
                    </div>
                  ) : null}
                </div>

                <div
                  className="space-y-2"
                  aria-busy={proofOptimizing}
                >
                  <span className="text-sm font-medium text-foreground">
                    Payment photo
                  </span>
                  <input
                    ref={proofFileInputRef}
                    id="payment-proof-file"
                    type="file"
                    accept={PAYMENT_PROOF_ALLOWED_INPUT_MIME_TYPES.join(",")}
                    onChange={onProofFileChange}
                    className="sr-only"
                  />
                  {optimizedProof && !proofOptimizing ? (
                    <div className="overflow-hidden rounded-2xl border border-border bg-muted/20">
                      {/* eslint-disable-next-line @next/next/no-img-element -- data URL preview */}
                      <img
                        src={optimizedProof.dataUrl}
                        alt="Preview of your payment screenshot"
                        className="max-h-48 w-full object-contain bg-black/5"
                      />
                      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 bg-background/80 px-3 py-2.5">
                        <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                          Looks good — tap submit when ready
                        </p>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 shrink-0 text-muted-foreground"
                          onClick={clearProofSelection}
                        >
                          Change photo
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <label
                      htmlFor="payment-proof-file"
                      onDragEnter={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setProofDragActive(true);
                      }}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setProofDragActive(true);
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                          setProofDragActive(false);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setProofDragActive(false);
                        const file = e.dataTransfer.files?.[0];
                        if (file) void processProofFile(file);
                      }}
                      className={cn(
                        "flex min-h-38 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-colors",
                        proofDragActive
                          ? "border-primary bg-primary/10"
                          : "border-muted-foreground/25 bg-muted/15 hover:border-muted-foreground/40 hover:bg-muted/25",
                        proofOptimizing && "pointer-events-none opacity-70",
                      )}
                    >
                      {proofOptimizing ? (
                        <>
                          <Loader2
                            className="h-9 w-9 animate-spin text-primary"
                            aria-hidden
                          />
                          <span className="text-sm font-medium text-foreground">
                            Preparing your photo…
                          </span>
                          <span className="text-xs text-muted-foreground">
                            This usually takes a moment
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="flex size-12 items-center justify-center rounded-full bg-background shadow-sm ring-1 ring-border">
                            <Upload className="h-5 w-5 text-muted-foreground" aria-hidden />
                          </span>
                          <span className="text-sm font-medium text-foreground">
                            Tap to choose or drop a photo here
                          </span>
                          <span className="max-w-[16rem] text-xs text-muted-foreground leading-relaxed">
                            Screenshot or camera photo of your payment confirmation. JPG,
                            PNG, or WebP.
                          </span>
                        </>
                      )}
                    </label>
                  )}
                </div>
              </div>
              <Button
                type="button"
                size="lg"
                className="w-full font-heading font-semibold"
                onClick={() => submitPaymentProof.mutate()}
                disabled={
                  submitPaymentProof.isPending ||
                  proofOptimizing ||
                  !selectedPaymentMethod ||
                  !optimizedProof
                }
              >
                {submitPaymentProof.isPending ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    Submitting…
                  </span>
                ) : (
                  "Submit for confirmation"
                )}
              </Button>
              <p className="text-center text-xs text-muted-foreground leading-relaxed">
                This window closes when the timer ends or after you submit.
              </p>
            </CardContent>
          </Card>
        </div>
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

"use client";

import {
  keepPreviousData,
  useMutation,
  useQueries,
  useQuery,
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
  ImageIcon,
  Loader2,
  MapPin,
  Trash2,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { VenueMapPinPicker } from "@/components/admin/VenueMapPinPicker";
import PageHeader from "@/components/shared/PageHeader";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { courtlyApi } from "@/lib/api/courtly-client";
import { queryKeys } from "@/lib/query/query-keys";
import { segmentsTotalCost } from "@/lib/court-pricing";
import { splitBookingAmounts } from "@/lib/platform-fee";
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
import { buildBookingPayloads } from "@/lib/bookings/booking-payloads";
import { useBookingCart } from "@/lib/stores/booking-cart";
import { loadGuestHold, saveGuestHold } from "@/lib/guest-booking-storage";
import { cn } from "@/lib/utils";
import type { Booking, Court, CourtClosure, VenueClosure } from "@/lib/types/courtly";
import { formatStatusLabel } from "@/lib/utils";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const EMPTY_BOOKINGS: Booking[] = [];
const EMPTY_COURT_CLOSURES: CourtClosure[] = [];
const EMPTY_VENUE_CLOSURES: VenueClosure[] = [];

function courtGalleryUrls(court: Court): string[] {
  if (court.venue_photo_urls && court.venue_photo_urls.length > 0)
    return court.venue_photo_urls;
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
  if (rawName.startsWith(prefix)) return rawName.slice(prefix.length).trim();
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

function CourtGalleryCarousel({ urls, name }: { urls: string[]; name: string }) {
  const [index, setIndex] = useState(0);
  const n = urls.length;
  const safeIndex = n > 0 ? index % n : 0;
  if (n === 0) {
    return (
      <div
        className="flex aspect-video w-full items-center justify-center rounded-2xl border border-border bg-muted"
        role="img"
        aria-label={`${name} — no photos`}
      >
        <ImageIcon className="h-12 w-12 text-muted-foreground/40" />
      </div>
    );
  }
  const go = (dir: -1 | 1) => setIndex((i) => (i + dir + n) % n);
  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-border/80 bg-muted shadow-sm">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={urls[safeIndex]}
        alt={`${name} — photo ${safeIndex + 1} of ${n}`}
        className="h-full w-full object-cover"
        referrerPolicy="no-referrer"
        loading="eager"
      />
      {n > 1 ? (
        <>
          <div className="pointer-events-none absolute inset-0 bg-linear-to-t from-black/25 to-transparent" />
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="absolute left-2 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full bg-black/50 text-white shadow-md pointer-events-auto hover:bg-black/70 hover:text-white"
            onClick={() => go(-1)}
            aria-label="Previous photo"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="absolute right-2 top-1/2 h-9 w-9 -translate-y-1/2 rounded-full bg-black/50 text-white shadow-md pointer-events-auto hover:bg-black/70 hover:text-white"
            onClick={() => go(1)}
            aria-label="Next photo"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </>
      ) : null}
    </div>
  );
}

export default function PublicBookCourtPage() {
  const params = useParams<{ courtId: string }>();
  const courtId = params.courtId;
  const router = useRouter();

  const addOrMergeCartItem = useBookingCart((s) => s.addOrMergeItem);
  const removeCartItem = useBookingCart((s) => s.removeItem);
  const clearCart = useBookingCart((s) => s.clearCart);
  const cartItems = useBookingCart((s) => s.items);

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [notes, setNotes] = useState("");
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [cartCheckoutReviewOpen, setCartCheckoutReviewOpen] = useState(false);

  // Guest info form
  const [guestFirstName, setGuestFirstName] = useState("");
  const [guestLastName, setGuestLastName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");

  // Whether the guest has an active payment hold (disables checkout button)
  const [hasActiveHold, setHasActiveHold] = useState(() => loadGuestHold() !== null);

  // Sync hold status whenever the gate signals a change (hold created or cancelled)
  useEffect(() => {
    const refresh = () => setHasActiveHold(loadGuestHold() !== null);
    window.addEventListener("courtly:hold-updated", refresh);
    return () => window.removeEventListener("courtly:hold-updated", refresh);
  }, []);

  const dateIso = format(selectedDate, "yyyy-MM-dd");
  const todayStart = useMemo(() => startOfDay(new Date()), []);
  const maxSelectableDate = useMemo(() => addMonths(todayStart, 4), [todayStart]);

  const bookingSurfaceKey = queryKeys.bookingSurface.courtDay(courtId, dateIso);

  const {
    data: bookingSurface,
    isPending: isBookingSurfacePending,
    isFetching: isFetchingBookingSurface,
  } = useQuery({
    queryKey: bookingSurfaceKey,
    queryFn: async () => {
      const { data } = await courtlyApi.courts.bookingSurface(courtId, { date: dateIso });
      return data;
    },
    enabled: !!courtId,
    staleTime: 15_000,
    placeholderData: keepPreviousData,
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
    queries: matrixCourts.map((mc) => ({
      queryKey: queryKeys.bookingSurface.courtDay(mc.id, dateIso),
      queryFn: async () => {
        const { data } = await courtlyApi.courts.bookingSurface(mc.id, { date: dateIso });
        return data;
      },
      staleTime: 15_000,
      enabled: !!mc.id,
      placeholderData: keepPreviousData,
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
    if (courtId) return [queryKeys.bookingSurface.courtDay(courtId, dateIso)];
    return [];
  }, [matrixCourts, courtId, dateIso]);

  const bookingCourtRealtimeFilter = useMemo(() => {
    const ids = matrixCourts.map((c) => c.id).filter(Boolean);
    const idList = ids.length > 0 ? ids : courtId ? [courtId] : [];
    if (idList.length === 0) return null;
    if (idList.length === 1) return `court_id=eq.${idList[0]}`;
    return `court_id=in.(${idList.join(",")})`;
  }, [matrixCourts, courtId]);

  useBookingsRealtime({
    filter: bookingCourtRealtimeFilter,
    enabled: Boolean(courtId && bookingCourtRealtimeFilter),
    queryKeysToInvalidate: matrixBookingSurfaceKeys,
  });

  const isSlotMatrixFetching =
    isFetchingBookingSurface || matrixSurfaceQueries.some((q) => q.isFetching);

  const isSlotMatrixPending =
    isBookingSurfacePending || matrixSurfaceQueries.some((q) => q.isPending);

  const effectiveDatePickerOpen = datePickerOpen && !isSlotMatrixFetching;

  const galleryUrls = useMemo(() => (court ? courtGalleryUrls(court) : []), [court]);

  const matrixOccupationByCourtId = useMemo(() => {
    const out = new Map<string, { bookingBlocked: Set<string>; closureBlocked: Set<string> }>();
    matrixCourts.forEach((mc, idx) => {
      const surface = matrixSurfaceQueries[idx]?.data;
      const bookings = surface?.availability.bookings ?? EMPTY_BOOKINGS;
      const courtClosures = surface?.availability.court_closures ?? EMPTY_COURT_CLOSURES;
      const venueClosures = surface?.availability.venue_closures ?? EMPTY_VENUE_CLOSURES;
      const bookingBlocked = occupiedHourStarts(bookings);
      const closureBlocked = occupiedHourStartsFromClosures(courtClosures, dateIso);
      for (const token of occupiedHourStartsFromClosures(venueClosures, dateIso)) {
        closureBlocked.add(token);
      }
      out.set(mc.id, { bookingBlocked, closureBlocked });
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
      const numHours = lineSegments.reduce(
        (sum, seg) => sum + hourFromTime(seg.end_time) - hourFromTime(seg.start_time),
        0,
      );
      return {
        item,
        court: lineCourt,
        segments: lineSegments,
        unavailableSlots,
        flatBookingFeePhp: flatFee ?? 0,
        totals: splitBookingAmounts(subtotal, flatFee, numHours),
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
        (line) => !line.court || line.unavailableSlots.length > 0 || line.segments.length === 0,
      ),
    [cartLines],
  );

  const cartGrandTotal = useMemo(
    () => cartLines.reduce((sum, line) => sum + line.totals.total_cost, 0),
    [cartLines],
  );

  // Guest form validation
  const trimmedFirst = guestFirstName.trim();
  const trimmedLast = guestLastName.trim();
  const trimmedEmail = guestEmail.trim().toLowerCase();
  const trimmedPhone = guestPhone.trim();
  const guestFormValid =
    trimmedFirst.length >= 2 &&
    trimmedLast.length >= 2 &&
    EMAIL_REGEX.test(trimmedEmail) &&
    trimmedPhone.length >= 7;

  // Checkout mutation
  const createBookingsMut = useMutation({
    mutationFn: async (payloads: Partial<Booking>[]) => {
      const res = await fetch("/api/bookings/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          guest_first_name: trimmedFirst,
          guest_last_name: trimmedLast,
          guest_email: trimmedEmail,
          guest_phone: trimmedPhone,
          items: payloads,
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        booking_id: string;
        booking_group_id: string;
        booking_number: string;
        hold_expires_at: string;
        total_due: number;
        payment_methods: Array<{ method: "gcash" | "maya"; account_name: string; account_number: string }>;
      };
      if (!res.ok) throw new Error(json.error ?? "Could not complete booking.");
      return json;
    },
    onSuccess: (checkout) => {
      saveGuestHold({
        booking_id: checkout.booking_id,
        booking_group_id: checkout.booking_group_id,
        booking_number: checkout.booking_number,
        hold_expires_at: checkout.hold_expires_at,
        total_due: checkout.total_due,
        payment_methods: checkout.payment_methods,
        player_first_name: trimmedFirst,
        player_last_name: trimmedLast,
        player_email: trimmedEmail,
        player_phone: trimmedPhone,
      });
      clearCart();
      setCartCheckoutReviewOpen(false);
      setHasActiveHold(true);
      window.dispatchEvent(new Event("courtly:hold-updated"));
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : "Could not complete booking.");
    },
  });

  const shiftSelectedDate = (days: number) => {
    const next = addDays(selectedDate, days);
    const normalizedNext = startOfDay(next);
    if (isBefore(normalizedNext, todayStart)) return;
    if (isAfter(normalizedNext, maxSelectableDate)) return;
    setSelectedDate(next);
  };

  const toggleMatrixSlotForCourt = (matrixCourt: Court, time: string) => {
    if (isBookableHourStartInPast(time, selectedDate)) return;
    const occupation = matrixOccupationByCourtId.get(matrixCourt.id) ?? {
      bookingBlocked: new Set<string>(),
      closureBlocked: new Set<string>(),
    };
    if (occupation.bookingBlocked.has(time) || occupation.closureBlocked.has(time)) return;

    const existingLine =
      cartItems.find((item) => item.courtId === matrixCourt.id && item.date === dateIso) ?? null;
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
    if (!outcome.ok) toast.error(outcome.reason);
  };

  const openCartCheckoutReview = () => {
    if (cartLines.length === 0) {
      toast.error("Select at least one timeslot to continue.");
      return;
    }
    if (cartHasConflicts) {
      toast.error("Some selected lines are unavailable. Fix highlighted lines first.");
      return;
    }
    if (!guestFormValid) {
      toast.error("Please fill in your name, email, and phone number before continuing.");
      return;
    }
    setCartCheckoutReviewOpen(true);
  };

  const performCartCheckout = () => {
    if (cartLines.length === 0 || cartHasConflicts || !guestFormValid) return;
    const bookingGroupId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `grp-${Date.now()}`;
    const payloads = cartLines.flatMap((line) =>
      buildBookingPayloads(line.segments, line.court!, {
        date: line.item.date,
        playerName: `${trimmedFirst} ${trimmedLast}`,
        playerEmail: trimmedEmail,
        notes: notes.trim() || line.item.notes?.trim() || "",
        bookingGroupId,
        flatBookingFeePhp: line.flatBookingFeePhp,
      }),
    );
    createBookingsMut.mutate(payloads);
  };

  if (isBookingSurfacePending) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-6 sm:px-6 md:px-10">
        <Skeleton className="aspect-video w-full rounded-2xl" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  if (!court) {
    return (
      <div className="px-6 py-8 text-center md:px-10">
        <p className="text-muted-foreground">Court not found.</p>
        <Button variant="outline" onClick={() => router.push("/book")} className="mt-4">
          <ArrowLeft className="mr-2 h-4 w-4" /> Browse courts
        </Button>
      </div>
    );
  }

  const timeSlots = bookableHourTokensFromRanges(court.hourly_rate_windows ?? []);

  const hasMapPin =
    court.map_latitude != null &&
    court.map_longitude != null &&
    Number.isFinite(court.map_latitude) &&
    Number.isFinite(court.map_longitude);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 md:px-10">
      {/* Cart checkout review dialog */}
      <Dialog open={cartCheckoutReviewOpen} onOpenChange={setCartCheckoutReviewOpen}>
        <DialogContent
          className="flex max-h-[min(90dvh,36rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-lg"
          linkDescription
        >
          <DialogHeader className="space-y-2 border-b border-border/60 px-6 py-4">
            <DialogTitle className="font-heading text-lg">Review bookings</DialogTitle>
            <DialogDescription>
              Confirm courts, dates, and times before we create your payment hold.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            <div className="mb-4 rounded-lg border border-border/60 bg-muted/20 px-4 py-3 text-sm">
              <p className="font-medium text-foreground">{trimmedFirst} {trimmedLast}</p>
              <p className="text-muted-foreground">{trimmedEmail}</p>
              <p className="text-muted-foreground">{trimmedPhone}</p>
            </div>
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
            <span className="text-sm font-medium text-muted-foreground">Total</span>
            <span className="font-heading text-lg font-bold text-primary tabular-nums">
              {formatPhp(cartGrandTotal)}
            </span>
          </div>
          <DialogFooter className="gap-2 border-t border-border/60 px-6 py-4 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setCartCheckoutReviewOpen(false)} disabled={createBookingsMut.isPending}>
              Back
            </Button>
            <Button
              type="button"
              className="font-heading font-semibold"
              onClick={() => performCartCheckout()}
              disabled={createBookingsMut.isPending || cartHasConflicts || cartLines.length === 0}
            >
              {createBookingsMut.isPending ? "Booking…" : "Confirm all bookings"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Button
        variant="ghost"
        onClick={() => router.push("/book")}
        className="mb-4 -ml-2 text-muted-foreground"
      >
        <ArrowLeft className="mr-2 h-4 w-4" /> Browse courts
      </Button>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
        {/* Right column: court info */}
        <div className="order-2 min-w-0 space-y-6 lg:order-2">
          <CourtGalleryCarousel
            key={galleryUrls.join("|")}
            urls={galleryUrls}
            name={court.name}
          />
          <PageHeader
            title={court.establishment_name ?? court.name}
            subtitle={court.city ?? court.location}
          />

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
                  <dd className="mt-0.5 text-foreground">{formatStatusLabel(court.type)}</dd>
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
                        <span
                          key={amenity}
                          className="rounded-full border border-border/60 px-2.5 py-1 text-xs font-normal text-foreground"
                        >
                          {formatAmenityLabel(amenity)}
                        </span>
                      ))
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </dd>
                </div>
              </dl>

              <div className="space-y-3 border-t border-border/60 pt-4">
                <h3 className="flex items-center gap-2 font-heading text-base font-semibold text-foreground">
                  <MapPin className="h-4 w-4 text-primary" aria-hidden />
                  Location
                </h3>
                {hasMapPin && (
                  <VenueMapPinPicker
                    value={{ lat: court.map_latitude ?? 0, lng: court.map_longitude ?? 0 }}
                    onChange={() => {}}
                    readOnly
                  />
                )}
                <p className="text-sm text-foreground">{court.location}</p>
                {hasMapPin && (
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <a
                        href={`https://maps.google.com/?q=${court.map_latitude ?? 0},${court.map_longitude ?? 0}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Google Maps
                        <ExternalLink className="ml-1.5 h-3 w-3 opacity-70" />
                      </a>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <a
                        href={`https://maps.apple.com/?ll=${court.map_latitude ?? 0},${court.map_longitude ?? 0}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Apple Maps
                        <ExternalLink className="ml-1.5 h-3 w-3 opacity-70" />
                      </a>
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Left column: slot picker + guest form + cart */}
        <div className="order-1 min-w-0 space-y-6 lg:order-1">
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="font-heading text-lg">Choose your slots</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {isSlotMatrixPending ? (
                <div className="space-y-3" aria-busy aria-label="Loading availability">
                  <Skeleton className="h-11 w-full rounded-xl" />
                  <div className="max-h-[min(46vh,22rem)] space-y-2 overflow-hidden rounded-xl border border-border/60 bg-muted/10 p-3">
                    {Array.from({ length: Math.min(14, Math.max(8, timeSlots.length)) }).map(
                      (_, rowIdx) => (
                        <div key={rowIdx} className="flex items-center gap-2">
                          <Skeleton className="h-10 w-36 shrink-0 rounded-md" />
                          <div className="flex min-w-0 flex-1 gap-1.5">
                            {Array.from({ length: Math.max(1, matrixCourts.length) }).map(
                              (__, colIdx) => (
                                <Skeleton key={colIdx} className="h-10 min-w-0 flex-1 rounded-md" />
                              ),
                            )}
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              ) : (
                <>
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
                      <Popover open={effectiveDatePickerOpen} onOpenChange={setDatePickerOpen}>
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
                      disabled={isAfter(
                        startOfDay(addDays(selectedDate, 1)),
                        maxSelectableDate,
                      )}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>

                  <div className="relative max-h-[min(46vh,22rem)] overflow-auto rounded-xl border border-border/60">
                    <table className="min-w-full text-xs">
                      <thead className="sticky top-0 z-10 bg-muted/70 backdrop-blur">
                        <tr>
                          <th className="w-44 px-4 py-2 text-left font-semibold text-muted-foreground">
                            Time
                          </th>
                          {matrixCourts.map((mc) => (
                            <th
                              key={mc.id}
                              className="min-w-28 px-2 py-2 text-center font-semibold text-foreground"
                            >
                              {courtNumberLabel(mc)}
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
                            {matrixCourts.map((mc) => {
                              const occupation = matrixOccupationByCourtId.get(mc.id) ?? {
                                bookingBlocked: new Set<string>(),
                                closureBlocked: new Set<string>(),
                              };
                              const isBookedOrPending = occupation.bookingBlocked.has(time);
                              const isClosureBlocked = occupation.closureBlocked.has(time);
                              const isUnavailable = isBookedOrPending || isClosureBlocked;
                              const isPastHour = isBookableHourStartInPast(time, selectedDate);
                              const line =
                                cartItems.find(
                                  (item) => item.courtId === mc.id && item.date === dateIso,
                                ) ?? null;
                              const isSelected = Boolean(line?.slots.includes(time));
                              return (
                                <td key={`${mc.id}-${time}`} className="p-1.5">
                                  <button
                                    type="button"
                                    onClick={() => toggleMatrixSlotForCourt(mc, time)}
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
                    Tap cells to build your booking. Selected slots are added to the
                    summary below.
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Guest info form */}
          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="font-heading text-lg">Your details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="guest-first-name">First name</Label>
                  <Input
                    id="guest-first-name"
                    autoComplete="given-name"
                    placeholder="Juan"
                    value={guestFirstName}
                    onChange={(e) => setGuestFirstName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="guest-last-name">Last name</Label>
                  <Input
                    id="guest-last-name"
                    autoComplete="family-name"
                    placeholder="Dela Cruz"
                    value={guestLastName}
                    onChange={(e) => setGuestLastName(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="guest-email">Email</Label>
                <Input
                  id="guest-email"
                  type="email"
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={guestEmail}
                  onChange={(e) => setGuestEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="guest-phone">Phone number</Label>
                <Input
                  id="guest-phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="09171234567"
                  value={guestPhone}
                  onChange={(e) => setGuestPhone(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notes">Note for the venue (optional)</Label>
                <Textarea
                  id="notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any special requests..."
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>

          {/* Booking summary */}
          <Card className="sticky top-4 border-border/60">
            <CardHeader className="pb-2">
              <CardTitle className="font-heading text-lg">Booking summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {groupedCartLines.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No selections yet. Use the slot matrix above to pick courts and times.
                </p>
              ) : (
                <div className="max-h-[min(36vh,18rem)] space-y-3 overflow-auto pr-1">
                  {groupedCartLines.map(([date, lines]) => (
                    <div
                      key={date}
                      className="space-y-2 rounded-lg border border-border/60 p-2.5"
                    >
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
                            <div className="ml-auto flex shrink-0 items-center gap-2">
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
                  cartLines.length === 0 ||
                  cartHasConflicts ||
                  createBookingsMut.isPending ||
                  hasActiveHold
                }
              >
                {createBookingsMut.isPending ? "Processing…" : "Review & confirm"}
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

      {createBookingsMut.isPending ? (
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

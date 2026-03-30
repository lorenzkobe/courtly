"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  format,
  isBefore,
  isSameDay,
  startOfDay,
  startOfMonth,
} from "date-fns";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Heart,
  MapPin,
  Star,
  X,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
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
import { courtlyApi } from "@/lib/api/courtly-client";
import { queryKeys } from "@/lib/query/query-keys";
import {
  hourlyRateForHourStart,
  segmentTotalCost,
  segmentsTotalCost,
} from "@/lib/court-pricing";
import {
  splitBookingAmounts,
} from "@/lib/platform-fee";
import { useAuth } from "@/lib/auth/auth-context";
import { useBookingsRealtime } from "@/lib/bookings/use-bookings-realtime";
import {
  availableSegmentsInRange,
  exclusiveEndAfterLastIncludedHour,
  formatBookableHourSlotRange,
  formatHourToken,
  formatSegmentLine,
  formatTimeShort,
  groupIntoContiguousHourRuns,
  hourFromTime,
  isBookableHourStartInPast,
  occupiedHourStarts,
  occupiedHourStartsFromClosures,
  totalBillableHours,
  type BookingSegment,
} from "@/lib/booking-range";
import { formatPhp, formatPhpCompact } from "@/lib/format-currency";
import { formatAmenityLabel } from "@/lib/format-amenity";
import { bookableHourTokensFromRanges } from "@/lib/venue-price-ranges";
import { canCourtVenueAdminFlagReview, isSuperadmin } from "@/lib/auth/management";
import type {
  Booking,
  Court,
  CourtClosure,
  CourtReview,
  VenueClosure,
} from "@/lib/types/courtly";
import { formatStatusLabel } from "@/lib/utils";
import { useFavoriteVenueIds } from "@/hooks/use-favorite-venue-ids";
import { cn } from "@/lib/utils";

function buildBookingPayloads(
  segments: BookingSegment[],
  court: Court,
  ctx: {
    date: string;
    playerName: string;
    playerEmail: string;
    notes: string;
    bookingGroupId: string;
  },
): Partial<Booking>[] {
  return segments.map((seg) => {
    const court_subtotal = segmentTotalCost(court, seg);
    const { booking_fee, total_cost } = splitBookingAmounts(
      court_subtotal,
      undefined,
    );
    return {
      court_id: court.id,
      court_name: court.name,
      sport: court.sport,
      booking_group_id: ctx.bookingGroupId,
      date: ctx.date,
      start_time: seg.start_time,
      end_time: seg.end_time,
      player_name: ctx.playerName,
      player_email: ctx.playerEmail,
      court_subtotal,
      booking_fee,
      total_cost,
      notes: ctx.notes || undefined,
      status: "confirmed" as const,
    };
  });
}

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

const EMPTY_BOOKINGS: Booking[] = [];
const EMPTY_COURT_CLOSURES: CourtClosure[] = [];
const EMPTY_VENUE_CLOSURES: VenueClosure[] = [];

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

  const [selectedDate, setSelectedDate] = useState(new Date());
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [blockedWarningOpen, setBlockedWarningOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);

  const selectedSet = useMemo(() => new Set(selectedSlots), [selectedSlots]);

  useEffect(() => {
    setActiveCourtId(paramCourtId);
  }, [paramCourtId]);

  const { data: courtContext, isLoading } = useQuery({
    queryKey: queryKeys.courts.detail(activeCourtId),
    queryFn: async () => {
      const { data } = await courtlyApi.courts.getWithContext(activeCourtId);
      return data;
    },
    enabled: !!activeCourtId,
    staleTime: 60_000,
  });
  const court = courtContext?.court;
  const establishmentCourts = courtContext?.sibling_courts ?? [];

  const dateIso = format(selectedDate, "yyyy-MM-dd");
  const bookingRealtimeKeys = useMemo(
    () => [queryKeys.availability.courtDay(activeCourtId, dateIso)],
    [activeCourtId, dateIso],
  );
  useBookingsRealtime({
    filter: activeCourtId ? `court_id=eq.${activeCourtId}` : null,
    enabled: !!activeCourtId,
    queryKeysToInvalidate: bookingRealtimeKeys,
  });

  const {
    data: dayAvailability,
    isLoading: isLoadingDayAvailability,
    isFetching: isFetchingDayAvailability,
  } = useQuery({
    queryKey: queryKeys.availability.courtDay(activeCourtId, dateIso),
    queryFn: async () => {
      const { data } = await courtlyApi.courts.availability(activeCourtId, {
        date: dateIso,
      });
      return data;
    },
    enabled: !!activeCourtId,
    staleTime: 20_000,
  });
  const existingBookings = dayAvailability?.bookings ?? EMPTY_BOOKINGS;
  const dayClosures = dayAvailability?.court_closures ?? EMPTY_COURT_CLOSURES;
  const venueDayClosures =
    dayAvailability?.venue_closures ?? EMPTY_VENUE_CLOSURES;
  const isHoursLoading = isLoadingDayAvailability || isFetchingDayAvailability;

  const bookingOccupied = useMemo(
    () => occupiedHourStarts(existingBookings),
    [existingBookings],
  );
  const closureOccupied = useMemo(() => {
    const merged = occupiedHourStartsFromClosures(dayClosures, dateIso);
    for (const token of occupiedHourStartsFromClosures(venueDayClosures, dateIso)) {
      merged.add(token);
    }
    return merged;
  }, [dayClosures, venueDayClosures, dateIso]);
  const occupied = useMemo(() => {
    const merged = new Set<string>();
    for (const t of bookingOccupied) merged.add(t);
    for (const t of closureOccupied) merged.add(t);
    return merged;
  }, [bookingOccupied, closureOccupied]);

  useEffect(() => {
    setSelectedSlots((prev) => {
      const next = prev.filter((t) => !occupied.has(t));
      return next.length === prev.length ? prev : next;
    });
  }, [occupied]);

  const { data: reviewBundle, isLoading: isLoadingReviews } = useQuery({
    queryKey: queryKeys.reviews.venue(court?.venue_id),
    queryFn: async () => {
      const { data: payload } = await courtlyApi.venueReviews.bundle(court!.venue_id);
      if (payload == null) {
        return { court: undefined, reviews: [] as CourtReview[] };
      }
      if (Array.isArray(payload)) {
        return { court: undefined, reviews: payload };
      }
      const reviews = Array.isArray(payload.reviews) ? payload.reviews : [];
      return { ...payload, reviews };
    },
    enabled: !!court?.venue_id,
    staleTime: 60_000,
  });
  const courtReviews = reviewBundle?.reviews ?? [];

  const galleryUrls = useMemo(
    () => (court ? courtGalleryUrls(court) : []),
    [court],
  );

  const segments = useMemo(() => {
    if (selectedSlots.length === 0) return [];
    const runs = groupIntoContiguousHourRuns(selectedSlots);
    const out: BookingSegment[] = [];
    for (const run of runs) {
      const a = run[0]!;
      const b = run[run.length - 1]!;
      const exclEnd = exclusiveEndAfterLastIncludedHour(b);
      out.push(...availableSegmentsInRange(a, exclEnd, occupied));
    }
    return out;
  }, [selectedSlots, occupied]);

  const billableHours = totalBillableHours(segments);
  const requestedHours = selectedSlots.length;
  const blockedInRange = useMemo(() => {
    return selectedSlots
      .filter((t) => occupied.has(t))
      .sort((a, b) => hourFromTime(a) - hourFromTime(b));
  }, [selectedSlots, occupied]);

  const bookableRangesLabel = useMemo(() => {
    if (selectedSlots.length === 0) return null;
    const runs = groupIntoContiguousHourRuns(selectedSlots);
    return runs
      .map((run) => {
        const a = run[0]!;
        const b = run[run.length - 1]!;
        const excl = exclusiveEndAfterLastIncludedHour(b);
        return formatSegmentLine({
          start_time: a,
          end_time: excl,
          hours: run.length,
        });
      })
      .join(" and ");
  }, [selectedSlots]);
  const selectedRateLines = useMemo(() => {
    if (!court || segments.length === 0) return [];

    const hourSlices: Array<{ start: string; end: string; rate: number }> = [];
    for (const segment of segments) {
      const startHour = hourFromTime(segment.start_time);
      const endHour = hourFromTime(segment.end_time);
      for (let hour = startHour; hour < endHour; hour++) {
        const start = formatHourToken(hour);
        const end = formatHourToken(hour + 1);
        hourSlices.push({
          start,
          end,
          rate: hourlyRateForHourStart(court, start),
        });
      }
    }

    const merged: Array<{ start: string; end: string; rate: number }> = [];
    for (const slice of hourSlices) {
      const prev = merged[merged.length - 1];
      if (prev && prev.rate === slice.rate && prev.end === slice.start) {
        prev.end = slice.end;
      } else {
        merged.push({ ...slice });
      }
    }
    return merged;
  }, [court, segments]);

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
        queryKey: queryKeys.reviews.venue(court?.venue_id),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.courts.detail(activeCourtId),
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
        queryKey: queryKeys.reviews.venue(court?.venue_id),
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.reviews.flagged() });
      setFlagReviewId(null);
      setFlagNote("");
      toast.success("Review flagged for platform review");
    },
  });

  const createBookings = useMutation({
    mutationFn: async (payloads: Partial<Booking>[]) => {
      const { data } = await courtlyApi.bookings.createMany(payloads);
      return data.length;
    },
    onSuccess: (count) => {
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
        queryKey: queryKeys.availability.courtDay(activeCourtId, dateIso),
      });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.courts.detail(activeCourtId),
      });
      setBlockedWarningOpen(false);
      setSummaryOpen(false);
      toast.success(
        count > 1
          ? `${count} bookings confirmed for the available time in your range.`
          : "Court booked successfully!",
      );
      router.push("/my-bookings");
    },
    onError: () => {
      toast.error("Could not complete booking. Please try again.");
    },
  });

  const toggleSlotSelection = (time: string) => {
    if (isBookableHourStartInPast(time, selectedDate)) return;
    if (occupied.has(time)) return;
    setSelectedSlots((prev) => {
      const next = new Set(prev);
      if (next.has(time)) {
        next.delete(time);
      } else {
        next.add(time);
      }
      return Array.from(next).sort((a, b) => hourFromTime(a) - hourFromTime(b));
    });
  };

  const courtSubtotal =
    court && segments.length > 0
      ? segmentsTotalCost(court, segments)
      : 0;
  const bookingTotals =
    court && courtSubtotal > 0
      ? splitBookingAmounts(courtSubtotal, undefined)
      : null;

  const runBooking = (toBook: BookingSegment[]) => {
    if (!user || !court) return;
    const displayName = user.full_name?.trim() || user.email;
    const bookingGroupId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `grp-${Date.now()}`;
    const payloads = buildBookingPayloads(toBook, court, {
      date: format(selectedDate, "yyyy-MM-dd"),
      playerName: displayName,
      playerEmail: user.email,
      notes,
      bookingGroupId,
    });
    createBookings.mutate(payloads);
  };

  /** Opens blocked-times warning first when needed, otherwise the booking summary. */
  const openBookingReview = () => {
    if (!user) {
      toast.error("You need to be signed in to book.");
      return;
    }
    if (selectedSlots.length === 0 || !court) {
      toast.error("Choose a date and at least one hour.");
      return;
    }
    if (segments.length === 0) {
      toast.error("No available hours in that range — try a different time.");
      return;
    }
    if (blockedInRange.length > 0) {
      setBlockedWarningOpen(true);
      return;
    }
    setSummaryOpen(true);
  };

  const proceedToSummaryAfterBlockedWarning = () => {
    setBlockedWarningOpen(false);
    setSummaryOpen(true);
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
      <Dialog open={blockedWarningOpen} onOpenChange={setBlockedWarningOpen}>
        <DialogContent className="sm:max-w-md" linkDescription>
          <DialogHeader>
            <DialogTitle className="font-heading">
              Unavailable hours in your range
            </DialogTitle>
            <DialogDescription>
              Some of the times you selected are already booked. You can still
              continue — the next step shows exactly what will be reserved and
              what you&apos;ll pay, only for open hours.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-left text-sm">
            <p className="text-muted-foreground">
              Not available:{" "}
              <span className="font-medium text-foreground">
                {blockedInRange.map(formatBookableHourSlotRange).join(", ")}
              </span>
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setBlockedWarningOpen(false)}
            >
              Go back
            </Button>
            <Button
              type="button"
              className="font-heading font-semibold"
              onClick={proceedToSummaryAfterBlockedWarning}
            >
              Continue to summary
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

      <Dialog open={summaryOpen} onOpenChange={setSummaryOpen}>
        <DialogContent className="max-h-[min(90dvh,36rem)] sm:max-w-md" linkDescription>
          <DialogHeader>
            <DialogTitle className="font-heading">Booking summary</DialogTitle>
            <DialogDescription>
              Review your reservation, then confirm to complete booking.
            </DialogDescription>
          </DialogHeader>
          <dl className="space-y-0 text-sm">
            <div className="grid grid-cols-1 gap-1 border-b border-border/50 py-2 first:pt-0 sm:grid-cols-[minmax(5.5rem,auto)_1fr] sm:items-baseline sm:gap-x-6">
              <dt className="text-muted-foreground">Court</dt>
              <dd className="font-medium leading-snug sm:text-right">
                {court.name}
              </dd>
            </div>
            <div className="grid grid-cols-1 gap-1 border-b border-border/50 py-2 sm:grid-cols-[minmax(5.5rem,auto)_1fr] sm:items-baseline sm:gap-x-6">
              <dt className="text-muted-foreground">Date</dt>
              <dd className="font-medium sm:text-right">
                {format(selectedDate, "MMM d, yyyy")}
              </dd>
            </div>
            {selectedSlots.length > 0 ? (
              <>
                <div className="grid grid-cols-1 gap-1 border-b border-border/50 py-2 sm:grid-cols-[minmax(5.5rem,auto)_1fr] sm:items-start sm:gap-x-6">
                  <dt className="pt-0.5 text-muted-foreground">
                    Selected time/s
                  </dt>
                  <dd className="space-y-1 leading-snug sm:text-right">
                    <span className="block font-medium leading-relaxed">
                      {bookableRangesLabel}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {requestedHours} h in your selection
                    </span>
                  </dd>
                </div>
                {blockedInRange.length > 0 ? (
                  <div className="grid grid-cols-1 gap-1 border-b border-border/50 py-2 sm:grid-cols-[minmax(5.5rem,auto)_1fr] sm:items-start sm:gap-x-6">
                    <dt className="text-muted-foreground">
                      Not booked
                      <span className="mt-0.5 block text-[10px] font-normal leading-tight text-muted-foreground/90">
                        (already taken)
                      </span>
                    </dt>
                    <dd className="text-sm font-medium leading-snug sm:text-right">
                      {blockedInRange.map(formatBookableHourSlotRange).join(", ")}
                    </dd>
                  </div>
                ) : null}
                <div className="grid grid-cols-1 gap-1 border-b border-border/50 py-2 sm:grid-cols-[minmax(5.5rem,auto)_1fr] sm:items-baseline sm:gap-x-6">
                  <dt className="text-muted-foreground">Duration</dt>
                  <dd className="font-medium sm:text-right">
                    {billableHours} billable{" "}
                    {billableHours === 1 ? "hour" : "hours"}
                    {billableHours !== requestedHours ? (
                      <span className="mt-0.5 block text-xs font-normal text-muted-foreground sm:mt-0 sm:ml-1 sm:inline">
                        of {requestedHours} h selected
                      </span>
                    ) : null}
                  </dd>
                </div>
                <div className="grid grid-cols-1 gap-1 border-b border-border/50 py-2 sm:grid-cols-[minmax(5.5rem,auto)_1fr] sm:items-start sm:gap-x-6">
                  <dt className="text-muted-foreground">Rate</dt>
                  <dd className="space-y-1 text-right font-medium">
                    <span className="inline-flex items-center justify-end">
                      {selectedRateLines.length === 1
                        ? `${formatPhpCompact(selectedRateLines[0]!.rate)}/hr`
                        : selectedRateLines.length > 1
                          ? "Multiple rates"
                          : "—"}
                    </span>
                    {selectedRateLines.length > 0 ? (
                      <ul className="ml-auto max-w-48 list-inside list-disc text-xs font-normal text-muted-foreground">
                        {selectedRateLines.map((line) => (
                          <li
                            key={`${line.start}-${line.end}-${line.rate}`}
                          >
                            {formatTimeShort(line.start)}–
                            {formatTimeShort(line.end)}:{" "}
                            {formatPhpCompact(line.rate)}/hr
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </dd>
                </div>
                {notes.trim() ? (
                  <div className="grid grid-cols-1 gap-1 border-b border-border/50 py-2 sm:grid-cols-[minmax(5.5rem,auto)_1fr] sm:items-start sm:gap-x-6">
                    <dt className="text-muted-foreground">Notes</dt>
                    <dd className="whitespace-pre-wrap text-right text-sm leading-snug">
                      {notes.trim()}
                    </dd>
                  </div>
                ) : null}
                {bookingTotals ? (
                  <>
                    <div className="grid grid-cols-1 gap-1 border-b border-border/50 py-2 sm:grid-cols-[minmax(5.5rem,auto)_1fr] sm:items-baseline sm:gap-x-6">
                      <dt className="text-muted-foreground">Court subtotal</dt>
                      <dd className="font-medium sm:text-right">
                        {formatPhp(bookingTotals.court_subtotal)}
                      </dd>
                    </div>
                    <div className="grid grid-cols-1 gap-1 border-b border-border/50 py-2 sm:grid-cols-[minmax(5.5rem,auto)_1fr] sm:items-baseline sm:gap-x-6">
                      <dt className="text-muted-foreground">Booking fee</dt>
                      <dd className="font-medium sm:text-right">
                        {formatPhp(bookingTotals.booking_fee)}
                      </dd>
                    </div>
                  </>
                ) : null}
                <div className="grid grid-cols-1 gap-2 pt-4 sm:grid-cols-[minmax(5.5rem,auto)_1fr] sm:items-baseline sm:gap-x-6">
                  <dt className="font-heading text-base font-bold">You pay</dt>
                  <dd className="font-heading text-xl font-bold text-primary sm:text-right">
                    {formatPhp(bookingTotals?.total_cost ?? 0)}
                  </dd>
                </div>
              </>
            ) : null}
          </dl>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              onClick={() => setSummaryOpen(false)}
            >
              Back
            </Button>
            <Button
              type="button"
              className="font-heading font-semibold"
              onClick={() => runBooking(segments)}
              disabled={createBookings.isPending}
            >
              {createBookings.isPending ? "Booking…" : "Confirm booking"}
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

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-start">
        <div className="order-2 space-y-6 lg:order-1 lg:pr-4">
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

              <div className="space-y-2 border-t border-border/60 pt-4">
                <h3 className="font-heading text-sm font-semibold text-foreground">
                  Player ratings
                </h3>
                {court.review_summary &&
                court.review_summary.review_count > 0 ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <StarRow rating={court.review_summary.average_rating} />
                    <span className="text-sm text-muted-foreground">
                      {court.review_summary.average_rating.toFixed(1)} average ·{" "}
                      {court.review_summary.review_count}{" "}
                      {court.review_summary.review_count === 1
                        ? "review"
                        : "reviews"}
                    </span>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No reviews yet.</p>
                )}
              </div>

              <div className="space-y-3 border-t border-border/60 pt-6">
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

              <div className="space-y-3 border-t border-border/60 pt-6">
                <h3 className="font-heading text-base font-semibold text-foreground">
                  Recent reviews
                </h3>
                {isLoadingReviews ? (
                  <div className="space-y-2">
                    <Skeleton className="h-14 rounded-lg" />
                    <Skeleton className="h-14 rounded-lg" />
                  </div>
                ) : courtReviews.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Be the first to review after a completed visit.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {courtReviews.map((review) => {
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
                                  onClick={() => setConfirmDeleteReviewId(review.id)}
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
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="order-1 space-y-6 lg:order-2">
        {establishmentCourts.length > 0 ? (
          <Card className="border-border/60">
            <CardContent className="p-4">
              <div className="space-y-2">
                <Label>Select court number</Label>
                <Select
                  value={activeCourtId}
                  onValueChange={(nextCourtId) => {
                    if (nextCourtId !== activeCourtId) {
                      setActiveCourtId(nextCourtId);
                      setSelectedSlots([]);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose court" />
                  </SelectTrigger>
                  <SelectContent>
                    {establishmentCourts.map((establishmentCourt) => (
                      <SelectItem key={establishmentCourt.id} value={establishmentCourt.id}>
                        {courtNumberLabel(establishmentCourt)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {establishmentCourts.length > 1
                    ? "This establishment has multiple courts. Choose which court number you want to book."
                    : "Choose which court you want to book at this venue."}
                </p>
              </div>
            </CardContent>
          </Card>
        ) : null}
        <Card className="border-border/50">
          <CardHeader className="pb-2 pt-6">
            <CardTitle className="font-heading text-lg">
              Select Date & Time
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5 px-6 pb-6 pt-0">
            <div>
              <Label className="mb-2 block text-sm font-medium text-foreground">
                Date
              </Label>
              <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  startMonth={startOfMonth(new Date())}
                  onSelect={(d) => {
                    if (!d) return;
                    setSelectedDate(d);
                    setSelectedSlots([]);
                  }}
                  disabled={(date) =>
                    isBefore(startOfDay(date), startOfDay(new Date()))
                  }
                  className="w-full min-w-0"
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="size-2.5 shrink-0 rounded-md bg-accent/70 ring-1 ring-border"
                    aria-hidden
                  />
                  Today
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="size-2.5 shrink-0 rounded-md bg-primary ring-1 ring-primary/30"
                    aria-hidden
                  />
                  Selected
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="size-2.5 shrink-0 rounded-md bg-muted ring-1 border border-dashed border-destructive/40"
                    aria-hidden
                  />
                  Booked
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span
                    className="size-2.5 shrink-0 rounded-md bg-amber-500/25 ring-1 border border-dashed border-amber-600/50"
                    aria-hidden
                  />
                  Blocked (maintenance / event)
                </span>
              </div>
            </div>
            <div className="overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm">
              <div className="border-b border-border/60 bg-muted/30 px-4 py-3 sm:px-5">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-background shadow-sm ring-1 ring-border/80">
                    <Clock className="size-4 text-primary" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <h3
                      id="time-slots-heading"
                      className="text-sm font-semibold text-foreground"
                    >
                      Time slots
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {format(selectedDate, "EEEE, MMM d")}
                    </p>
                  </div>
                </div>
              </div>

              <div className="space-y-4 px-4 py-4 sm:px-5 sm:py-5">
                {selectedSlots.length > 0 ? (
                  <div
                    className="flex items-start gap-3 rounded-xl border border-primary/20 bg-primary/6 px-3.5 py-3 dark:bg-primary/10"
                    role="status"
                    aria-live="polite"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">
                        Selection
                      </p>
                      <p className="font-heading text-base font-bold leading-snug tracking-tight text-foreground">
                        {bookableRangesLabel}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {requestedHours}{" "}
                        {requestedHours === 1 ? "hour" : "hours"} selected
                        {billableHours !== requestedHours
                          ? ` · ${billableHours} billable`
                          : null}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-9 shrink-0 text-muted-foreground hover:text-foreground"
                      onClick={() => setSelectedSlots([])}
                      aria-label="Clear time selection"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                ) : null}

                <details className="group rounded-xl border border-border/60 bg-muted/20 [&_summary::-webkit-details-marker]:hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium text-foreground hover:bg-muted/40 sm:px-3.5">
                    <span>Pricing, blocked hours &amp; past times</span>
                    <ChevronRight
                      className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-90"
                      aria-hidden
                    />
                  </summary>
                  <div className="space-y-2 border-t border-border/50 px-3 py-3 text-xs leading-relaxed text-muted-foreground sm:px-3.5">
                    <p>
                      Tap a tile to select that hour; tap again to deselect.
                      Booked, blocked, or past hours can&apos;t be toggled.
                      Separate stretches of hours become separate bookings when
                      needed. You only pay for open hours—we&apos;ll confirm before
                      you pay.
                    </p>
                    {isSameDay(startOfDay(selectedDate), startOfDay(new Date())) ? (
                      <p>Hours that have already started today cannot be selected.</p>
                    ) : null}
                  </div>
                </details>

                {isHoursLoading ? (
                  <div className="space-y-3">
                    <p className="text-xs text-muted-foreground">
                      Loading hours…
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {Array.from({ length: 8 }, (_, i) => (
                        <Skeleton key={i} className="h-18 rounded-xl" />
                      ))}
                    </div>
                  </div>
                ) : timeSlots.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No bookable hours are configured for this venue yet.
                  </p>
                ) : null}

                {!isHoursLoading && timeSlots.length > 0 ? (
                  <div>
                    <div
                      className="max-h-[min(50vh,24rem)] overflow-y-auto overflow-x-hidden rounded-xl px-2 pb-2 pt-1 [scrollbar-gutter:stable] sm:px-3 sm:pb-3"
                      aria-labelledby="time-slots-heading"
                      role="group"
                    >
                      <div className="grid grid-cols-2 gap-3 py-1">
                        {timeSlots.map((time) => {
                          const isUnavailable = occupied.has(time);
                          const isPastHour = isBookableHourStartInPast(
                            time,
                            selectedDate,
                          );
                          const hourlyRate = hourlyRateForHourStart(court, time);
                          const fromClosureOnly =
                            closureOccupied.has(time) &&
                            !bookingOccupied.has(time);
                          const isSelected = selectedSet.has(time);
                          const disabled = isPastHour || isUnavailable;
                          return (
                            <Button
                              key={time}
                              type="button"
                              variant="outline"
                              disabled={disabled}
                              aria-pressed={isSelected && !isUnavailable}
                              onClick={() => toggleSlotSelection(time)}
                              className={cn(
                                "h-auto min-h-18 w-full flex-col items-stretch justify-center gap-1.5 rounded-xl border-2 px-3 py-2.5 text-left shadow-none transition-colors",
                                "focus-visible:ring-2 focus-visible:ring-emerald-500/80 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                                isPastHour &&
                                  "cursor-not-allowed border-dashed border-muted-foreground/30 bg-muted/40 text-muted-foreground opacity-60",
                                isUnavailable &&
                                  fromClosureOnly &&
                                  "border-amber-600/50 bg-amber-500/12 text-amber-950 line-through decoration-amber-800/60 dark:text-amber-100 dark:decoration-amber-200/50",
                                isUnavailable &&
                                  !fromClosureOnly &&
                                  "border-destructive/45 bg-destructive/8 text-destructive line-through",
                                isSelected &&
                                  !isUnavailable &&
                                  "border-emerald-600 bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-500/90 ring-offset-2 ring-offset-background hover:border-emerald-700 hover:bg-emerald-700 dark:border-emerald-500 dark:bg-emerald-600 dark:hover:border-emerald-600 dark:hover:bg-emerald-700",
                                !disabled &&
                                  !isSelected &&
                                  "hover:border-emerald-500/55 hover:bg-emerald-50/95 dark:hover:border-emerald-600/50 dark:hover:bg-emerald-950/45",
                              )}
                            >
                              <span
                                className={cn(
                                  "min-w-0 text-sm font-semibold leading-tight tracking-tight",
                                  isSelected &&
                                    !isUnavailable &&
                                    "text-white",
                                )}
                              >
                                {formatBookableHourSlotRange(time)}
                              </span>
                              <span
                                className={cn(
                                  "text-xs font-medium tabular-nums",
                                  isSelected && !isUnavailable
                                    ? "text-emerald-50"
                                    : "text-muted-foreground",
                                )}
                              >
                                {hourlyRate > 0
                                  ? `${formatPhpCompact(hourlyRate)}/hr`
                                  : "—"}
                              </span>
                            </Button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 border-t border-border/50 pt-3 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="size-2.5 shrink-0 rounded-md bg-muted ring-1 border border-dashed border-destructive/40"
                          aria-hidden
                        />
                        Booked
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="size-2.5 shrink-0 rounded-md bg-amber-500/25 ring-1 border border-dashed border-amber-600/50"
                          aria-hidden
                        />
                        Blocked
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="size-2.5 shrink-0 rounded-md bg-emerald-600 ring-1 ring-emerald-500/50"
                          aria-hidden
                        />
                        Selected
                      </span>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
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

          <Button
            className="w-full font-heading font-semibold shadow-lg shadow-primary/20"
            size="lg"
            onClick={openBookingReview}
            disabled={
              !user ||
              selectedSlots.length === 0 ||
              segments.length === 0 ||
              createBookings.isPending
            }
          >
            Review booking
          </Button>
        </div>
      </div>
    </div>
  );
}

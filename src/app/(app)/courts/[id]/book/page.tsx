"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format, isBefore, startOfDay, startOfMonth } from "date-fns";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Heart,
  MapPin,
  Star,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
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
import {
  segmentTotalCost,
  segmentsTotalCost,
  formatCourtRateSummary,
} from "@/lib/court-pricing";
import {
  splitBookingAmounts,
} from "@/lib/platform-fee";
import { useAuth } from "@/lib/auth/auth-context";
import {
  availableSegmentsInRange,
  bookedHoursInSelection,
  formatSegmentLine,
  formatTimeShort,
  hourFromTime,
  occupiedHourStarts,
  occupiedHourStartsFromClosures,
  selectionCoversBookedSlots,
  totalBillableHours,
  type BookingSegment,
} from "@/lib/booking-range";
import { formatPhp, formatPhpCompact } from "@/lib/format-currency";
import { formatAmenityLabel } from "@/lib/format-amenity";
import { canCourtVenueAdminFlagReview, isSuperadmin } from "@/lib/auth/management";
import type { Booking, Court } from "@/lib/types/courtly";
import { formatStatusLabel } from "@/lib/utils";
import { useFavoriteCourtIds } from "@/hooks/use-favorite-court-ids";
import { cn } from "@/lib/utils";

const DEFAULT_SLOT_OPEN = 6;
const DEFAULT_SLOT_CLOSE = 22;

/** Hourly start times from venue open → last slot before close (e.g. 07:00–22:00 → 07..21). */
function timeSlotsFromVenueHours(open: string, close: string): string[] {
  const oh = Number.parseInt(open.split(":")[0] ?? "", 10);
  const ch = Number.parseInt(close.split(":")[0] ?? "", 10);
  const start = Number.isFinite(oh) ? oh : DEFAULT_SLOT_OPEN;
  const end = Number.isFinite(ch) ? ch : DEFAULT_SLOT_CLOSE;
  if (start >= end) {
    return Array.from({ length: DEFAULT_SLOT_CLOSE - DEFAULT_SLOT_OPEN }, (_, i) => {
      const h = DEFAULT_SLOT_OPEN + i;
      return `${String(h).padStart(2, "0")}:00`;
    });
  }
  const slots: string[] = [];
  for (let h = start; h < end; h++) {
    slots.push(`${String(h).padStart(2, "0")}:00`);
  }
  return slots;
}

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
      court.booking_fee,
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
  const courtId = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toggleFavorite, isFavorite } = useFavoriteCourtIds();

  const [selectedDate, setSelectedDate] = useState(addDays(new Date(), 1));
  const [startTime, setStartTime] = useState<string | null>(null);
  const [endTime, setEndTime] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [blockedWarningOpen, setBlockedWarningOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);

  const { data: court, isLoading } = useQuery({
    queryKey: ["court", courtId],
    queryFn: async () => {
      const { data } = await courtlyApi.courts.get(courtId);
      return data;
    },
    enabled: !!courtId,
  });

  const { data: establishmentCourts = [] } = useQuery({
    queryKey: ["establishment-courts", court?.court_account_id, court?.sport],
    queryFn: async () => {
      const { data } = await courtlyApi.courts.list({
        status: "active",
        sport: court!.sport,
      });
      if (!court?.court_account_id) return [court!];
      return data
        .filter((c) => c.court_account_id === court.court_account_id)
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    enabled: !!court,
  });

  const dateIso = format(selectedDate, "yyyy-MM-dd");

  const { data: existingBookings = [] } = useQuery({
    queryKey: ["bookings-for-court", courtId, dateIso],
    queryFn: async () => {
      const { data } = await courtlyApi.bookings.list({
        court_id: courtId,
        date: dateIso,
      });
      return data.filter((b) => b.status === "confirmed");
    },
    enabled: !!courtId && !!selectedDate,
  });

  const { data: dayClosures = [] } = useQuery({
    queryKey: ["court-closures", courtId, dateIso],
    queryFn: async () => {
      const { data } = await courtlyApi.courtClosures.list(courtId, {
        date: dateIso,
      });
      return data;
    },
    enabled: !!courtId,
  });

  const bookingOccupied = useMemo(
    () => occupiedHourStarts(existingBookings),
    [existingBookings],
  );
  const closureOccupied = useMemo(
    () => occupiedHourStartsFromClosures(dayClosures, dateIso),
    [dayClosures, dateIso],
  );
  const occupied = useMemo(() => {
    const merged = new Set<string>();
    for (const t of bookingOccupied) merged.add(t);
    for (const t of closureOccupied) merged.add(t);
    return merged;
  }, [bookingOccupied, closureOccupied]);

  const { data: courtReviews = [] } = useQuery({
    queryKey: ["court-reviews", courtId],
    queryFn: async () => {
      const { data: payload } = await courtlyApi.courtReviews.bundle(courtId);
      if (payload == null) return [];
      if (Array.isArray(payload)) return payload;
      if (Array.isArray(payload.reviews)) return payload.reviews;
      return [];
    },
    enabled: !!courtId,
  });

  const galleryUrls = useMemo(
    () => (court ? courtGalleryUrls(court) : []),
    [court],
  );

  const segments = useMemo(() => {
    if (!startTime || !endTime) return [];
    return availableSegmentsInRange(startTime, endTime, occupied);
  }, [startTime, endTime, occupied]);

  const billableHours = totalBillableHours(segments);
  const requestedHours =
    startTime && endTime
      ? hourFromTime(endTime) - hourFromTime(startTime)
      : 0;
  const blockedInRange = useMemo(() => {
    if (!startTime || !endTime) return [];
    return bookedHoursInSelection(startTime, endTime, occupied);
  }, [startTime, endTime, occupied]);

  const [flagReviewId, setFlagReviewId] = useState<string | null>(null);
  const [flagNote, setFlagNote] = useState("");
  const [confirmDeleteReviewId, setConfirmDeleteReviewId] = useState<string | null>(null);

  const deleteReviewMut = useMutation({
    mutationFn: async (reviewId: string) => {
      await courtlyApi.courtReviews.remove(courtId, reviewId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["court-reviews", courtId] });
      void queryClient.invalidateQueries({ queryKey: ["court", courtId] });
      void queryClient.invalidateQueries({ queryKey: ["courts"] });
      toast.success("Review removed");
    },
  });

  const flagReviewMut = useMutation({
    mutationFn: async (p: { reviewId: string; reason: string }) => {
      await courtlyApi.courtReviews.flag(courtId, p.reviewId, {
        reason: p.reason || undefined,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["court-reviews", courtId] });
      void queryClient.invalidateQueries({ queryKey: ["flagged-reviews"] });
      setFlagReviewId(null);
      setFlagNote("");
      toast.success("Review flagged for platform review");
    },
  });

  const createBookings = useMutation({
    mutationFn: async (payloads: Partial<Booking>[]) => {
      for (const p of payloads) {
        await courtlyApi.bookings.create(p);
      }
      return payloads.length;
    },
    onSuccess: (count) => {
      void queryClient.invalidateQueries({ queryKey: ["bookings"] });
      void queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
      void queryClient.invalidateQueries({
        queryKey: ["bookings-for-court", courtId],
      });
      void queryClient.invalidateQueries({ queryKey: ["courts"] });
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

  const handleTimeSelect = (time: string) => {
    if (!startTime || (startTime && endTime)) {
      if (occupied.has(time)) return;
      setStartTime(time);
      setEndTime(null);
    } else if (time > startTime) {
      setEndTime(time);
    } else {
      if (occupied.has(time)) return;
      setStartTime(time);
      setEndTime(null);
    }
  };

  const courtSubtotal =
    court && segments.length > 0
      ? segmentsTotalCost(court, segments)
      : 0;
  const bookingTotals =
    court && courtSubtotal > 0
      ? splitBookingAmounts(courtSubtotal, court.booking_fee)
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
    if (!startTime || !endTime || !court) {
      toast.error("Choose a date, start time, and end time.");
      return;
    }
    if (segments.length === 0) {
      toast.error("No available hours in that range — try a different time.");
      return;
    }
    if (selectionCoversBookedSlots(startTime, endTime, occupied)) {
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
    ? timeSlotsFromVenueHours(
        court.available_hours?.open ?? "07:00",
        court.available_hours?.close ?? "22:00",
      )
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

  const pickingEnd = Boolean(startTime && !endTime);
  const bookableRangesLabel =
    segments.length > 0
      ? segments.map(formatSegmentLine).join(" and ")
      : null;

  const hasMapPin =
    court.map_latitude != null &&
    court.map_longitude != null &&
    Number.isFinite(court.map_latitude) &&
    Number.isFinite(court.map_longitude);
  const mapLat = court.map_latitude ?? 0;
  const mapLon = court.map_longitude ?? 0;
  const mapBboxPad = 0.018;
  const mapEmbedSrc = hasMapPin
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${mapLon - mapBboxPad},${mapLat - mapBboxPad},${mapLon + mapBboxPad},${mapLat + mapBboxPad}&layer=mapnik`
    : null;
  /** Full map in browser: Google Maps. Embedded iframe above stays OpenStreetMap. */
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
        <DialogContent className="sm:max-w-md">
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
                {blockedInRange.map(formatTimeShort).join(", ")}
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
        <DialogContent className="sm:max-w-md">
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
        <DialogContent className="max-h-[min(90dvh,36rem)] sm:max-w-md">
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
            {startTime && endTime ? (
              <>
                <div className="grid grid-cols-1 gap-1 border-b border-border/50 py-2 sm:grid-cols-[minmax(5.5rem,auto)_1fr] sm:items-start sm:gap-x-6">
                  <dt className="pt-0.5 text-muted-foreground">
                    Requested range
                  </dt>
                  <dd className="space-y-1 leading-snug sm:text-right">
                    <span className="block font-medium">
                      {formatTimeShort(startTime)} – {formatTimeShort(endTime)}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {requestedHours} h in your selection
                    </span>
                  </dd>
                </div>
                <div className="grid grid-cols-1 gap-1 border-b border-border/50 py-2 sm:grid-cols-[minmax(5.5rem,auto)_1fr] sm:items-start sm:gap-x-6">
                  <dt className="pt-0.5 text-muted-foreground">
                    Bookable time
                  </dt>
                  <dd className="font-medium leading-relaxed sm:text-right">
                    {bookableRangesLabel ??
                      `${formatTimeShort(startTime)} – ${formatTimeShort(endTime)}`}
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
                      {blockedInRange.map(formatTimeShort).join(", ")}
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
                      {formatCourtRateSummary(court)}
                    </span>
                    {(court.hourly_rate_windows?.length ?? 0) > 0 ? (
                      <ul className="ml-auto max-w-48 list-inside list-disc text-xs font-normal text-muted-foreground">
                        {court.hourly_rate_windows!.map((w) => (
                          <li key={`${w.start}-${w.end}-${w.hourly_rate}`}>
                            {formatTimeShort(w.start)}–{formatTimeShort(w.end)}:{" "}
                            {formatPhpCompact(w.hourly_rate)}/hr
                          </li>
                        ))}
                        <li>
                          Other hours: {formatPhpCompact(court.hourly_rate)}/hr
                        </li>
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
        <div className="space-y-6 lg:pr-4">
          <CourtGalleryCarousel
            key={galleryUrls.join("|")}
            urls={galleryUrls}
            name={court.name}
          />

          <PageHeader
            title={`Book ${court.establishment_name ?? court.name}`}
            subtitle={`${courtNumberLabel(court)} · ${court.location}`}
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
                <div>
                  <dt className="text-muted-foreground">Hours</dt>
                  <dd className="mt-0.5 font-medium text-foreground">
                    {court.available_hours.open} – {court.available_hours.close}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Rate</dt>
                  <dd className="mt-0.5 font-medium text-foreground">
                    {formatCourtRateSummary(court)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Contact</dt>
                  <dd className="mt-0.5 font-medium text-foreground">
                    {court.contact_phone ?? "—"}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="mb-2 text-muted-foreground">Amenities</dt>
                  <dd className="flex flex-wrap gap-1.5">
                    {court.amenities?.length ? (
                      court.amenities.map((a) => (
                        <Badge
                          key={a}
                          variant="outline"
                          className="font-normal"
                        >
                          {formatAmenityLabel(a)}
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
                <h3 className="flex items-center gap-2 font-heading text-base font-semibold text-foreground">
                  <MapPin className="h-4 w-4 text-primary" aria-hidden />
                  {hasMapPin ? "Map pin" : "Location"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  {hasMapPin
                    ? "Pinned location for this venue. Open the map to zoom or get directions."
                    : "Search this address in your maps app."}
                </p>
                <div className="overflow-hidden rounded-2xl border border-border">
                  <iframe
                    title={`Map — ${court.name}`}
                      src={mapEmbedSrc ?? undefined}
                    className="aspect-16/10 w-full max-h-64 border-0"
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
                <div className="flex flex-wrap gap-3">
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
              </div>

              <div className="space-y-3 border-t border-border/60 pt-6">
                <h3 className="font-heading text-base font-semibold text-foreground">
                  Recent reviews
                </h3>
                {courtReviews.length === 0 ? (
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

        <div className="space-y-6">
        {establishmentCourts.length > 1 ? (
          <Card className="border-border/60">
            <CardContent className="p-4">
              <div className="space-y-2">
                <Label>Select court number</Label>
                <Select
                  value={court.id}
                  onValueChange={(nextCourtId) => {
                    if (nextCourtId !== court.id) {
                      router.push(`/courts/${nextCourtId}/book`);
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Choose court" />
                  </SelectTrigger>
                  <SelectContent>
                    {establishmentCourts.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {courtNumberLabel(c)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  This establishment has multiple courts. Choose which court number you want to book.
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
                    setStartTime(null);
                    setEndTime(null);
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
            <div className="rounded-xl border border-border/40 bg-muted/20 px-3 py-3.5 sm:px-4 sm:py-4">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                <Label className="text-sm font-medium text-foreground">
                  Time on {format(selectedDate, "EEE, MMM d")}
                </Label>
                <span className="text-xs text-muted-foreground">
                  Tap start, then end
                </span>
              </div>
              <p className="mb-4 text-xs leading-snug text-muted-foreground">
                Only hours within{" "}
                <span className="font-medium text-foreground">
                  {court.available_hours.open} – {court.available_hours.close}
                </span>{" "}
                are shown. Your range can span unavailable hours — you&apos;ll
                only pay for free hours (we&apos;ll confirm if anything is
                blocked).
              </p>
              <div className="max-h-[min(52vh,22rem)] overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]">
                <div className="grid grid-cols-3 gap-2 px-0.5 pb-1 pt-1 sm:grid-cols-4 md:grid-cols-5">
                  {timeSlots.map((time) => {
                    const isUnavailable = occupied.has(time);
                    const fromClosureOnly =
                      closureOccupied.has(time) && !bookingOccupied.has(time);
                    const isStart = startTime === time;
                    const isEnd = endTime === time;
                    const isInRange =
                      Boolean(startTime) &&
                      Boolean(endTime) &&
                      time > startTime! &&
                      time < endTime!;
                    const showMarker = isStart || (isEnd && !isStart);
                    return (
                      <Button
                        key={time}
                        type="button"
                        size="sm"
                        variant={
                          isStart || isEnd
                            ? "default"
                            : isInRange
                              ? isUnavailable
                                ? "outline"
                                : "secondary"
                              : "outline"
                        }
                        disabled={isUnavailable && !pickingEnd}
                        onClick={() => handleTimeSelect(time)}
                        className={cn(
                          "relative flex items-center justify-center px-1.5 text-sm font-medium tabular-nums",
                          showMarker
                            ? "min-h-11 flex-col gap-0.5 py-1"
                            : "h-10 shrink-0",
                          isUnavailable &&
                            fromClosureOnly &&
                            "border-amber-600/45 bg-amber-500/15 text-amber-950 line-through dark:text-amber-100",
                          isUnavailable &&
                            !fromClosureOnly &&
                            "border-destructive/50 bg-destructive/10 text-destructive line-through",
                          isUnavailable && isInRange && "opacity-90",
                          isStart &&
                            "ring-2 ring-primary ring-offset-1 ring-offset-background",
                          isEnd &&
                            !isStart &&
                            "ring-2 ring-chart-3 ring-offset-1 ring-offset-background",
                        )}
                      >
                        {isStart ? (
                          <span className="text-[7px] font-bold uppercase leading-none tracking-wide text-primary-foreground/95">
                            Start
                          </span>
                        ) : null}
                        {isEnd && !isStart ? (
                          <span className="text-[7px] font-bold uppercase leading-none tracking-wide text-amber-100">
                            End
                          </span>
                        ) : null}
                        <span>{time}</span>
                      </Button>
                    );
                  })}
                </div>
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
                    href={`/login?next=${encodeURIComponent(`/courts/${courtId}/book`)}`}
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
              !startTime ||
              !endTime ||
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

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowLeft,
  Calendar,
  Clock,
  PhilippinePeso,
  ExternalLink,
  MapPin,
  X,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo } from "react";
import { toast } from "sonner";
import PageHeader from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { courtlyApi } from "@/lib/api/courtly-client";
import { formatPhp } from "@/lib/format-currency";
import {
  bookingDurationHours,
  formatTimeShort,
} from "@/lib/booking-range";
import { formatAmenityLabel } from "@/lib/format-amenity";
import { useAuth } from "@/lib/auth/auth-context";
import type { Booking } from "@/lib/types/courtly";
import { formatStatusLabel } from "@/lib/utils";

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

  const cancelBooking = useMutation({
    mutationFn: async (id: string) => {
      await courtlyApi.bookings.update(id, { status: "cancelled" });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["booking", bookingId] });
      void queryClient.invalidateQueries({
        queryKey: ["booking-group", booking?.booking_group_id],
      });
      void queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
      toast.success("Reservation cancelled");
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
  const directionsHref = court
    ? hasMapPin
      ? `https://www.google.com/maps/dir/?api=1&destination=${mapLat},${mapLon}`
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
                          <span className="inline-flex items-center gap-0.5 text-sm font-semibold text-foreground">
                            <PhilippinePeso className="h-3.5 w-3.5 text-muted-foreground" />
                            {formatPhp(s.total_cost ?? 0)}
                          </span>
                        </div>
                      </div>
                      {s.status === "confirmed" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="shrink-0 border-destructive/20 text-destructive hover:bg-destructive/5 hover:text-destructive"
                          onClick={() => cancelBooking.mutate(s.id)}
                          disabled={cancelBooking.isPending}
                        >
                          <X className="mr-1 h-3.5 w-3.5" /> Cancel this time
                        </Button>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>

            <div className="flex items-center justify-between border-t border-border/60 pt-4 text-sm">
              <span className="font-medium text-muted-foreground">Total</span>
              <span className="inline-flex items-center gap-0.5 font-heading text-lg font-bold text-primary">
                <PhilippinePeso className="h-4 w-4" />
                {formatPhp(sessionTotal)}
              </span>
            </div>

            {combinedNote ? (
              <div className="border-t border-border/60 pt-4">
                <p className="mb-1 text-sm text-muted-foreground">Your notes</p>
                <p className="whitespace-pre-wrap text-sm text-foreground">
                  {combinedNote}
                </p>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {court ? (
          <Card className="border-border/50">
            <CardContent className="space-y-4 p-6">
              <h2 className="font-heading text-lg font-semibold text-foreground">
                Venue
              </h2>
              <div className="space-y-1 text-sm">
                <p className="font-medium text-foreground">{court.name}</p>
                <p className="flex items-start gap-2 text-muted-foreground">
                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {court.location}
                </p>
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
                <iframe
                  title={`Map — ${court.name}`}
                  src={mapEmbedSrc}
                  className="aspect-video w-full max-h-56 rounded-xl border border-border"
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
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
                <Button variant="outline" size="sm" asChild>
                  <a
                    href={directionsHref}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Directions
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

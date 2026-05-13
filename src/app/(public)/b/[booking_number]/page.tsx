"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { format } from "date-fns";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle,
  Clock,
  ExternalLink,
  MapPin,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPhp } from "@/lib/format-currency";
import { formatTimeShort } from "@/lib/booking-range";
import { BookingStatusStepper } from "@/components/booking/BookingStatusStepper";

type PublicBookingDetail = {
  booking_number: string;
  court_name: string | null;
  establishment_name: string | null;
  sport: string | null;
  date: string;
  start_time: string;
  end_time: string;
  slots: { start_time: string; end_time: string }[];
  status: string;
  player_name: string | null;
  player_email: string | null;
  total_cost: number | null;
  created_at: string | null;
  location: string | null;
  contact_phone: string | null;
  facebook_url: string | null;
  instagram_url: string | null;
  map_latitude: number | null;
  map_longitude: number | null;
};

export default function PublicBookingStatusPage() {
  const params = useParams<{ booking_number: string }>();
  const searchParams = useSearchParams();
  const bookingNumber = params.booking_number.toUpperCase();

  const [booking, setBooking] = useState<PublicBookingDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [registerDialogOpen, setRegisterDialogOpen] = useState(false);
  const dialogTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const prefillFirstName = searchParams.get("fn") ?? "";
  const prefillLastName = searchParams.get("ln") ?? "";
  const prefillEmail = searchParams.get("em") ?? "";
  const prefillPhone = searchParams.get("ph") ?? "";

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    fetch(`/api/public/b/${encodeURIComponent(bookingNumber)}`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          const json = (await res.json()) as { error?: string };
          setError(json.error ?? "Booking not found.");
          return;
        }
        const data = (await res.json()) as PublicBookingDetail;
        setBooking(data);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load booking details.");
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bookingNumber]);

  useEffect(() => {
    if (!booking) return;
    dialogTimerRef.current = setTimeout(() => {
      setRegisterDialogOpen(true);
    }, 2000);
    return () => {
      if (dialogTimerRef.current) clearTimeout(dialogTimerRef.current);
    };
  }, [booking]);

  const dismissRegisterDialog = () => {
    setRegisterDialogOpen(false);
  };

  const buildRegisterUrl = () => {
    const email = prefillEmail || booking?.player_email || "";
    const [rawFirst, ...rest] = (booking?.player_name ?? "").split(" ");
    const first = prefillFirstName || rawFirst || "";
    const last = prefillLastName || rest.join(" ") || "";
    const phone = prefillPhone;
    const sp = new URLSearchParams({ register: "1" });
    if (email) sp.set("email", email);
    if (first) sp.set("first_name", first);
    if (last) sp.set("last_name", last);
    if (phone) sp.set("phone", phone);
    return `/login?${sp.toString()}`;
  };

  const hasMapPin =
    booking &&
    booking.map_latitude != null &&
    booking.map_longitude != null &&
    Number.isFinite(booking.map_latitude) &&
    Number.isFinite(booking.map_longitude);

  const mapOpenHref =
    booking
      ? hasMapPin
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${booking.map_latitude},${booking.map_longitude}`)}`
        : booking.location
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(booking.location)}`
          : null
      : null;

  return (
    <div className="mx-auto max-w-lg px-4 py-8 sm:px-6">
      <Dialog open={registerDialogOpen} onOpenChange={(o) => { if (!o) dismissRegisterDialog(); }}>
        <DialogContent className="sm:max-w-md" linkDescription>
          <DialogHeader>
            <DialogTitle className="font-heading text-xl">Want to track your bookings?</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 pt-1 text-sm text-foreground/80">
                <p>Create a free account and unlock:</p>
                <ul className="space-y-2 pl-1">
                  {[
                    "See all your bookings — past and upcoming — in one place",
                    "Get notified when your booking is confirmed or updated",
                    "Join open play sessions and tournaments",
                    "Manage cancellations and leave reviews after your visit",
                  ].map((benefit) => (
                    <li key={benefit} className="flex items-start gap-2">
                      <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <span>{benefit}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="ghost" onClick={dismissRegisterDialog}>
              Maybe later
            </Button>
            <Button
              type="button"
              className="font-heading font-semibold"
              onClick={() => {
                dismissRegisterDialog();
                window.open(buildRegisterUrl(), "_blank");
              }}
            >
              Create account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Button
        variant="ghost"
        size="sm"
        className="mb-6 -ml-2 text-muted-foreground"
        asChild
      >
        <Link href="/book">
          <ArrowLeft className="mr-2 h-4 w-4" /> Browse courts
        </Link>
      </Button>

      {isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      ) : error ? (
        <Card className="border-border/50">
          <CardContent className="py-10 text-center">
            <XCircle className="mx-auto mb-3 h-10 w-10 text-destructive/60" />
            <p className="font-heading text-lg font-semibold">Booking not found</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" className="mt-4" asChild>
              <Link href="/book">Browse courts</Link>
            </Button>
          </CardContent>
        </Card>
      ) : booking ? (
        <div className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Booking reference
            </p>
            <p className="font-heading text-2xl font-bold tracking-tight text-foreground">
              {booking.booking_number}
            </p>
          </div>

          <Card className="border-border/50">
            <CardHeader className="pb-3">
              <CardTitle className="font-heading text-base">Booking status</CardTitle>
            </CardHeader>
            <CardContent className="px-6 pb-6">
              <BookingStatusStepper status={booking.status} />
            </CardContent>
          </Card>

          <Card className="border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="font-heading text-base">Booking details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-start gap-2">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div>
                  <p className="font-medium text-foreground">
                    {booking.establishment_name ?? booking.court_name}
                  </p>
                  {booking.establishment_name ? (
                    <p className="text-muted-foreground">{booking.court_name}</p>
                  ) : null}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 shrink-0 text-primary" />
                <p className="text-foreground">
                  {format(new Date(`${booking.date}T12:00:00`), "EEE, MMM d, yyyy")}
                </p>
              </div>
              <div className="flex items-start gap-2">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <div className="flex flex-wrap gap-1.5">
                  {(booking.slots.length > 0 ? booking.slots : [{ start_time: booking.start_time, end_time: booking.end_time }]).map((slot, i) => (
                    <span
                      key={i}
                      className="inline-flex items-center rounded-md border border-border/60 bg-muted/30 px-2 py-0.5 text-xs font-medium text-foreground"
                    >
                      {formatTimeShort(slot.start_time)} – {formatTimeShort(slot.end_time)}
                    </span>
                  ))}
                </div>
              </div>
              {booking.total_cost != null ? (
                <div className="border-t border-border/60 pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Total</span>
                    <span className="font-heading font-bold text-primary">
                      {formatPhp(booking.total_cost)}
                    </span>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {(booking.location || booking.contact_phone || booking.facebook_url || booking.instagram_url) ? (
            <Card className="border-border/50">
              <CardContent className="space-y-5 p-6">
                <h2 className="font-heading text-base font-semibold text-foreground">
                  Venue
                </h2>
                <div className="rounded-xl border border-border/60 bg-muted/10 p-4">
                  <p className="text-base font-semibold text-foreground">
                    {booking.establishment_name ?? booking.court_name ?? "—"}
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {booking.location ? (
                    <div className="space-y-3 rounded-xl border border-border/60 p-4 text-sm">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Location
                      </p>
                      <div className="space-y-3">
                        <p className="flex items-start gap-2 text-foreground">
                          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="min-w-0">{booking.location}</span>
                        </p>
                        {mapOpenHref ? (
                          <Button variant="outline" size="sm" className="w-fit" asChild>
                            <a href={mapOpenHref} target="_blank" rel="noopener noreferrer">
                              Open in Map
                              <ExternalLink className="ml-1.5 h-3 w-3 opacity-70" />
                            </a>
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                  {(booking.contact_phone || booking.facebook_url || booking.instagram_url) ? (
                    <div className="space-y-3 rounded-xl border border-border/60 p-4 text-sm">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Contact
                      </p>
                      {booking.contact_phone ? (
                        <p className="font-medium text-foreground">{booking.contact_phone}</p>
                      ) : null}
                      {(booking.facebook_url || booking.instagram_url) ? (
                        <div className="flex flex-wrap gap-2 pt-0.5">
                          {booking.facebook_url ? (
                            <a
                              href={booking.facebook_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-muted/20 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-muted/40 hover:underline"
                            >
                              Facebook <ExternalLink className="h-3 w-3" />
                            </a>
                          ) : null}
                          {booking.instagram_url ? (
                            <a
                              href={booking.instagram_url}
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
                  ) : null}
                </div>
              </CardContent>
            </Card>
          ) : null}

          {booking.player_email ? (
            <p className="text-center text-xs text-muted-foreground">
              Booking updates will be sent to{" "}
              <span className="font-medium text-foreground">{booking.player_email}</span>
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Calendar,
  Clock,
  PhilippinePeso,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import EmptyState from "@/components/shared/EmptyState";
import PageHeader from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { courtlyApi } from "@/lib/api/courtly-client";
import { formatPhp } from "@/lib/format-currency";
import {
  bookingDurationHours,
  formatTimeShort,
} from "@/lib/booking-range";
import { useAuth } from "@/lib/auth/auth-context";
import { useSelectedSport } from "@/lib/stores/selected-sport";
import type { Booking } from "@/lib/types/courtly";
import { formatStatusLabel } from "@/lib/utils";

const statusStyles: Record<string, string> = {
  confirmed: "bg-primary/10 text-primary border-primary/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
  completed: "bg-muted text-muted-foreground border-border",
  registered: "bg-primary/10 text-primary border-primary/20",
  waitlisted: "bg-chart-3/15 text-chart-3 border-chart-3/30",
};

type CourtDateGroup = {
  key: string;
  courtName: string;
  date: string;
  items: Booking[];
  /** Use for /my-bookings/[id] so split segments open one combined detail. */
  detailBookingId: string;
};

function groupCourtBookings(list: Booking[]): CourtDateGroup[] {
  const map = new Map<string, Booking[]>();
  for (const b of list) {
    const key = b.booking_group_id
      ? `grp:${b.booking_group_id}`
      : `day:${b.court_id}\0${b.date}`;
    const arr = map.get(key);
    if (arr) arr.push(b);
    else map.set(key, [b]);
  }
  const groups: CourtDateGroup[] = [];
  for (const [key, items] of map) {
    items.sort((a, c) => a.start_time.localeCompare(c.start_time));
    const first = items[0];
    groups.push({
      key,
      courtName: first?.court_name ?? "Court",
      date: first?.date ?? "",
      items,
      detailBookingId: first?.id ?? "",
    });
  }
  groups.sort((a, b) => {
    const byDate = b.date.localeCompare(a.date);
    if (byDate !== 0) return byDate;
    return a.courtName.localeCompare(b.courtName);
  });
  return groups;
}

export default function MyBookingsPage() {
  const [tab, setTab] = useState("bookings");
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const selectedSport = useSelectedSport((s) => s.sport);

  const { data: bookings = [], isLoading: loadingBookings } = useQuery({
    queryKey: ["my-bookings", user?.email, selectedSport],
    queryFn: async () => {
      const { data } = await courtlyApi.bookings.list({
        player_email: user?.email,
        sport: selectedSport,
      });
      return data;
    },
    enabled: !!user?.email,
  });

  const bookingGroups = useMemo(
    () => groupCourtBookings(bookings),
    [bookings],
  );

  const { data: registrations = [], isLoading: loadingRegs } = useQuery({
    queryKey: ["my-registrations", user?.email],
    queryFn: async () => {
      const { data } = await courtlyApi.registrations.list({
        player_email: user?.email,
      });
      return data;
    },
    enabled: !!user?.email,
  });

  const cancelBooking = useMutation({
    mutationFn: async (id: string) => {
      await courtlyApi.bookings.update(id, { status: "cancelled" });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
      toast.success("Booking cancelled");
    },
  });

  const isLoading = loadingBookings || loadingRegs;

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 md:px-10">
      <PageHeader
        title="My Bookings"
        subtitle="Manage your reservations and registrations"
      />

      <Tabs value={tab} onValueChange={setTab} className="mb-6">
        <TabsList>
          <TabsTrigger value="bookings" className="font-heading">
            Court Bookings ({bookings.length})
          </TabsTrigger>
          <TabsTrigger value="tournaments" className="font-heading">
            Tournaments ({registrations.length})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : tab === "bookings" ? (
        bookings.length === 0 ? (
          <EmptyState
            icon={Calendar}
            title="No bookings yet"
            description="Book a court to get started!"
          >
            <Button className="font-heading" asChild>
              <Link href="/courts">Browse Courts</Link>
            </Button>
          </EmptyState>
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              If your chosen range includes hours that are already booked or
              blocked, only the <span className="font-medium text-foreground">free</span>{" "}
              segments are reserved. You confirm that split before the booking
              is created.
            </div>
            {bookingGroups.map((g) => {
              const sessionTotal = g.items.reduce(
                (sum, b) => sum + (b.total_cost ?? 0),
                0,
              );
              const showSessionTotal = g.items.length > 1;

              return (
                <Card
                  key={g.key}
                  className="border-border/50 transition-shadow hover:shadow-md"
                >
                  <CardContent className="p-5">
                    <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="font-heading font-bold text-foreground">
                          {g.courtName}
                        </h3>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 shrink-0" />
                            {g.date &&
                              format(new Date(`${g.date}T12:00:00`), "EEE, MMM d, yyyy")}
                          </span>
                        </div>
                        {g.items.length > 1 ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {g.items[0]?.booking_group_id
                              ? "One booking with multiple reserved times (unavailable hours in between were skipped)."
                              : `${g.items.length} reserved times on this day.`}
                          </p>
                        ) : null}
                      </div>
                      <Button size="sm" variant="outline" className="shrink-0" asChild>
                        <Link href={`/my-bookings/${g.detailBookingId}`}>
                          Details
                        </Link>
                      </Button>
                    </div>

                    <ul className="divide-y divide-border/60 border-t border-border/60">
                      {g.items.map((b) => {
                        const hours = bookingDurationHours(b);
                        return (
                          <li
                            key={b.id}
                            className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                                  <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                  {formatTimeShort(b.start_time)} –{" "}
                                  {formatTimeShort(b.end_time)}
                                </span>
                                <span className="text-sm text-muted-foreground">
                                  ({hours} {hours === 1 ? "hr" : "hrs"} booked)
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge
                                  variant="outline"
                                  className={statusStyles[b.status] ?? ""}
                                >
                                  {formatStatusLabel(b.status)}
                                </Badge>
                                <span className="inline-flex items-center gap-0.5 text-sm font-semibold text-foreground">
                                  <PhilippinePeso className="h-3.5 w-3.5 text-muted-foreground" />
                                  {formatPhp(b.total_cost ?? 0)}
                                </span>
                              </div>
                            </div>
                            {b.status === "confirmed" ? (
                              <div className="flex shrink-0 flex-wrap gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="border-destructive/20 text-destructive hover:bg-destructive/5 hover:text-destructive"
                                  onClick={() => cancelBooking.mutate(b.id)}
                                  disabled={cancelBooking.isPending}
                                >
                                  <X className="mr-1 h-3.5 w-3.5" /> Cancel
                                </Button>
                              </div>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>

                    {showSessionTotal ? (
                      <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-3 text-sm">
                        <span className="font-medium text-muted-foreground">
                          Session total
                        </span>
                        <span className="font-heading text-base font-bold text-primary">
                          {formatPhp(sessionTotal)}
                        </span>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      ) : registrations.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No registrations yet"
          description="Join a tournament to compete!"
        >
          <Button className="font-heading" asChild>
            <Link href="/tournaments">Browse Tournaments</Link>
          </Button>
        </EmptyState>
      ) : (
        <div className="space-y-4">
          {registrations.map((r) => (
            <Card
              key={r.id}
              className="border-border/50 transition-shadow hover:shadow-md"
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      <h3 className="font-heading font-bold text-foreground">
                        {r.tournament_name || "Tournament"}
                      </h3>
                      <Badge
                        variant="outline"
                        className={statusStyles[r.status] ?? ""}
                      >
                        {formatStatusLabel(r.status)}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {r.player_name}{" "}
                      {r.partner_name ? `& ${r.partner_name}` : ""}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

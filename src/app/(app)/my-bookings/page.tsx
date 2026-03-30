"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Calendar,
  Clock,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import EmptyState from "@/components/shared/EmptyState";
import PageHeader from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { courtlyApi } from "@/lib/api/courtly-client";
import { queryKeys } from "@/lib/query/query-keys";
import { formatPhp } from "@/lib/format-currency";
import {
  bookingDurationHours,
  formatTimeShort,
} from "@/lib/booking-range";
import { useAuth } from "@/lib/auth/auth-context";
import { useBookingsRealtime } from "@/lib/bookings/use-bookings-realtime";
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
  for (const booking of list) {
    const key = booking.booking_group_id
      ? `grp:${booking.booking_group_id}`
      : `day:${booking.court_id}\0${booking.date}`;
    const arr = map.get(key);
    if (arr) arr.push(booking);
    else map.set(key, [booking]);
  }
  const groups: CourtDateGroup[] = [];
  for (const [key, items] of map) {
    items.sort((left, right) =>
      left.start_time.localeCompare(right.start_time),
    );
    const first = items[0];
    groups.push({
      key,
      courtName: first?.establishment_name ?? first?.court_name ?? "Court",
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
  const [statusFilter, setStatusFilter] = useState<"all" | Booking["status"]>("confirmed");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"recent" | "oldest" | "court">("recent");
  const { user } = useAuth();
  const selectedSport = useSelectedSport((s) => s.sport);

  const { data: overview, isLoading } = useQuery({
    queryKey: queryKeys.me.bookingsOverview(user?.email, selectedSport),
    queryFn: async () => {
      const { data } = await courtlyApi.me.bookingsOverview({
        sport: selectedSport,
      });
      return data;
    },
    enabled: !!user?.email,
  });
  const bookings = useMemo(() => overview?.bookings ?? [], [overview?.bookings]);
  const registrations = useMemo(
    () => overview?.registrations ?? [],
    [overview?.registrations],
  );
  const bookingsRealtimeKeys = useMemo(() => [queryKeys.bookings.all()], []);
  useBookingsRealtime({
    playerEmail: user?.email,
    enabled: !!user?.email,
    queryKeysToInvalidate: bookingsRealtimeKeys,
  });

  const bookingGroups = useMemo(() => {
    const searchQuery = query.trim().toLowerCase();
    const filtered = bookings.filter((booking) => {
      if (statusFilter !== "all" && booking.status !== statusFilter)
        return false;
      if (!searchQuery) return true;
      const court = (booking.court_name ?? "").toLowerCase();
      const date = booking.date.toLowerCase();
      const status = booking.status.toLowerCase();
      return (
        court.includes(searchQuery) ||
        date.includes(searchQuery) ||
        status.includes(searchQuery)
      );
    });

    const groups = groupCourtBookings(filtered);
    groups.sort((a, b) => {
      if (sortBy === "court") return a.courtName.localeCompare(b.courtName);
      if (sortBy === "oldest") return a.date.localeCompare(b.date);
      // default: most recent first
      return b.date.localeCompare(a.date);
    });
    return groups;
  }, [bookings, query, sortBy, statusFilter]);

  const tabLoading = isLoading;

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

      {tabLoading ? (
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
            <div className="grid gap-2 rounded-lg border border-border/60 bg-muted/20 p-3 md:grid-cols-3">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search court, date, or status"
              />
              <Select
                value={statusFilter}
                onValueChange={(v) => setStatusFilter(v as "all" | Booking["status"])}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={sortBy}
                onValueChange={(v) => setSortBy(v as "recent" | "oldest" | "court")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recent">Most recent (default)</SelectItem>
                  <SelectItem value="oldest">Oldest first</SelectItem>
                  <SelectItem value="court">Court name (A-Z)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-lg border border-border/60 bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
              If your chosen range includes hours that are already booked or
              blocked, only the <span className="font-medium text-foreground">free</span>{" "}
              segments are reserved. You confirm that split before the booking
              is created.
            </div>
            {bookingGroups.length === 0 ? (
              <EmptyState
                icon={Calendar}
                title="No bookings match your filters"
                description="Try changing search, status, or sort options."
              />
            ) : bookingGroups.map((group) => {
              const sessionTotal = group.items.reduce(
                (sum, booking) => sum + (booking.total_cost ?? 0),
                0,
              );
              const showSessionTotal = group.items.length > 1;

              return (
                <Card
                  key={group.key}
                  className="border-border/50 transition-shadow hover:shadow-md"
                >
                  <CardContent className="p-5">
                    <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="font-heading font-bold text-foreground">
                          {group.courtName}
                        </h3>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5">
                            <Calendar className="h-3.5 w-3.5 shrink-0" />
                            {group.date &&
                              format(
                                new Date(`${group.date}T12:00:00`),
                                "EEE, MMM d, yyyy",
                              )}
                          </span>
                        </div>
                        {group.items.length > 1 ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            {group.items[0]?.booking_group_id
                              ? "One booking with multiple reserved times (unavailable hours in between were skipped)."
                              : `${group.items.length} reserved times on this day.`}
                          </p>
                        ) : null}
                      </div>
                      <Button size="sm" variant="outline" className="shrink-0" asChild>
                        <Link href={`/my-bookings/${group.detailBookingId}`}>
                          Details
                        </Link>
                      </Button>
                    </div>

                    <ul className="divide-y divide-border/60 border-t border-border/60">
                      {group.items.map((booking) => {
                        const hours = bookingDurationHours(booking);
                        return (
                          <li
                            key={booking.id}
                            className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between"
                          >
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground">
                                  <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                  {formatTimeShort(booking.start_time)} –{" "}
                                  {formatTimeShort(booking.end_time)}
                                </span>
                                <span className="text-sm text-muted-foreground">
                                  ({hours} {hours === 1 ? "hr" : "hrs"} booked)
                                </span>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <Badge
                                  variant="outline"
                                  className={statusStyles[booking.status] ?? ""}
                                >
                                  {formatStatusLabel(booking.status)}
                                </Badge>
                                <span className="text-sm font-semibold text-foreground tabular-nums">
                                  {formatPhp(booking.total_cost ?? 0)}
                                </span>
                              </div>
                            </div>
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
          {registrations.map((registration) => (
            <Card
              key={registration.id}
              className="border-border/50 transition-shadow hover:shadow-md"
            >
              <CardContent className="p-5">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="mb-1 flex items-center gap-2">
                      <h3 className="font-heading font-bold text-foreground">
                        {registration.tournament_name || "Tournament"}
                      </h3>
                      <Badge
                        variant="outline"
                        className={statusStyles[registration.status] ?? ""}
                      >
                        {formatStatusLabel(registration.status)}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {registration.player_name}{" "}
                      {registration.partner_name
                        ? `& ${registration.partner_name}`
                        : ""}
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

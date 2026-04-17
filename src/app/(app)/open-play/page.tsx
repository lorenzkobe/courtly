"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowRight,
  Calendar,
  Clock,
  MapPin,
  Settings2,
  Trophy,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import EmptyState from "@/components/shared/EmptyState";
import PageHeader from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { courtlyApi } from "@/lib/api/courtly-client";
import { formatTimeShort } from "@/lib/booking-range";
import { formatPhpCompact } from "@/lib/format-currency";
import { useAuth } from "@/lib/auth/auth-context";
import {
  openPlayDisplayStatus,
  openPlayDisplayStatusLabel,
} from "@/lib/open-play/lifecycle";
import { queryKeys } from "@/lib/query/query-keys";
import { useSelectedSport } from "@/lib/stores/selected-sport";
import { cn } from "@/lib/utils";

const lifecycleBadgeStyles: Record<string, string> = {
  open: "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-100",
  started: "border-primary/25 bg-primary/10 text-primary",
  closed: "bg-muted text-muted-foreground border-border",
  cancelled: "border-destructive/30 bg-destructive/10 text-destructive",
};

export default function OpenPlayPage() {
  const [skillFilter, setSkillFilter] = useState("all");
  const [managedFilter, setManagedFilter] = useState<"active" | "closed">("active");
  const [managedSort, setManagedSort] = useState<"latest" | "oldest">("latest");
  const { user } = useAuth();
  const selectedSport = useSelectedSport((state) => state.sport);
  const [listNowMs, setListNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setListNowMs(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: queryKeys.openPlay.list({ sport: selectedSport }),
    queryFn: async () => {
      const { data } = await courtlyApi.openPlay.list({ sport: selectedSport });
      return data;
    },
  });

  const { data: hostedSessions = [], isLoading: loadingHosted } = useQuery({
    queryKey: queryKeys.openPlay.list({
      hosted_by_me: true,
      sport: selectedSport,
    }),
    queryFn: async () => {
      const { data } = await courtlyApi.openPlay.list({
        hosted_by_me: true,
        sport: selectedSport,
      });
      return data;
    },
    enabled: Boolean(user),
  });

  const filtered =
    skillFilter === "all"
      ? sessions
      : sessions.filter((session) => session.skill_level === skillFilter);

  /** Public browse list: only sessions that are still joinable or in progress (hide closed/cancelled). */
  const browseSessions = useMemo(() => {
    return filtered.filter((session) => {
      const display = openPlayDisplayStatus(
        session,
        listNowMs,
        session.approved_join_count ?? 0,
      );
      return display === "open" || display === "started";
    });
  }, [filtered, listNowMs]);
  const managedSessions = useMemo(() => {
    const rows = hostedSessions.filter((session) => {
      const display = openPlayDisplayStatus(
        session,
        listNowMs,
        session.approved_join_count ?? 0,
      );
      if (managedFilter === "active") {
        return display === "open" || display === "started";
      }
      return display === "closed" || display === "cancelled";
    });
    rows.sort((a, b) => {
      const left = Date.parse(`${a.date}T${a.start_time}`);
      const right = Date.parse(`${b.date}T${b.start_time}`);
      if (!Number.isFinite(left) || !Number.isFinite(right)) return 0;
      return managedSort === "latest" ? right - left : left - right;
    });
    return rows;
  }, [hostedSessions, listNowMs, managedFilter, managedSort]);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 md:px-10">
      <PageHeader
        title="Open Play"
        subtitle="Drop in, play, and make new friends"
      >
        <Select value={skillFilter} onValueChange={setSkillFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="Level" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Levels</SelectItem>
            <SelectItem value="beginner">Beginner</SelectItem>
            <SelectItem value="intermediate">Intermediate</SelectItem>
            <SelectItem value="advanced">Advanced</SelectItem>
            <SelectItem value="all_levels">All Welcome</SelectItem>
          </SelectContent>
        </Select>
      </PageHeader>

      {user ? (
        <Card className="mb-8 border-border/50">
          <CardContent className="space-y-4 p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Settings2 className="h-5 w-5 text-muted-foreground" />
                <h2 className="font-heading text-lg font-semibold text-foreground">
                  Manage open plays
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select
                  value={managedFilter}
                  onValueChange={(value) =>
                    setManagedFilter(value as "active" | "closed")
                  }
                >
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="Filter" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={managedSort}
                  onValueChange={(value) =>
                    setManagedSort(value as "latest" | "oldest")
                  }
                >
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="Sort" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="latest">Latest first</SelectItem>
                    <SelectItem value="oldest">Oldest first</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              Sessions you created from your bookings. Open a card to approve join
              requests and view comments.
            </p>
            {loadingHosted ? (
              <Skeleton className="h-20 w-full rounded-lg" />
            ) : managedSessions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {managedFilter === "active" ? (
                  <>
                    You do not have any active open play sessions yet. Create one from a
                    confirmed booking on{" "}
                    <Link
                      href="/my-bookings"
                      className="text-primary underline-offset-4 hover:underline"
                    >
                      My bookings
                    </Link>
                    .
                  </>
                ) : (
                  "You do not have any closed open play sessions."
                )}
              </p>
            ) : (
              <ul className="space-y-2">
                {managedSessions.map((session) => {
                  const display = openPlayDisplayStatus(
                    session,
                    listNowMs,
                    session.approved_join_count ?? 0,
                  );
                  return (
                    <li key={session.id}>
                      <Link
                        href={`/open-play/${session.id}`}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/15 px-4 py-3 text-sm transition-colors hover:bg-muted/30"
                      >
                        <div className="min-w-0 space-y-1">
                          <p className="font-medium text-foreground">{session.title}</p>
                          <p className="text-muted-foreground">
                            {format(new Date(`${session.date}T12:00:00`), "EEE, MMM d")} ·{" "}
                            {formatTimeShort(session.start_time)} –{" "}
                            {formatTimeShort(session.end_time)}
                            {session.court_name ? ` · ${session.court_name}` : ""}
                          </p>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn("shrink-0", lifecycleBadgeStyles[display] ?? "")}
                        >
                          {openPlayDisplayStatusLabel(display)}
                        </Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : browseSessions.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No sessions found"
          description="Check back soon for open play sessions."
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {browseSessions.map((session) => {
            const spotsLeft =
              (session.max_players || 0) - (session.current_players || 0);
            const fillPct = session.max_players
              ? ((session.current_players || 0) / session.max_players) * 100
              : 0;
            const isFull = session.status === "full" || spotsLeft <= 0;
            const lifecycleDisplay = openPlayDisplayStatus(
              session,
              listNowMs,
              session.approved_join_count ?? 0,
            );

            return (
              <Card
                key={session.id}
                className="group overflow-hidden border-border/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
              >
                <CardContent className="p-6">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <h3 className="font-heading text-lg font-bold text-foreground transition-colors group-hover:text-primary">
                      {session.title}
                    </h3>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-xs font-medium",
                          lifecycleBadgeStyles[lifecycleDisplay] ?? "",
                        )}
                      >
                        {openPlayDisplayStatusLabel(lifecycleDisplay)}
                      </Badge>
                      <span className="rounded-full border border-border/70 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                        DUPR {session.dupr_min?.toFixed(2) ?? "0.00"} -{" "}
                        {session.dupr_max?.toFixed(2) ?? "8.00"}
                      </span>
                    </div>
                  </div>

                  <div className="mb-4 space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      {format(new Date(session.date), "EEE, MMM d")}
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      {session.start_time} – {session.end_time}
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      {session.location}
                    </div>
                    <div className="flex items-center gap-2">
                      <Trophy className="h-4 w-4" />
                      Hosted by {session.host_name}
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      {session.venue_name ?? "Venue"} / {session.court_name ?? "Court"}
                    </div>
                  </div>

                  {session.description ? (
                    <p className="mb-4 line-clamp-2 text-sm text-muted-foreground">
                      {session.description}
                    </p>
                  ) : null}

                  <div className="mb-4">
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {(session.registered_players_count ?? session.current_players)}/
                        {session.max_players} registered
                      </span>
                      <span
                        className={`font-medium ${spotsLeft <= 2 ? "text-destructive" : "text-primary"}`}
                      >
                        {isFull ? "Full" : `${spotsLeft} spots left`}
                      </span>
                    </div>
                    <Progress value={fillPct} className="h-2" />
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="font-heading font-bold text-primary">
                      {session.price_per_player > 0
                        ? `${formatPhpCompact(session.price_per_player)}/player`
                        : "Free"}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" asChild>
                        <Link href={`/open-play/${session.id}`}>
                          Details <ArrowRight className="ml-1 h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

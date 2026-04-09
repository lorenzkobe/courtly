"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowRight,
  Calendar,
  Clock,
  MapPin,
  Trophy,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import EmptyState from "@/components/shared/EmptyState";
import PageHeader from "@/components/shared/PageHeader";
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
import { queryKeys } from "@/lib/query/query-keys";
import { formatPhpCompact } from "@/lib/format-currency";
import { useSelectedSport } from "@/lib/stores/selected-sport";
import type { OpenPlaySession } from "@/lib/types/courtly";

export default function OpenPlayPage() {
  const [skillFilter, setSkillFilter] = useState("all");
  const queryClient = useQueryClient();
  const selectedSport = useSelectedSport((state) => state.sport);

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: queryKeys.openPlay.list({ sport: selectedSport }),
    queryFn: async () => {
      const { data } = await courtlyApi.openPlay.list({ sport: selectedSport });
      return data;
    },
  });

  const joinWaitlistMutation = useMutation({
    mutationFn: async (sessionId: string) => {
      await courtlyApi.openPlay.join(sessionId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.openPlay.all() });
      toast.success("You are on the waitlist.");
    },
    onError: () => toast.error("Could not join waitlist."),
  });

  function ctaLabel(session: OpenPlaySession): string {
    const userStatus = session.current_user_request_status;
    if (userStatus === "approved") return "Approved";
    if (userStatus === "pending_approval") return "Pending Approval";
    if (userStatus === "payment_locked") return "Proceed to Payment";
    if (userStatus === "waitlisted") return "Waitlisted";
    if (session.status === "full") return "Full";
    return "Join Waitlist";
  }

  const filtered =
    skillFilter === "all"
      ? sessions
      : sessions.filter((session) => session.skill_level === skillFilter);

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

      {isLoading ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-64 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No sessions found"
          description="Check back soon for open play sessions."
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((session) => {
            const spotsLeft =
              (session.max_players || 0) - (session.current_players || 0);
            const fillPct = session.max_players
              ? ((session.current_players || 0) / session.max_players) * 100
              : 0;
            const isFull = session.status === "full" || spotsLeft <= 0;

            return (
              <Card
                key={session.id}
                className="group overflow-hidden border-border/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
              >
                <CardContent className="p-6">
                  <div className="mb-3 flex items-start justify-between">
                    <h3 className="font-heading text-lg font-bold text-foreground transition-colors group-hover:text-primary">
                      {session.title}
                    </h3>
                    <span className="rounded-full border border-border/70 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      DUPR {session.dupr_min?.toFixed(2) ?? "0.00"} -{" "}
                      {session.dupr_max?.toFixed(2) ?? "8.00"}
                    </span>
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
                      <Button
                        size="sm"
                        disabled={
                          joinWaitlistMutation.isPending ||
                          isFull ||
                          session.current_user_request_status === "approved" ||
                          session.current_user_request_status === "pending_approval" ||
                          session.current_user_request_status === "waitlisted"
                        }
                        onClick={() => {
                          if (session.current_user_request_status === "payment_locked") {
                            window.location.href = `/open-play/${session.id}`;
                            return;
                          }
                          joinWaitlistMutation.mutate(session.id);
                        }}
                        className="font-heading font-semibold"
                      >
                        {ctaLabel(session)}
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

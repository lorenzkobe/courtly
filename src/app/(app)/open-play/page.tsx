"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Calendar,
  Clock,
  MapPin,
  UserPlus,
  Users,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import EmptyState from "@/components/shared/EmptyState";
import PageHeader from "@/components/shared/PageHeader";
import SkillBadge from "@/components/shared/SkillBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { formatPhpCompact } from "@/lib/format-currency";
import { useSelectedSport } from "@/lib/stores/selected-sport";
import type { OpenPlaySession } from "@/lib/types/courtly";

export default function OpenPlayPage() {
  const [skillFilter, setSkillFilter] = useState("all");
  const [joinSession, setJoinSession] = useState<OpenPlaySession | null>(null);
  const [playerName, setPlayerName] = useState("");
  const [playerEmail, setPlayerEmail] = useState("");
  const queryClient = useQueryClient();
  const selectedSport = useSelectedSport((s) => s.sport);

  const { data: sessions = [], isLoading } = useQuery({
    queryKey: ["open-play", selectedSport],
    queryFn: async () => {
      const { data } = await courtlyApi.openPlay.list({ sport: selectedSport });
      return data;
    },
  });

  const joinMutation = useMutation({
    mutationFn: async (session: OpenPlaySession) => {
      const next = (session.current_players || 0) + 1;
      const max = session.max_players || 0;
      await courtlyApi.openPlay.update(session.id, {
        current_players: next,
        status: next >= max ? "full" : "open",
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["open-play"] });
      toast.success("You're in! See you on the court.");
      setJoinSession(null);
      setPlayerName("");
      setPlayerEmail("");
    },
  });

  const handleJoin = () => {
    if (!playerName || !playerEmail) {
      toast.error("Please fill in your name and email");
      return;
    }
    if (joinSession) joinMutation.mutate(joinSession);
  };

  const filtered =
    skillFilter === "all"
      ? sessions
      : sessions.filter((s) => s.skill_level === skillFilter);

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
          {filtered.map((s) => {
            const spotsLeft =
              (s.max_players || 0) - (s.current_players || 0);
            const fillPct = s.max_players
              ? ((s.current_players || 0) / s.max_players) * 100
              : 0;
            const isFull = s.status === "full" || spotsLeft <= 0;

            return (
              <Card
                key={s.id}
                className="group overflow-hidden border-border/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl"
              >
                <CardContent className="p-6">
                  <div className="mb-3 flex items-start justify-between">
                    <h3 className="font-heading text-lg font-bold text-foreground transition-colors group-hover:text-primary">
                      {s.title}
                    </h3>
                    <SkillBadge level={s.skill_level} />
                  </div>

                  <div className="mb-4 space-y-2 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4" />
                      {format(new Date(s.date), "EEE, MMM d")}
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      {s.start_time} – {s.end_time}
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      {s.location}
                    </div>
                    <div className="flex items-center gap-2">
                      <UserPlus className="h-4 w-4" />
                      Hosted by {s.host_name}
                    </div>
                  </div>

                  {s.description ? (
                    <p className="mb-4 line-clamp-2 text-sm text-muted-foreground">
                      {s.description}
                    </p>
                  ) : null}

                  <div className="mb-4">
                    <div className="mb-1.5 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {s.current_players}/{s.max_players} players
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
                      {s.fee > 0 ? formatPhpCompact(s.fee) : "Free"}
                    </span>
                    <Button
                      size="sm"
                      disabled={isFull}
                      onClick={() => setJoinSession(s)}
                      className="font-heading font-semibold"
                    >
                      {isFull ? "Full" : "Join Session"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog
        open={!!joinSession}
        onOpenChange={(o) => !o && setJoinSession(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">
              Join {joinSession?.title}
            </DialogTitle>
          </DialogHeader>
          <div className="mt-2 space-y-4">
            <div>
              <Label>Full Name *</Label>
              <Input
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                placeholder="Your name"
              />
            </div>
            <div>
              <Label>Email *</Label>
              <Input
                type="email"
                value={playerEmail}
                onChange={(e) => setPlayerEmail(e.target.value)}
                placeholder="your@email.com"
              />
            </div>
            <Button
              className="w-full font-heading font-semibold"
              onClick={handleJoin}
              disabled={joinMutation.isPending}
            >
              {joinMutation.isPending ? "Joining..." : "Confirm"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

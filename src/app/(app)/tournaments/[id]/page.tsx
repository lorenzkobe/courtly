"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowLeft,
  Calendar,
  Clock,
  MapPin,
  Trophy,
  Users,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import SkillBadge from "@/components/shared/SkillBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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
import { formatStatusLabel } from "@/lib/utils";

const formatLabels: Record<string, string> = {
  singles: "Singles",
  doubles: "Doubles",
  mixed_doubles: "Mixed Doubles",
  round_robin: "Round Robin",
};

export default function TournamentDetailPage() {
  const params = useParams<{ id: string }>();
  const tournamentId = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const selectedSport = useSelectedSport((s) => s.sport);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    player_name: "",
    player_email: "",
    partner_name: "",
    skill_level: "intermediate" as "beginner" | "intermediate" | "advanced",
  });

  const { data: tournament, isLoading, isError } = useQuery({
    queryKey: ["tournament", tournamentId, selectedSport],
    queryFn: async () => {
      const { data } = await courtlyApi.tournaments.get(tournamentId, {
        sport: selectedSport,
      });
      return data;
    },
    enabled: !!tournamentId,
    retry: false,
  });

  const register = useMutation({
    mutationFn: async () => {
      await courtlyApi.tournaments.register(tournamentId, {
        player_name: form.player_name,
        player_email: form.player_email,
        partner_name: form.partner_name || undefined,
        skill_level: form.skill_level,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tournament", tournamentId] });
      void queryClient.invalidateQueries({ queryKey: ["tournaments"] });
      void queryClient.invalidateQueries({ queryKey: ["my-registrations"] });
      toast.success("Registered successfully!");
      setOpen(false);
    },
  });

  const handleRegister = () => {
    if (!form.player_name || !form.player_email) {
      toast.error("Please fill in all required fields");
      return;
    }
    register.mutate();
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-6 py-8 md:px-10">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!isLoading && (isError || !tournament)) {
    return (
      <div className="px-6 py-8 text-center md:px-10">
        <p className="text-muted-foreground">
          {isError
            ? "This tournament is not available for your selected sport."
            : "Tournament not found."}
        </p>
        <Button
          variant="outline"
          onClick={() => router.push("/tournaments")}
          className="mt-4"
        >
          <ArrowLeft className="mr-2 h-4 w-4" /> Back
        </Button>
      </div>
    );
  }

  if (!tournament) {
    return null;
  }

  const t = tournament;
  const spotsLeft =
    (t.max_participants || 0) - (t.current_participants || 0);
  const fillPct = t.max_participants
    ? ((t.current_participants || 0) / t.max_participants) * 100
    : 0;
  const isDoubles =
    t.format === "doubles" || t.format === "mixed_doubles";

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 md:px-10">
      <Button
        variant="ghost"
        onClick={() => router.push("/tournaments")}
        className="mb-4 -ml-2 text-muted-foreground"
      >
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Tournaments
      </Button>

      <div className="mb-6">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {formatLabels[t.format] ?? t.format}
          </Badge>
          <SkillBadge level={t.skill_level} />
          <Badge variant="outline">
            {formatStatusLabel(t.status)}
          </Badge>
        </div>
        <h1 className="font-heading text-3xl font-bold text-foreground md:text-4xl">
          {t.name}
        </h1>
      </div>

      <Card className="mb-6 border-border/50">
        <CardContent className="p-6">
          <p className="mb-6 text-muted-foreground">{t.description}</p>
          <div className="grid grid-cols-2 gap-4 text-sm sm:grid-cols-4">
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Calendar className="h-4 w-4" /> Date
              </div>
              <p className="font-semibold">
                {format(new Date(t.date), "MMM d, yyyy")}
              </p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Clock className="h-4 w-4" /> Time
              </div>
              <p className="font-semibold">
                {t.start_time} – {t.end_time}
              </p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <MapPin className="h-4 w-4" /> Location
              </div>
              <p className="font-semibold">{t.location}</p>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Trophy className="h-4 w-4" /> Entry Fee
              </div>
              <p className="font-semibold text-primary">
                {formatPhpCompact(t.entry_fee)}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {t.prize ? (
        <Card className="mb-6 border-accent/30 bg-accent/10">
          <CardContent className="p-5">
            <h3 className="mb-1 font-heading font-bold">Prize</h3>
            <p className="text-sm">{t.prize}</p>
          </CardContent>
        </Card>
      ) : null}

      <Card className="mb-6 border-border/50">
        <CardContent className="p-5">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Users className="h-4 w-4" /> Registration
            </span>
            <span
              className={`text-sm font-medium ${spotsLeft <= 3 ? "text-destructive" : "text-primary"}`}
            >
              {spotsLeft} spots left
            </span>
          </div>
          <Progress value={fillPct} className="mb-2 h-3" />
          <p className="text-right text-xs text-muted-foreground">
            {t.current_participants || 0} of {t.max_participants} registered
          </p>
        </CardContent>
      </Card>

      {t.status === "registration_open" && spotsLeft > 0 ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button
              size="lg"
              className="w-full font-heading font-semibold shadow-lg shadow-primary/20"
            >
              Register for Tournament
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-heading">
                Register for {t.name}
              </DialogTitle>
            </DialogHeader>
            <div className="mt-2 space-y-4">
              <div>
                <Label>Full Name *</Label>
                <Input
                  value={form.player_name}
                  onChange={(e) =>
                    setForm({ ...form, player_name: e.target.value })
                  }
                  placeholder="John Doe"
                />
              </div>
              <div>
                <Label>Email *</Label>
                <Input
                  type="email"
                  value={form.player_email}
                  onChange={(e) =>
                    setForm({ ...form, player_email: e.target.value })
                  }
                  placeholder="john@example.com"
                />
              </div>
              {isDoubles ? (
                <div>
                  <Label>Partner Name</Label>
                  <Input
                    value={form.partner_name}
                    onChange={(e) =>
                      setForm({ ...form, partner_name: e.target.value })
                    }
                    placeholder="Partner's name"
                  />
                </div>
              ) : null}
              <div>
                <Label>Skill Level</Label>
                <Select
                  value={form.skill_level}
                  onValueChange={(v) =>
                    setForm({
                      ...form,
                      skill_level: v as typeof form.skill_level,
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="beginner">Beginner</SelectItem>
                    <SelectItem value="intermediate">Intermediate</SelectItem>
                    <SelectItem value="advanced">Advanced</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleRegister}
                className="w-full font-heading font-semibold"
                disabled={register.isPending}
              >
                {register.isPending ? "Registering..." : "Confirm Registration"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

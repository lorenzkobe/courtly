import Link from "next/link";
import { Calendar, MapPin, Users } from "lucide-react";
import { format } from "date-fns";
import SkillBadge from "@/components/shared/SkillBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatPhpCompact } from "@/lib/format-currency";
import type { Tournament } from "@/lib/types/courtly";

const formatLabels: Record<string, string> = {
  singles: "Singles",
  doubles: "Doubles",
  mixed_doubles: "Mixed Doubles",
  round_robin: "Round Robin",
};

export default function TournamentCard({
  tournament,
}: {
  tournament: Tournament;
}) {
  const spotsLeft =
    (tournament.max_participants || 0) - (tournament.current_participants || 0);
  const fillPct = tournament.max_participants
    ? ((tournament.current_participants || 0) / tournament.max_participants) * 100
    : 0;

  return (
    <Card className="group overflow-hidden border-border/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
      <CardContent className="p-6">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-heading text-xl font-bold text-foreground transition-colors group-hover:text-primary">
              {tournament.name}
            </h3>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="font-medium capitalize">
                {formatLabels[tournament.format] ?? tournament.format}
              </Badge>
              <SkillBadge level={tournament.skill_level} />
            </div>
          </div>
          <div className="shrink-0 text-right">
            <span className="font-heading text-2xl font-bold text-primary">
              {formatPhpCompact(tournament.entry_fee)}
            </span>
            <p className="text-xs text-muted-foreground">entry fee</p>
          </div>
        </div>

        <p className="mb-4 line-clamp-2 text-sm text-muted-foreground">
          {tournament.description}
        </p>

        <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Calendar className="h-4 w-4" />
            {format(new Date(tournament.date), "MMM d, yyyy")}
          </div>
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="h-4 w-4" />
            {tournament.location}
          </div>
        </div>

        <div className="mb-4">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="flex items-center gap-1 text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              {tournament.current_participants || 0}/{tournament.max_participants} registered
            </span>
            <span
              className={`font-medium ${spotsLeft <= 3 ? "text-destructive" : "text-primary"}`}
            >
              {spotsLeft} spots left
            </span>
          </div>
          <Progress value={fillPct} className="h-2" />
        </div>

        {tournament.prize ? (
          <div className="mb-4 rounded-lg bg-accent/20 p-2.5 text-sm">
            <span className="font-semibold">Prize:</span> {tournament.prize}
          </div>
        ) : null}

        <Button
          className="w-full font-heading font-semibold"
          variant={
            tournament.status === "registration_open" ? "default" : "secondary"
          }
          asChild
        >
          <Link href={`/tournaments/${tournament.id}`}>
            {tournament.status === "registration_open"
              ? "Register Now"
              : "View Details"}
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

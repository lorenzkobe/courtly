"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowRight,
  BookOpen,
  Calendar,
  Clock,
  MapPin,
  Trophy,
  Users,
} from "lucide-react";
import SkillBadge from "@/components/shared/SkillBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { courtlyApi } from "@/lib/api/courtly-client";
import { useAuth } from "@/lib/auth/auth-context";

const quickActions = [
  {
    icon: Calendar,
    label: "Book a Court",
    description: "Reserve your spot on the court",
    path: "/courts",
    color: "bg-primary",
  },
  {
    icon: Trophy,
    label: "Tournaments",
    description: "Compete and win prizes",
    path: "/tournaments",
    color: "bg-chart-3",
  },
  {
    icon: Users,
    label: "Open Play",
    description: "Join casual drop-in sessions",
    path: "/open-play",
    color: "bg-chart-4",
  },
  {
    icon: BookOpen,
    label: "My Bookings",
    description: "View your reservations",
    path: "/my-bookings",
    color: "bg-destructive",
  },
];

export default function DashboardPage() {
  const { user } = useAuth();

  const { data: tournaments = [] } = useQuery({
    queryKey: ["tournaments-dashboard"],
    queryFn: async () => {
      const { data } = await courtlyApi.tournaments.list({
        status: "registration_open",
        limit: 2,
        sort: "-date",
      });
      return data;
    },
  });

  const { data: sessions = [] } = useQuery({
    queryKey: ["sessions-dashboard"],
    queryFn: async () => {
      const { data } = await courtlyApi.openPlay.list({
        status: "open",
        limit: 3,
      });
      return data;
    },
  });

  const firstName = user?.full_name?.split(" ")[0] ?? "there";

  return (
    <div className="min-h-screen">
      <div className="relative overflow-hidden bg-secondary">
        <div className="pointer-events-none absolute inset-0 opacity-10">
          <div className="absolute right-10 top-10 h-96 w-96 rounded-full bg-primary blur-3xl" />
          <div className="absolute bottom-10 left-10 h-64 w-64 rounded-full bg-chart-3 blur-3xl" />
        </div>
        <div className="relative max-w-5xl px-6 py-14 md:px-10 md:py-20">
          <p className="mb-2 font-medium text-primary">
            Welcome back, {firstName}!
          </p>
          <h1 className="font-heading text-4xl font-bold leading-tight tracking-tight text-secondary-foreground md:text-5xl">
            Ready to play?
          </h1>
          <p className="mt-3 max-w-md text-muted-foreground">
            Book a court, find a session, or register for a tournament — all
            in one place.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              size="lg"
              className="font-heading font-semibold shadow-lg shadow-primary/20"
              asChild
            >
              <Link href="/courts">
                Book Now <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="font-heading font-semibold border-white bg-white text-foreground hover:bg-white/90"
              asChild
            >
              <Link href="/open-play">Find Open Play</Link>
            </Button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl space-y-12 px-6 py-10 md:px-10">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {quickActions.map((action) => (
            <Link key={action.path} href={action.path}>
              <Card className="group h-full cursor-pointer border-border/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
                <CardContent className="flex flex-col gap-3 p-5">
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-xl ${action.color}`}
                  >
                    <action.icon className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="font-heading text-sm font-semibold text-foreground transition-colors group-hover:text-primary">
                      {action.label}
                    </h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {action.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {tournaments.length > 0 ? (
          <section>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-heading text-2xl font-bold text-foreground">
                Open Tournaments
              </h2>
              <Link
                href="/tournaments"
                className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {tournaments.map((t) => (
                <Link key={t.id} href={`/tournaments/${t.id}`}>
                  <Card className="group cursor-pointer border-border/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg">
                    <CardContent className="p-6">
                      <div className="mb-3 flex items-start justify-between">
                        <div>
                          <h3 className="font-heading text-lg font-semibold text-foreground transition-colors group-hover:text-primary">
                            {t.name}
                          </h3>
                          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                            <Calendar className="h-3.5 w-3.5" />
                            {format(new Date(t.date), "MMM d, yyyy")}
                          </div>
                        </div>
                        <SkillBadge level={t.skill_level} />
                      </div>
                      <p className="mb-3 line-clamp-2 text-sm text-muted-foreground">
                        {t.description}
                      </p>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <MapPin className="h-3.5 w-3.5" /> {t.location}
                        </div>
                        <span className="font-heading font-bold text-primary">
                          ${t.entry_fee}
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {sessions.length > 0 ? (
          <section>
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-heading text-2xl font-bold text-foreground">
                Open Play Sessions
              </h2>
              <Link
                href="/open-play"
                className="flex items-center gap-1 text-sm font-medium text-primary hover:underline"
              >
                View all <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {sessions.map((s) => (
                <Card
                  key={s.id}
                  className="border-border/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
                >
                  <CardContent className="p-5">
                    <div className="mb-2 flex items-start justify-between">
                      <h3 className="font-heading font-semibold text-foreground">
                        {s.title}
                      </h3>
                      <SkillBadge level={s.skill_level} />
                    </div>
                    <div className="mb-3 space-y-1.5 text-sm text-muted-foreground">
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5" />
                        {format(new Date(s.date), "EEE, MMM d")}
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5" />
                        {s.start_time} – {s.end_time}
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5" /> {s.location}
                      </div>
                    </div>
                    <div className="flex items-center justify-between border-t border-border/50 pt-2">
                      <span className="text-xs text-muted-foreground">
                        {s.current_players}/{s.max_players} players
                      </span>
                      <span className="font-heading text-sm font-bold text-primary">
                        {s.fee > 0 ? `$${s.fee}` : "Free"}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

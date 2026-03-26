"use client";

import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle,
  Layers,
  Shield,
  Star,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/lib/auth/auth-context";

const features = [
  {
    icon: Calendar,
    title: "Court Booking",
    description:
      "Reserve courts instantly. Pick your date, time, and location with real-time availability.",
    color: "bg-primary/10 text-primary",
  },
  {
    icon: Trophy,
    title: "Tournaments",
    description:
      "Register for competitive events, track standings, and win prizes.",
    color: "bg-chart-3/15 text-chart-3",
  },
  {
    icon: Users,
    title: "Open Play",
    description:
      "Join casual drop-in sessions, meet other players, and improve your game.",
    color: "bg-chart-4/15 text-chart-4",
  },
  {
    icon: BookOpen,
    title: "My Bookings",
    description:
      "View, manage, and cancel all your reservations and registrations in one place.",
    color: "bg-destructive/10 text-destructive",
  },
  {
    icon: Zap,
    title: "Instant Confirmation",
    description:
      "No waiting. Bookings are confirmed immediately with all details at your fingertips.",
    color: "bg-primary/10 text-primary",
  },
  {
    icon: Shield,
    title: "Admin Tools",
    description:
      "Facility managers get powerful tools to manage courts, bookings, and events.",
    color: "bg-chart-4/15 text-chart-4",
  },
];

const sports = [
  "Pickleball",
  "Tennis",
  "Padel",
  "Squash",
  "Badminton",
  "Basketball",
];

const testimonials = [
  {
    name: "Sarah M.",
    text: "Booking a court used to be a hassle. Courtly made it effortless.",
    sport: "Pickleball",
  },
  {
    name: "James T.",
    text: "The tournament registration flow is so smooth. Love competing on Courtly.",
    sport: "Tennis",
  },
  {
    name: "Priya K.",
    text: "Found a great open play group through Courtly. Best decision ever!",
    sport: "Padel",
  },
];

export default function HomePage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <header className="fixed left-0 right-0 top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <Link
            href="/"
            className="flex items-center gap-2 transition-opacity hover:opacity-90"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
              <Layers className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="font-heading text-xl font-bold tracking-tight text-foreground">
                Courtly
              </span>
              <span className="hidden text-xs font-medium text-muted-foreground sm:block">
                Book courts, play your sport
              </span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            {user ? (
              <Button className="font-heading font-semibold" asChild>
                <Link href="/dashboard">Open app</Link>
              </Button>
            ) : (
              <>
                <Button variant="ghost" className="font-medium" asChild>
                  <Link href="/login">Sign In</Link>
                </Button>
                <Button
                  className="font-heading font-semibold shadow-sm shadow-primary/20"
                  asChild
                >
                  <Link href="/login">Get Started</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden bg-secondary px-6 pb-24 pt-32">
        <div className="pointer-events-none absolute inset-0 opacity-10">
          <div className="absolute right-0 top-0 h-[600px] w-[600px] rounded-full bg-primary blur-[120px]" />
          <div className="absolute bottom-0 left-0 h-[400px] w-[400px] rounded-full bg-chart-3 blur-[100px]" />
        </div>
        <div className="relative mx-auto max-w-4xl text-center">
          <Badge
            variant="outline"
            className="mb-6 border-primary/30 bg-primary/10 text-sm text-primary"
          >
            Starting with Pickleball — more sports coming soon
          </Badge>
          <h1 className="font-heading text-5xl font-bold leading-tight tracking-tight text-secondary-foreground md:text-7xl">
            Book courts.
            <br />
            <span className="text-primary">Play your sport.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-xl text-muted-foreground">
            Courtly is the all-in-one platform for booking sports courts, joining
            tournaments, and finding open play — built for players and facility
            managers alike.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Button
              size="lg"
              className="h-12 px-8 font-heading text-base font-semibold shadow-xl shadow-primary/25"
              asChild
            >
              <Link href="/login">
                Start Booking Free <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 border-white bg-white px-8 font-heading text-base font-semibold text-foreground hover:bg-white/90"
            >
              See How It Works
            </Button>
          </div>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            Mock auth: use the Sign in page. For admin tools,{" "}
            <Link href="/login?role=admin" className="text-primary underline">
              sign in as admin
            </Link>
            .
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
            {["No credit card required", "Instant confirmation", "Cancel anytime"].map(
              (t) => (
                <div key={t} className="flex items-center gap-1.5">
                  <CheckCircle className="h-4 w-4 text-primary" /> {t}
                </div>
              ),
            )}
          </div>
        </div>
      </section>

      <section className="border-y border-border/50 bg-muted/30 py-12">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <p className="mb-6 text-sm font-medium uppercase tracking-widest text-muted-foreground">
            Currently supporting
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {sports.map((sport, i) => (
              <Badge
                key={sport}
                variant={i === 0 ? "default" : "outline"}
                className="px-4 py-1.5 text-sm font-medium"
              >
                {sport}{" "}
                {i !== 0 ? (
                  <span className="ml-1.5 text-xs opacity-50">Soon</span>
                ) : null}
              </Badge>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-16 text-center">
            <h2 className="font-heading text-4xl font-bold text-foreground md:text-5xl">
              Everything you need to play
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
              From booking a court to competing in tournaments — Courtly handles
              it all.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <Card
                key={f.title}
                className="group border-border/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
              >
                <CardContent className="p-7">
                  <div
                    className={`mb-5 flex h-12 w-12 items-center justify-center rounded-2xl ${f.color}`}
                  >
                    <f.icon className="h-6 w-6" />
                  </div>
                  <h3 className="mb-2 font-heading text-lg font-bold text-foreground transition-colors group-hover:text-primary">
                    {f.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {f.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-secondary px-6 py-24">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="font-heading text-4xl font-bold text-secondary-foreground">
            How it works
          </h2>
          <p className="mb-16 text-muted-foreground">
            Get on the court in three easy steps.
          </p>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "Create your account",
                desc: "Sign up for free and set your sport preferences.",
              },
              {
                step: "02",
                title: "Find & book",
                desc: "Browse available courts, tournaments, or open play sessions.",
              },
              {
                step: "03",
                title: "Play!",
                desc: "Show up and enjoy. Your booking is confirmed instantly.",
              },
            ].map((s) => (
              <div key={s.step} className="relative">
                <div className="mb-3 font-heading text-6xl font-black text-primary/20">
                  {s.step}
                </div>
                <h3 className="mb-2 font-heading text-xl font-bold text-secondary-foreground">
                  {s.title}
                </h3>
                <p className="text-sm text-muted-foreground">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-12 text-center font-heading text-4xl font-bold text-foreground">
            Loved by players
          </h2>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {testimonials.map((t) => (
              <Card key={t.name} className="border-border/50">
                <CardContent className="p-6">
                  <div className="mb-4 flex gap-0.5">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className="h-4 w-4 fill-chart-3 text-chart-3"
                      />
                    ))}
                  </div>
                  <p className="mb-4 text-sm leading-relaxed text-foreground">
                    &ldquo;{t.text}&rdquo;
                  </p>
                  <div>
                    <p className="font-heading text-sm font-semibold text-foreground">
                      {t.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {t.sport} Player
                    </p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-secondary px-6 py-24 text-center">
        <div className="mx-auto max-w-2xl">
          <h2 className="font-heading text-4xl font-bold text-secondary-foreground md:text-5xl">
            Ready to hit the court?
          </h2>
          <p className="mb-8 text-lg text-muted-foreground">
            Join players who book smarter with Courtly.
          </p>
          <Button
            size="lg"
            className="h-12 px-10 font-heading text-base font-semibold shadow-xl shadow-primary/25"
            asChild
          >
            <Link href="/login">
              Get Started Free <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      <footer className="border-t border-border/50 px-6 py-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 sm:flex-row">
          <div className="flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary">
              <Layers className="h-3 w-3 text-primary-foreground" />
            </div>
            <span className="font-heading font-bold text-foreground">
              Courtly
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Courtly. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}

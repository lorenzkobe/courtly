import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle,
  Layers,
  Shield,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { homePathForRole } from "@/lib/auth/management";
import { Card, CardContent } from "@/components/ui/card";

const features = [
  {
    icon: Calendar,
    title: "Court Booking",
    description:
      "Browse venues, pick your date and time slots, and submit a booking request in minutes.",
    color: "bg-primary/10 text-primary",
    comingSoon: false,
  },
  {
    icon: Trophy,
    title: "Tournaments",
    description:
      "Register for competitive events, track standings, and win prizes.",
    color: "bg-chart-3/15 text-chart-3",
    comingSoon: true,
  },
  {
    icon: Users,
    title: "Open Play",
    description:
      "Join casual drop-in sessions, meet other players, and improve your game.",
    color: "bg-chart-4/15 text-chart-4",
    comingSoon: true,
  },
  {
    icon: BookOpen,
    title: "My Bookings",
    description:
      "View and manage all your reservations in one place with your booking history.",
    color: "bg-destructive/10 text-destructive",
    comingSoon: false,
  },
  {
    icon: Zap,
    title: "Guest Booking",
    description:
      "No account needed. Book a court as a guest — just fill in your details and you're set.",
    color: "bg-primary/10 text-primary",
    comingSoon: false,
  },
  {
    icon: Shield,
    title: "Admin Tools",
    description:
      "Facility managers get powerful tools to manage courts, bookings, and revenue.",
    color: "bg-chart-4/15 text-chart-4",
    comingSoon: false,
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


export default async function HomePage() {
  const user = await readSessionUser();
  const appHomePath = homePathForRole(user?.role);

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
              <>
                <Button variant="outline" className="font-medium" asChild>
                  <Link href="/courts">Book</Link>
                </Button>
                <Button className="font-heading font-semibold" asChild>
                  <Link href={appHomePath}>Open app</Link>
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" className="font-medium" asChild>
                  <Link href="/book">Book</Link>
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
              <Link href="/book">
                Book a Court <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 border-white bg-white px-8 font-heading text-base font-semibold text-foreground hover:bg-white/90"
              asChild
            >
              <Link href="#how-it-works">See How It Works</Link>
            </Button>
          </div>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-sm text-muted-foreground">
            {["No account required", "Venue-confirmed bookings", "Pay at booking"].map(
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
            {features.map((feature) => {
              const FeatureIcon = feature.icon;
              return (
              <Card
                key={feature.title}
                className="group border-border/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg"
              >
                <CardContent className="p-7">
                  <div className="mb-5 flex items-start justify-between">
                    <div
                      className={`flex h-12 w-12 items-center justify-center rounded-2xl ${feature.color}`}
                    >
                      <FeatureIcon className="h-6 w-6" />
                    </div>
                    {feature.comingSoon && (
                      <Badge variant="outline" className="text-xs text-muted-foreground">
                        Coming soon
                      </Badge>
                    )}
                  </div>
                  <h3 className="mb-2 font-heading text-lg font-bold text-foreground transition-colors group-hover:text-primary">
                    {feature.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section id="how-it-works" className="bg-secondary px-6 py-24">
        <div className="mx-auto max-w-4xl text-center">
          <h2 className="font-heading text-4xl font-bold text-secondary-foreground">
            How it works
          </h2>
          <p className="mb-16 text-muted-foreground">
            Get on the court in three easy steps — no account needed.
          </p>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
            {[
              {
                step: "01",
                title: "Browse courts",
                desc: "Find venues near you. Filter by location, court type, and available hours.",
              },
              {
                step: "02",
                title: "Pick your slot",
                desc: "Select your date and time slots, then confirm your booking instantly.",
              },
              {
                step: "03",
                title: "Play!",
                desc: "Show up and enjoy. Your confirmation is sent right away.",
              },
            ].map((step) => (
              <div key={step.step} className="relative">
                <div className="mb-3 font-heading text-6xl font-black text-primary/20">
                  {step.step}
                </div>
                <h3 className="mb-2 font-heading text-xl font-bold text-secondary-foreground">
                  {step.title}
                </h3>
                <p className="text-sm text-muted-foreground">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <div className="mb-16 text-center">
            <h2 className="font-heading text-4xl font-bold text-foreground md:text-5xl">
              Designed for everyone on the court
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-lg text-muted-foreground">
              Whether you&apos;re booking a slot or running a facility, Courtly has you covered.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Card className="border-border/50">
              <CardContent className="p-8">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Calendar className="h-6 w-6" />
                </div>
                <h3 className="mb-1 font-heading text-xl font-bold text-foreground">For Players</h3>
                <p className="mb-6 text-sm text-muted-foreground">
                  Find a court, pick your time, and play — no sign-up required.
                </p>
                <ul className="space-y-3">
                  {[
                    "Book courts without creating an account",
                    "Browse venues by location and court type",
                    "View and manage your reservations",
                    "Favorite your go-to venues",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2.5 text-sm text-foreground">
                      <CheckCircle className="h-4 w-4 shrink-0 text-primary" />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
            <Card className="border-border/50">
              <CardContent className="p-8">
                <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-chart-4/15 text-chart-4">
                  <Shield className="h-6 w-6" />
                </div>
                <h3 className="mb-1 font-heading text-xl font-bold text-foreground">For Venue Managers</h3>
                <p className="mb-6 text-sm text-muted-foreground">
                  Everything you need to run your facility — courts, bookings, and revenue in one place.
                </p>
                <ul className="space-y-3">
                  {[
                    "Manage courts and configure availability",
                    "Review and confirm booking requests",
                    "Track revenue and billing cycles",
                    "Full admin dashboard and reporting",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-2.5 text-sm text-foreground">
                      <CheckCircle className="h-4 w-4 shrink-0 text-primary" />
                      {item}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section className="bg-secondary px-6 py-24 text-center">
        <div className="mx-auto max-w-2xl">
          <h2 className="font-heading text-4xl font-bold text-secondary-foreground md:text-5xl">
            Ready to hit the court?
          </h2>
          <p className="mb-8 text-lg text-muted-foreground">
            Browse available courts and book a slot in minutes.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Button
              size="lg"
              className="h-12 px-10 font-heading text-base font-semibold shadow-xl shadow-primary/25"
              asChild
            >
              <Link href="/book">
                Browse Courts <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="h-12 px-8 font-heading text-base font-semibold"
              asChild
            >
              <Link href="/login">Sign in for more</Link>
            </Button>
          </div>
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

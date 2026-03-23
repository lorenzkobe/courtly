"use client";

import { useRef } from "react";
import { courtlyPalette } from "@/lib/branding";

const weeklyActivity = [
  { title: "Open Play Tonight", detail: "BGC Skyline Courts · 7:00 PM · Skill 3.0+" },
  { title: "Beginner Social", detail: "Makati Social Club · 6:00 PM · 14 slots left" },
  { title: "Weekend Cup Qualifier", detail: "Cebu Bay Courts · Registration closes in 2 days" },
];

const highlights = [
  { label: "Mock Active Players", value: "8,420" },
  { label: "Mock Partner Venues", value: "96" },
  { label: "Mock Monthly Bookings", value: "11,380" },
  { label: "Mock Weekly Open Plays", value: "214" },
];

const features = [
  {
    title: "Court Booking",
    text: "Browse real-time court availability and reserve slots in under 30 seconds.",
  },
  {
    title: "Tournaments",
    text: "Create and join tournaments with automated seeding, scheduling, and match updates.",
  },
  {
    title: "Open Plays",
    text: "Discover open sessions near you and connect with players at your skill level.",
  },
];

const howItWorks = [
  {
    step: "01",
    title: "Create an Account",
    text: "Sign up as a player, organizer, or venue admin and set your profile in minutes.",
  },
  {
    step: "02",
    title: "Book or Join",
    text: "Reserve courts, join open plays, or register for tournaments from one dashboard.",
  },
  {
    step: "03",
    title: "Play and Track",
    text: "Get reminders, check in, and track results while Courtly handles coordination.",
  },
];

const testimonials = [
  {
    quote:
      "Our mock venue operations are much cleaner now that bookings and tournaments live in one place.",
    person: "Sample Persona · Venue Manager",
  },
  {
    quote:
      "I can sign in, find open sessions, and secure a court in just a few taps.",
    person: "Sample Persona · Player",
  },
];

const featuredItems = [
  {
    title: "Metro Smash Cup",
    detail: "Quarterfinals · Court 3 · 7:40 PM",
    tag: "Tournament",
  },
  {
    title: "Sunset Social Doubles",
    detail: "Open Play · BGC Skyline · 6:30 PM",
    tag: "Open Play",
  },
  {
    title: "Rookie Ladder Finals",
    detail: "Beginner Series · Court 1 · 8:00 PM",
    tag: "Community",
  },
  {
    title: "Cebu Bay Sports Hub",
    detail: "6 courts · Tournament-ready facilities",
    tag: "Court",
  },
  {
    title: "Makati Social Club",
    detail: "3 covered courts · Peak slots open",
    tag: "Court",
  },
];

const panelLight = "rounded-2xl border border-zinc-200 bg-white";
const panelTint = "rounded-2xl border border-zinc-200 bg-zinc-50";
const panelDark = "rounded-2xl border border-zinc-700 bg-zinc-900 text-zinc-100";

export default function Home() {
  const carouselRef = useRef<HTMLDivElement | null>(null);

  const scrollCarousel = (direction: "left" | "right") => {
    if (!carouselRef.current) return;
    carouselRef.current.scrollBy({
      left: direction === "left" ? -340 : 340,
      behavior: "smooth",
    });
  };

  return (
    <main
      className={`min-h-screen ${courtlyPalette.pageBackground} px-6 py-10 ${courtlyPalette.textPrimary} sm:px-12`}
    >
      <div className="mx-auto max-w-6xl space-y-10">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur">
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
            <p className="text-sm font-semibold tracking-wide">Courtly</p>
          </div>
          <nav className="hidden items-center gap-6 text-sm text-zinc-600 md:flex">
            <a href="#" className="hover:text-zinc-900">
              Courts
            </a>
            <a href="#" className="hover:text-zinc-900">
              Tournaments
            </a>
            <a href="#" className="hover:text-zinc-900">
              Open Plays
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <button className="rounded-full border border-zinc-300 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50">
              Log In
            </button>
            <button className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-semibold text-white hover:bg-zinc-800">
              Sign Up
            </button>
          </div>
        </header>

        <section className={`relative overflow-hidden ${courtlyPalette.heroContainer} p-7 sm:p-10`}>
          <div className="pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-emerald-300/20 blur-3xl" />
          <div className="pointer-events-none absolute -left-10 bottom-0 h-36 w-36 rounded-full bg-zinc-400/20 blur-3xl" />
          <p className="mb-3 inline-flex rounded-full bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-700 ring-1 ring-zinc-200">
            Pickleball-first booking platform
          </p>
          <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">
            The booking and tournament app for modern pickleball communities.
          </h1>
          <p className={`mt-3 max-w-3xl text-lg leading-8 ${courtlyPalette.textSecondary}`}>
            Launching with pickleball first: book courts, join open plays, and run
            tournaments in one platform. Multi-sport support is part of the roadmap.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              className={`rounded-full px-5 py-2.5 text-sm font-semibold transition ${courtlyPalette.primaryButton}`}
            >
              Get Started
            </button>
            <button
              className={`rounded-full px-5 py-2.5 text-sm font-semibold transition ${courtlyPalette.secondaryButton}`}
            >
              Log In
            </button>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className={`${panelLight} p-5`}>
              <p className="text-[11px] font-semibold uppercase tracking-wide opacity-80">
                Happening This Week
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                {weeklyActivity.map((item) => (
                  <div key={item.title} className={`${panelLight} rounded-xl p-4`}>
                    <p className="text-sm font-bold">{item.title}</p>
                    <p className="mt-1 text-sm opacity-80">{item.detail}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className={`${panelDark} p-5`}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                Live Snapshot
              </p>
              <div className="mt-3 space-y-3">
                <div className="flex items-center justify-between rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2">
                  <span className="text-sm text-zinc-300">Mock courts in play now</span>
                  <span className="text-sm font-bold text-emerald-300">74</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2">
                  <span className="text-sm text-zinc-300">Mock open sessions today</span>
                  <span className="text-sm font-bold text-emerald-300">29</span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-zinc-700 bg-zinc-800 px-3 py-2">
                  <span className="text-sm text-zinc-300">Mock tournament check-ins</span>
                  <span className="text-sm font-bold text-emerald-300">186</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold tracking-tight">Featured this week</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={() => scrollCarousel("left")}
                className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Prev
              </button>
              <button
                onClick={() => scrollCarousel("right")}
                className="rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50"
              >
                Next
              </button>
            </div>
          </div>
          <div
            ref={carouselRef}
            className="flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {featuredItems.map((item) => (
              <article
                key={`${item.tag}-${item.title}`}
                className="min-w-[300px] snap-start rounded-2xl border border-zinc-200 bg-white p-5"
              >
                <p className="inline-flex rounded-full bg-zinc-100 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-600">
                  {item.tag}
                </p>
                <h3 className="mt-3 text-lg font-bold">{item.title}</h3>
                <p className="mt-2 text-sm text-zinc-600">{item.detail}</p>
                <div className="mt-4 h-1.5 w-full rounded-full bg-zinc-100">
                  <div className="h-1.5 w-2/3 rounded-full bg-emerald-500" />
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {highlights.map((item, index) => (
            <div
              key={item.label}
              className={`${index % 2 === 0 ? panelLight : panelTint} p-5 text-zinc-900`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
                {item.label}
              </p>
              <p className="mt-2 text-xl font-bold">{item.value}</p>
            </div>
          ))}
        </section>

        <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-6 text-zinc-100 sm:p-8">
          <h2 className="text-2xl font-bold">Everything players and organizers need</h2>
          <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-2xl border border-zinc-700 bg-zinc-800 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
                Featured Sessions
              </p>
              <div className="mt-3 space-y-3">
                <div className="flex items-center justify-between rounded-xl border border-zinc-700 bg-zinc-900 p-3">
                  <div>
                    <p className="text-sm font-bold">Sunset Open Play</p>
                    <p className="text-sm opacity-75">Makati Social Club · 7:30 PM</p>
                  </div>
                  <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-800">
                    5 slots
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-xl border border-zinc-700 bg-zinc-900 p-3">
                  <div>
                    <p className="text-sm font-bold">Beginner Ladder</p>
                    <p className="text-sm opacity-75">BGC Skyline · 6:00 PM</p>
                  </div>
                  <span className="rounded-full bg-zinc-200 px-2 py-1 text-xs font-semibold text-zinc-900">
                    Almost full
                  </span>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-emerald-700/50 bg-linear-to-br from-emerald-950 to-zinc-900 p-5">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-200">
                Tournament Pulse
              </p>
              <div className="mt-3 space-y-3">
                <div className="rounded-xl bg-white/90 p-3 text-zinc-900">
                  <p className="text-sm font-bold">Metro Smash Cup</p>
                  <p className="mt-1 text-sm text-zinc-600">Quarterfinals · 64 players</p>
                  <div className="mt-2 h-2 rounded-full bg-zinc-200">
                    <div className="h-2 w-3/4 rounded-full bg-emerald-500" />
                  </div>
                </div>
                <div className="rounded-xl bg-white/90 p-3 text-zinc-900">
                  <p className="text-sm font-bold">Weekend Rookie Series</p>
                  <p className="mt-1 text-sm text-zinc-600">Registration progress</p>
                  <div className="mt-2 h-2 rounded-full bg-zinc-200">
                    <div className="h-2 w-2/3 rounded-full bg-emerald-500" />
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {features.map((item) => (
              <article
                key={item.title}
                className="rounded-2xl border border-zinc-700 bg-zinc-800 p-5 transition hover:-translate-y-0.5"
              >
                <h3 className="text-lg font-bold">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-300">{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-zinc-200 bg-white p-6 sm:p-8">
          <h2 className="text-2xl font-bold">How Courtly works</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {howItWorks.map((item) => (
              <article key={item.step} className={`${panelLight} p-5`}>
                <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{item.step}</p>
                <h3 className="mt-2 text-lg font-bold">{item.title}</h3>
                <p className="mt-2 text-base leading-7 opacity-90">{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          {testimonials.map((item, index) => (
            <blockquote
              key={item.person}
              className={`${index === 0 ? panelTint : panelLight} p-6 text-zinc-900`}
            >
              <p className="text-lg font-medium leading-8">&ldquo;{item.quote}&rdquo;</p>
              <p className="mt-3 text-sm opacity-80">{item.person}</p>
            </blockquote>
          ))}
        </section>

        <section className={`${panelDark} p-6`}>
          <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">
            Run a venue or club?
          </p>
          <h2 className="mt-2 text-2xl font-bold">
            Run your venue with less admin and more play.
          </h2>
          <p className="mt-2 max-w-2xl text-base opacity-85">
            Start with a mock onboarding flow now, then switch to production auth
            and live venue setup as we move into backend implementation.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button
              className={`rounded-full px-5 py-2 text-sm font-semibold transition ${courtlyPalette.primaryButton}`}
            >
              List Your Club
            </button>
            <button
              className={`rounded-full px-5 py-2 text-sm font-semibold transition ${courtlyPalette.secondaryButton}`}
            >
              Contact Sales
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

import Link from "next/link";
import {
  ArrowRight,
  Building2,
  Flag,
  Receipt,
  UserCog,
} from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const links = [
  {
    href: "/superadmin/venues",
    title: "Court accounts",
    description:
      "Review admin-submitted venue requests, approve or reject onboarding, and manage venue admins.",
    icon: Building2,
  },
  {
    href: "/superadmin/users",
    title: "User accounts",
    description:
      "Add or edit players, court admins, and platform staff; link admins to court accounts.",
    icon: UserCog,
  },
  {
    href: "/superadmin/revenue",
    title: "Billing",
    description:
      "Monthly booking fee statements per venue. Review payment proofs and mark cycles as paid.",
    icon: Receipt,
  },
  {
    href: "/superadmin/moderation",
    title: "Flagged reviews",
    description:
      "Review reports from venue admins about player reviews, clear flags, or remove content.",
    icon: Flag,
  },
] as const;

export default function SuperadminHomePage() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-8 md:px-10">
      <PageHeader
        title="Platform overview"
        subtitle="Superadmin focuses on court accounts, user accounts, and network revenue. Venues manage their own courts and bookings from the venue admin console."
      />

      <div className="mb-8 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
        Onboard organizations under{" "}
        <strong className="font-medium text-foreground">Court accounts</strong>, manage people under{" "}
        <strong className="font-medium text-foreground">User accounts</strong>, and use{" "}
        <strong className="font-medium text-foreground">Billing</strong> to collect monthly booking
        fees from venues. Venue operators use{" "}
        <strong className="font-medium text-foreground">Revenue</strong> under their own admin login
        for date-filtered court income.
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {links.map(({ href, title, description, icon: Icon }) => (
          <Card key={href} className="border-border/60">
            <CardHeader>
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <CardTitle className="font-heading text-lg">{title}</CardTitle>
              <CardDescription className="text-pretty">{description}</CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="group font-heading font-semibold" asChild>
                <Link href={href}>
                  Open
                  <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

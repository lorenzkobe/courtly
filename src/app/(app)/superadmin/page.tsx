"use client";

import Link from "next/link";
import { ArrowRight, Calendar, Layers } from "lucide-react";
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
    href: "/admin/courts",
    title: "Courts",
    description: "Create and assign courts, or update availability and pricing across the network.",
    icon: Layers,
  },
  {
    href: "/admin/bookings",
    title: "Bookings",
    description: "Review and update reservations on any court.",
    icon: Calendar,
  },
] as const;

export default function SuperadminHomePage() {
  return (
    <div className="mx-auto max-w-7xl px-6 py-8 md:px-10">
      <PageHeader
        title="Superadmin"
        subtitle="Platform-wide tools. Player-facing areas stay unchanged; use this hub to operate the whole directory."
      />

      <div className="mb-8 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
        Full superadmin workflows (users, billing, impersonation, audit logs) will land here as the
        product grows. Today, courts and bookings are fully manageable from the links below.
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

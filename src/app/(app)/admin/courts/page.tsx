"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Building2 } from "lucide-react";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { courtlyApi } from "@/lib/api/courtly-client";
import type { Court } from "@/lib/types/courtly";

export default function AdminCourtsPage() {
  const { data: courts = [], isLoading } = useQuery({
    queryKey: ["admin-courts"],
    queryFn: async () => {
      const { data } = await courtlyApi.courts.list({ manageable: true });
      return data;
    },
  });

  const venueCards = Array.from(
    courts.reduce<
      Map<
        string,
        { id: string; name: string; location: string; image_url: string; court_count: number }
      >
    >((acc, court) => {
      const existing = acc.get(court.venue_id);
      if (existing) {
        existing.court_count += 1;
        return acc;
      }
      acc.set(court.venue_id, {
        id: court.venue_id,
        name: court.establishment_name ?? "Venue",
        location: court.location,
        image_url: court.image_url,
        court_count: 1,
      });
      return acc;
    }, new Map()),
  ).map(([, v]) => v);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 md:px-10">
      <PageHeader
        title="My venues"
        subtitle="Select a venue to manage its courts"
      />

      {isLoading ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {venueCards.map((venue) => (
            <Card
              key={venue.id}
              className="overflow-hidden border-border/50 transition-shadow hover:shadow-md"
            >
              {venue.image_url ? (
                <div className="h-36 overflow-hidden">
                  <img
                    src={venue.image_url}
                    alt={venue.name}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      e.currentTarget.parentElement?.remove();
                    }}
                  />
                </div>
              ) : null}
              <CardContent className="p-5">
                <div className="mb-2">
                  <h3 className="font-heading font-bold text-foreground">
                    {venue.name}
                  </h3>
                </div>
                <div className="mb-4 space-y-1 text-sm text-muted-foreground">
                  <div>{venue.location}</div>
                  <div className="text-xs">{venue.court_count} courts</div>
                </div>
                <Button asChild variant="outline" className="w-full">
                  <Link href={`/admin/courts/${venue.id}`}>
                    Manage courts <ChevronRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!isLoading && venueCards.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <Building2 className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              No assigned venues yet. Ask a superadmin to assign a venue to your account.
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Building2 } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { courtlyApi } from "@/lib/api/courtly-client";

export default function AdminVenuesPage() {
  const { data: venueCards = [], isLoading } = useQuery({
    queryKey: ["admin-venues"],
    queryFn: async () => {
      const { data } = await courtlyApi.assignedVenues.list();
      return data;
    },
  });

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
                <div className="relative h-36 overflow-hidden">
                  <Image
                    src={venue.image_url}
                    alt={venue.name}
                    fill
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                    unoptimized
                    className="object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
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
                  <div className="text-xs">
                    {venue.court_count}{" "}
                    {venue.court_count === 1 ? "court" : "courts"}
                    {venue.court_count === 0 ? " — add one from Manage courts" : ""}
                  </div>
                </div>
                <Button asChild variant="outline" className="w-full">
                  <Link href={`/admin/venues/${venue.id}`}>
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

import Link from "next/link";
import { Heart, MapPin, Clock, PhilippinePeso } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatCourtRateSummary } from "@/lib/court-pricing";
import { formatAmenityLabel } from "@/lib/format-amenity";
import { cn, formatStatusLabel } from "@/lib/utils";
import type { Court } from "@/lib/types/courtly";

export default function CourtCard({
  court,
  isFavorite = false,
  onToggleFavorite,
}: {
  court: Court;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
}) {
  return (
    <Card className="group overflow-hidden border-border/50 transition-all duration-300 hover:-translate-y-1 hover:shadow-xl">
      <div className="relative h-48 overflow-hidden bg-muted">
        <img
          src={court.image_url}
          alt={court.name}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
        <div className="absolute left-3 top-3 flex max-w-[calc(100%-4rem)] flex-wrap gap-2">
          <Badge className="bg-secondary/90 text-secondary-foreground backdrop-blur-sm">
            {formatStatusLabel(court.type)}
          </Badge>
          <Badge className="bg-secondary/90 text-secondary-foreground backdrop-blur-sm">
            {formatAmenityLabel(court.surface)}
          </Badge>
        </div>
        {onToggleFavorite ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleFavorite();
            }}
            className={cn(
              "absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-border/60 bg-background/85 shadow-sm backdrop-blur-sm transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              isFavorite && "border-primary/40 text-primary",
            )}
            aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
            <Heart
              className={cn(
                "h-4 w-4",
                isFavorite
                  ? "fill-primary stroke-primary"
                  : "text-muted-foreground",
              )}
            />
          </button>
        ) : null}
      </div>
      <CardContent className="p-5">
        <h3 className="mb-2 font-heading text-lg font-bold text-foreground">
          {court.name}
        </h3>
        <div className="mb-4 space-y-1.5 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{court.location}</span>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5" />
            {court.available_hours?.open} – {court.available_hours?.close}
          </div>
          <div className="flex items-center gap-2">
            <PhilippinePeso className="h-3.5 w-3.5" />
            <span className="font-semibold text-foreground">
              {formatCourtRateSummary(court)}
            </span>
          </div>
        </div>
        {court.amenities?.length ? (
          <div className="mb-4 flex flex-wrap gap-1.5">
            {court.amenities.map((a) => (
              <Badge
                key={a}
                variant="outline"
                className="text-xs font-normal"
              >
                {formatAmenityLabel(a)}
              </Badge>
            ))}
          </div>
        ) : null}
        <Button className="w-full font-heading font-semibold shadow-sm" asChild>
          <Link href={`/courts/${court.id}/book`}>Book This Court</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

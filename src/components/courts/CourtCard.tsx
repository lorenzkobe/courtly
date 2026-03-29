import Link from "next/link";
import Image from "next/image";
import { Heart, MapPin, Clock, Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatTimeShort } from "@/lib/booking-range";
import { formatCourtRateSummary } from "@/lib/court-pricing";
import { formatAmenityLabel } from "@/lib/format-amenity";
import { cn, formatStatusLabel } from "@/lib/utils";
import type { Court } from "@/lib/types/courtly";

function mergedOperatingRanges(court: Court): Array<{ start: string; end: string }> {
  const windows = [...(court.hourly_rate_windows ?? [])].sort((a, b) =>
    a.start.localeCompare(b.start),
  );
  const merged: Array<{ start: string; end: string }> = [];
  for (const window of windows) {
    const prev = merged[merged.length - 1];
    if (prev && prev.end === window.start) {
      prev.end = window.end;
      continue;
    }
    merged.push({ start: window.start, end: window.end });
  }
  return merged;
}

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
        <Image
          src={court.image_url}
          alt={court.name}
          fill
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          unoptimized
          className="object-cover transition-transform duration-500 group-hover:scale-105"
          onError={(e) => {
            e.currentTarget.style.display = "none";
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
          {court.establishment_name ?? court.name}
        </h3>
        {court.establishment_name ? (
          <p className="mb-2 text-xs text-muted-foreground">{court.name}</p>
        ) : null}
        <div className="mb-4 space-y-1.5 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{court.location}</span>
          </div>
          <div className="flex items-start gap-2">
            <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span className="min-w-0 leading-snug">
              {(court.hourly_rate_windows ?? []).length ? (
                <span className="block text-xs text-muted-foreground">
                  {mergedOperatingRanges(court).map((range, i) => (
                    <span key={`${range.start}-${range.end}`}>
                      {i > 0 ? " · " : null}
                      {formatTimeShort(range.start)}–{formatTimeShort(range.end)}
                    </span>
                  ))}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">Rates on booking</span>
              )}
            </span>
          </div>
          <div className="font-semibold text-foreground tabular-nums">
            {formatCourtRateSummary(court)}
          </div>
          {court.review_summary && court.review_summary.review_count > 0 ? (
            <div className="flex items-center gap-1.5">
              <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />
              <span className="font-medium text-foreground">
                {court.review_summary.average_rating.toFixed(1)}
              </span>
              <span className="text-muted-foreground">
                ({court.review_summary.review_count}{" "}
                {court.review_summary.review_count === 1 ? "review" : "reviews"}
                )
              </span>
            </div>
          ) : null}
        </div>
        {court.amenities?.length ? (
          <div className="mb-4 flex flex-wrap gap-1.5">
            {court.amenities.map((amenity) => (
              <Badge
                key={amenity}
                variant="outline"
                className="text-xs font-normal"
              >
                {formatAmenityLabel(amenity)}
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

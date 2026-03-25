import Link from "next/link";
import { MapPin, Clock, DollarSign } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Court } from "@/lib/types/courtly";

export default function CourtCard({ court }: { court: Court }) {
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
        <div className="absolute left-3 top-3 flex gap-2">
          <Badge className="bg-secondary/90 capitalize text-secondary-foreground backdrop-blur-sm">
            {court.type}
          </Badge>
          <Badge className="bg-secondary/90 capitalize text-secondary-foreground backdrop-blur-sm">
            {court.surface?.replace("_", " ")}
          </Badge>
        </div>
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
            <DollarSign className="h-3.5 w-3.5" />
            <span className="font-semibold text-foreground">
              ${court.hourly_rate}/hr
            </span>
          </div>
        </div>
        {court.amenities?.length ? (
          <div className="mb-4 flex flex-wrap gap-1.5">
            {court.amenities.map((a) => (
              <Badge
                key={a}
                variant="outline"
                className="text-xs font-normal capitalize"
              >
                {a.replace("_", " ")}
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

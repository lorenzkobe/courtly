"use client";

import { Dumbbell } from "lucide-react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { SPORT_OPTIONS } from "@/lib/sports";
import { useSelectedSport } from "@/lib/stores/selected-sport";

export default function SportPicker({
  className,
  id = "sport-picker",
  layout = "panel",
}: {
  className?: string;
  id?: string;
  /** `toolbar` = compact row for header (high-contrast text). */
  layout?: "panel" | "toolbar";
}) {
  const sport = useSelectedSport((s) => s.sport);
  const setSport = useSelectedSport((s) => s.setSport);

  if (layout === "toolbar") {
    return (
      <div
        className={cn(
          "flex flex-nowrap items-center gap-3",
          className,
        )}
      >
        <Label
          htmlFor={id}
          className="mb-0 inline-flex shrink-0 cursor-default items-center gap-2 text-sm font-medium leading-none text-foreground"
        >
          <Dumbbell className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          Sport
        </Label>
        <Select
          value={sport}
          onValueChange={(v) => setSport(v as typeof sport)}
        >
          <SelectTrigger
            id={id}
            className="h-10 w-44 max-w-[min(100vw-8rem,11rem)] shrink-0 grow-0 rounded-xl border-border bg-card text-sm font-medium text-foreground shadow-sm"
          >
            <SelectValue placeholder="Choose sport" />
          </SelectTrigger>
          <SelectContent>
            {SPORT_OPTIONS.map((opt) => (
              <SelectItem
                key={opt.id}
                value={opt.id}
                disabled={opt.comingSoon}
                textValue={opt.label}
              >
                <span className="flex items-center gap-2">
                  {opt.label}
                  {opt.comingSoon ? (
                    <span className="text-xs font-normal text-muted-foreground">
                      (soon)
                    </span>
                  ) : null}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-nowrap items-center gap-3">
        <Label
          htmlFor={id}
          className="mb-0 inline-flex shrink-0 cursor-default items-center gap-2 text-foreground"
        >
          <Dumbbell className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          Sport
        </Label>
        <Select
          value={sport}
          onValueChange={(v) => setSport(v as typeof sport)}
        >
          <SelectTrigger
            id={id}
            className="h-11 w-44 max-w-[min(100vw-8rem,12rem)] shrink-0 grow-0 rounded-xl border-border/80 bg-card font-medium text-foreground shadow-sm"
          >
            <SelectValue placeholder="Choose sport" />
          </SelectTrigger>
          <SelectContent>
            {SPORT_OPTIONS.map((opt) => (
              <SelectItem
                key={opt.id}
                value={opt.id}
                disabled={opt.comingSoon}
                textValue={opt.label}
              >
                <span className="flex items-center gap-2">
                  {opt.label}
                  {opt.comingSoon ? (
                    <span className="text-xs font-normal text-muted-foreground">
                      (soon)
                    </span>
                  ) : null}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <p className="text-xs text-muted-foreground">
        Courts, tournaments, open play, and your bookings filter to this sport.
        More sports are on the way.
      </p>
    </div>
  );
}

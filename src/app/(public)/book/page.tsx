"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calendar, ListFilter, X } from "lucide-react";
import CourtCard from "@/components/courts/CourtCard";
import EmptyState from "@/components/shared/EmptyState";
import PageHeader from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { Court } from "@/lib/types/courtly";


type CourtFiltersState = {
  typeFilter: string;
  cityFilter: string;
};

function defaultFilters(): CourtFiltersState {
  return { typeFilter: "all", cityFilter: "all" };
}

export default function PublicBookPage() {
  const [applied, setApplied] = useState<CourtFiltersState>(defaultFilters);
  const [draft, setDraft] = useState<CourtFiltersState>(defaultFilters);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: courts = [], isLoading } = useQuery<Court[]>({
    queryKey: ["public-courts", "active"],
    queryFn: async () => {
      const res = await fetch("/api/courts");
      if (!res.ok) throw new Error("Failed to load courts.");
      return res.json() as Promise<Court[]>;
    },
    staleTime: 60_000,
  });

  const venueCards = useMemo(() => {
    const byVenue = new Map<string, Court>();
    for (const court of courts) {
      if (!byVenue.has(court.venue_id)) byVenue.set(court.venue_id, court);
    }
    return [...byVenue.values()];
  }, [courts]);

  const uniqueCities = useMemo(
    () =>
      [...new Set(venueCards.map((c) => c.city).filter((c): c is string => !!c))].sort(
        (a, b) => a.localeCompare(b),
      ),
    [venueCards],
  );

  const filtered = useMemo(() => {
    return venueCards.filter((court) => {
      if (applied.typeFilter !== "all" && court.type !== applied.typeFilter) return false;
      if (applied.cityFilter !== "all" && court.city !== applied.cityFilter) return false;
      return true;
    });
  }, [venueCards, applied]);

  const appliedChips = useMemo(() => {
    const chips: Array<{ id: string; label: string; onRemove: () => void }> = [];
    if (applied.typeFilter !== "all") {
      chips.push({
        id: "type",
        label: `Type: ${applied.typeFilter}`,
        onRemove: () => setApplied((p) => ({ ...p, typeFilter: "all" })),
      });
    }
    if (applied.cityFilter !== "all") {
      chips.push({
        id: "place",
        label: `Place: ${applied.cityFilter}`,
        onRemove: () => setApplied((p) => ({ ...p, cityFilter: "all" })),
      });
    }
    return chips;
  }, [applied]);

  const applyDraft = () => {
    setApplied({ ...draft });
    setDialogOpen(false);
  };

  const resetDraft = () => setDraft(defaultFilters());
  const clearAll = () => {
    const empty = defaultFilters();
    setApplied(empty);
    setDraft(empty);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10 md:px-10">
      <PageHeader
        title="Book a Court"
        subtitle="Choose a venue, then pick your date and time slots."
      />

      <div className="mb-6 flex min-w-0 flex-row flex-nowrap items-center justify-between gap-2 sm:mb-8 sm:gap-3">
        <div
          className={cn(
            "flex min-w-0 flex-1 items-center gap-2",
            appliedChips.length > 0 &&
              "-mx-0.5 min-h-9 overflow-x-auto px-0.5 pb-0.5 [scrollbar-width:thin] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:pb-0",
          )}
        >
          {appliedChips.map((chip) => (
            <Badge
              key={chip.id}
              variant="secondary"
              className="h-7 shrink-0 gap-0.5 rounded-full pr-0.5 pl-2.5 font-normal"
            >
              <span className="max-w-[200px] truncate sm:max-w-[280px]">{chip.label}</span>
              <button
                type="button"
                onClick={chip.onRemove}
                className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={`Remove ${chip.label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>

        {!isLoading && (
        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {appliedChips.length > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0 whitespace-nowrap px-2 text-muted-foreground hover:text-foreground sm:px-3"
              onClick={clearAll}
            >
              Clear all
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="relative shrink-0"
            aria-label="Open filters"
            onClick={() => {
              setDraft({ ...applied });
              setDialogOpen(true);
            }}
          >
            <ListFilter className="h-4 w-4" />
            {appliedChips.length > 0 ? (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">
                {appliedChips.length}
              </span>
            ) : null}
          </Button>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent className="sm:max-w-sm" linkDescription>
              <DialogHeader>
                <DialogTitle>Filters</DialogTitle>
                <DialogDescription>
                  Adjust options, then tap Apply to update results.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="filter-type">Court type</Label>
                  <Select
                    value={draft.typeFilter}
                    onValueChange={(v) => setDraft((d) => ({ ...d, typeFilter: v }))}
                  >
                    <SelectTrigger id="filter-type">
                      <SelectValue placeholder="All types" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All types</SelectItem>
                      <SelectItem value="indoor">Indoor</SelectItem>
                      <SelectItem value="outdoor">Outdoor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="filter-place">Place</Label>
                  <Select
                    value={draft.cityFilter}
                    onValueChange={(v) => setDraft((d) => ({ ...d, cityFilter: v }))}
                  >
                    <SelectTrigger id="filter-place">
                      <SelectValue placeholder="All places" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All places</SelectItem>
                      {uniqueCities.map((city) => (
                        <SelectItem key={city} value={city}>
                          {city}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter className="flex-row flex-wrap justify-between gap-2">
                <Button type="button" variant="ghost" className="text-muted-foreground" onClick={resetDraft}>
                  Clear all
                </Button>
                <Button type="button" className="font-heading" onClick={applyDraft}>
                  Apply
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
        )}
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-3">
              <Skeleton className="h-48 w-full rounded-xl" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="No courts found"
          description={
            appliedChips.length > 0
              ? "No courts match your filters."
              : "No active courts are available right now."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((court, i) => (
            <CourtCard
              key={court.venue_id}
              court={court}
              bookHref={`/book/${court.id}`}
              priority={i === 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}

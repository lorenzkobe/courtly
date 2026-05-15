"use client";

import { useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Calendar, Heart, ListFilter, X } from "lucide-react";
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
import { courtlyApi } from "@/lib/api/courtly-client";
import { courtRateRange } from "@/lib/court-pricing";
import { formatPhpCompact } from "@/lib/format-currency";
import { formatAmenityLabel } from "@/lib/format-amenity";
import { useFavoriteVenueIds } from "@/hooks/use-favorite-venue-ids";
import { useSelectedSport } from "@/lib/stores/selected-sport";
import { queryKeys } from "@/lib/query/query-keys";
import { cn } from "@/lib/utils";

const ANY_VALUE = "__any__";

function buildTimeOptions(courts: { available_hours: { open: string; close: string } }[]) {
  const tokens = new Set<string>();
  for (const c of courts) {
    tokens.add(c.available_hours.open);
    tokens.add(c.available_hours.close);
  }
  for (let h = 6; h <= 23; h++) {
    tokens.add(`${String(h).padStart(2, "0")}:00`);
  }
  return [...tokens].sort((a, b) => a.localeCompare(b));
}

function formatHour(token: string): string {
  const h = parseInt(token.split(":")[0], 10);
  if (h === 0) return "12 AM";
  if (h === 12) return "12 PM";
  if (h < 12) return `${h} AM`;
  return `${h - 12} PM`;
}

type CourtFiltersState = {
  typeFilter: string;
  favoritesOnly: boolean;
  cityFilter: string;
  openAt: string;
  closeAt: string;
  rateMin: number | null;
  rateMax: number | null;
  amenityPick: Set<string>;
};

function defaultCourtFilters(): CourtFiltersState {
  return {
    typeFilter: "all",
    favoritesOnly: false,
    cityFilter: "all",
    openAt: "",
    closeAt: "",
    rateMin: null,
    rateMax: null,
    amenityPick: new Set(),
  };
}

function cloneCourtFilters(s: CourtFiltersState): CourtFiltersState {
  return {
    ...s,
    amenityPick: new Set(s.amenityPick),
  };
}

type AppliedChip = {
  id: string;
  label: string;
  onRemove: () => void;
};

export default function CourtsPage() {
  const [applied, setApplied] = useState<CourtFiltersState>(() =>
    defaultCourtFilters(),
  );
  const [draft, setDraft] = useState<CourtFiltersState>(() =>
    defaultCourtFilters(),
  );
  const [dialogOpen, setDialogOpen] = useState(false);

  const openFilterDialog = useCallback(() => {
    if (!dialogOpen) {
      setDraft(cloneCourtFilters(applied));
    }
    setDialogOpen(true);
  }, [applied, dialogOpen]);

  const applyDraft = useCallback(() => {
    setApplied(cloneCourtFilters(draft));
    setDialogOpen(false);
  }, [draft]);

  const resetDraft = useCallback(() => {
    setDraft(defaultCourtFilters());
  }, []);

  const clearAllApplied = useCallback(() => {
    const empty = defaultCourtFilters();
    setApplied(empty);
    if (dialogOpen) {
      setDraft(cloneCourtFilters(empty));
    }
  }, [dialogOpen]);

  const { favoriteIds, toggleFavorite, isFavorite } = useFavoriteVenueIds();
  const selectedSport = useSelectedSport((s) => s.sport);

  const { data: courts = [], isLoading } = useQuery({
    queryKey: queryKeys.courts.list({
      status: "active",
      sport: selectedSport,
    }),
    queryFn: async () => {
      const { data } = await courtlyApi.courts.list({
        status: "active",
        sport: selectedSport,
      });
      return data;
    },
  });

  const venueCards = useMemo(() => {
    const byVenue = new Map<string, (typeof courts)[number]>();
    for (const court of courts) {
      if (!byVenue.has(court.venue_id)) {
        byVenue.set(court.venue_id, court);
      }
    }
    return [...byVenue.values()];
  }, [courts]);

  const uniqueCities = useMemo(
    () =>
      [...new Set(venueCards.map((court) => court.city).filter((c): c is string => !!c))].sort(
        (a, b) => a.localeCompare(b),
      ),
    [venueCards],
  );

  const timeOptions = useMemo(() => buildTimeOptions(venueCards), [venueCards]);

  const uniqueAmenities = useMemo(() => {
    const amenitySet = new Set<string>();
    for (const court of venueCards) {
      for (const amenity of court.amenities ?? []) amenitySet.add(amenity);
    }
    return [...amenitySet].sort((a, b) => a.localeCompare(b));
  }, [venueCards]);

  const sortedRates = useMemo(() => {
    const rateSet = new Set<number>();
    for (const court of venueCards) {
      const { min, max } = courtRateRange(court);
      rateSet.add(min);
      rateSet.add(max);
    }
    const list = [...rateSet].sort((a, b) => a - b);
    return list.length ? list : [40, 45, 50, 55];
  }, [venueCards]);

  const {
    typeFilter,
    favoritesOnly,
    cityFilter,
    openAt,
    closeAt,
    rateMin,
    rateMax,
    amenityPick,
  } = applied;

  const filtered = useMemo(() => {
    return venueCards.filter((court) => {
      if (typeFilter !== "all" && court.type !== typeFilter) return false;
      if (favoritesOnly && !favoriteIds.has(court.venue_id)) return false;
      if (cityFilter !== "all" && court.city !== cityFilter) return false;

      if (openAt && court.available_hours.open !== openAt) return false;
      if (closeAt && court.available_hours.close !== closeAt) return false;

      let rLo = rateMin;
      let rHi = rateMax;
      if (rLo != null && rHi != null && rLo > rHi) [rLo, rHi] = [rHi, rLo];
      const { min: cRMin, max: cRMax } = courtRateRange(court);
      if (rLo != null && cRMax < rLo) return false;
      if (rHi != null && cRMin > rHi) return false;

      if (amenityPick.size > 0) {
        for (const amenity of amenityPick) {
          if (!court.amenities?.includes(amenity)) return false;
        }
      }
      return true;
    });
  }, [
    venueCards,
    typeFilter,
    favoritesOnly,
    favoriteIds,
    cityFilter,
    openAt,
    closeAt,
    rateMin,
    rateMax,
    amenityPick,
  ]);

  const toggleDraftAmenity = (a: string) => {
    setDraft((d) => {
      const next = new Set(d.amenityPick);
      if (next.has(a)) next.delete(a);
      else next.add(a);
      return { ...d, amenityPick: next };
    });
  };

  const appliedChips = useMemo((): AppliedChip[] => {
    const chips: AppliedChip[] = [];
    if (applied.typeFilter !== "all") {
      chips.push({
        id: "type",
        label: `Type: ${applied.typeFilter}`,
        onRemove: () =>
          setApplied((p) => ({ ...p, typeFilter: "all" })),
      });
    }
    if (applied.favoritesOnly) {
      chips.push({
        id: "favorites",
        label: "Favorites",
        onRemove: () =>
          setApplied((p) => ({ ...p, favoritesOnly: false })),
      });
    }
    if (applied.cityFilter !== "all") {
      chips.push({
        id: "place",
        label: `Place: ${applied.cityFilter}`,
        onRemove: () =>
          setApplied((p) => ({ ...p, cityFilter: "all" })),
      });
    }
    if (applied.openAt) {
      chips.push({
        id: "open-at",
        label: `Opens: ${formatHour(applied.openAt)}`,
        onRemove: () => setApplied((p) => ({ ...p, openAt: "" })),
      });
    }
    if (applied.closeAt) {
      chips.push({
        id: "close-at",
        label: `Closes: ${formatHour(applied.closeAt)}`,
        onRemove: () => setApplied((p) => ({ ...p, closeAt: "" })),
      });
    }
    if (applied.rateMin != null || applied.rateMax != null) {
      const label =
        applied.rateMin != null && applied.rateMax != null
          ? `Rate: ${formatPhpCompact(Math.min(applied.rateMin, applied.rateMax))}–${formatPhpCompact(Math.max(applied.rateMin, applied.rateMax))}/hr`
          : applied.rateMin != null
            ? `Rate: ≥${formatPhpCompact(applied.rateMin)}/hr`
            : `Rate: ≤${formatPhpCompact(applied.rateMax!)}/hr`;
      chips.push({
        id: "rate",
        label,
        onRemove: () =>
          setApplied((p) => ({ ...p, rateMin: null, rateMax: null })),
      });
    }
    for (const a of applied.amenityPick) {
      chips.push({
        id: `amenity-${a}`,
        label: formatAmenityLabel(a),
        onRemove: () =>
          setApplied((p) => {
            const next = new Set(p.amenityPick);
            next.delete(a);
            return { ...p, amenityPick: next };
          }),
      });
    }
    return chips;
  }, [applied]);

  const activeFilterCount = appliedChips.length;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8 md:px-10">
      <PageHeader
        title="Book a Court"
        subtitle="Choose an establishment court number, then pick your date and time"
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
              <span className="max-w-[200px] truncate sm:max-w-[280px]">
                {chip.label}
              </span>
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
          {activeFilterCount > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="shrink-0 whitespace-nowrap px-2 text-muted-foreground hover:text-foreground sm:px-3"
              onClick={clearAllApplied}
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
            onClick={openFilterDialog}
          >
            <ListFilter className="h-4 w-4" />
            {activeFilterCount > 0 ? (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">
                {activeFilterCount}
              </span>
            ) : null}
          </Button>

          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent
              className={cn(
                "max-h-[min(92dvh,44rem)] sm:max-w-lg lg:left-[calc(50vw+8rem)]",
              )}
              contentClassName="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden p-0"
              linkDescription
            >
              <DialogHeader className="shrink-0 space-y-1 border-b border-border px-4 py-4 text-left sm:px-6">
                <DialogTitle>Filters</DialogTitle>
                <DialogDescription>
                  Adjust options below, then tap Apply to update results.
                  Closing without applying keeps your previous filters.
                </DialogDescription>
              </DialogHeader>

              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
                <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-2">
                    <Heart
                      className={cn(
                        "h-4 w-4 shrink-0",
                        draft.favoritesOnly
                          ? "fill-primary text-primary"
                          : "text-muted-foreground",
                      )}
                    />
                    <div className="min-w-0">
                      <Label
                        htmlFor="filter-favorites"
                        className="text-sm font-medium"
                      >
                        Favorites only
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        Show courts you have starred
                      </p>
                    </div>
                  </div>
                  <button
                    id="filter-favorites"
                    type="button"
                    role="switch"
                    aria-checked={draft.favoritesOnly}
                    aria-label="Show favorites only"
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        favoritesOnly: !d.favoritesOnly,
                      }))
                    }
                    className={cn(
                      "relative flex h-7 w-12 shrink-0 items-center self-end px-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:self-center",
                      "rounded-full border transition-colors",
                      draft.favoritesOnly
                        ? "border-primary bg-primary"
                        : "border-input bg-muted",
                    )}
                  >
                    <span
                      className={cn(
                        "pointer-events-none h-5 w-5 rounded-full bg-background shadow-sm transition-transform",
                        draft.favoritesOnly
                          ? "translate-x-[26px]"
                          : "translate-x-0",
                      )}
                    />
                  </button>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="filter-type">Court type</Label>
                  <Select
                    value={draft.typeFilter}
                    onValueChange={(v) =>
                      setDraft((d) => ({ ...d, typeFilter: v }))
                    }
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
                    onValueChange={(v) =>
                      setDraft((d) => ({ ...d, cityFilter: v }))
                    }
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

                <div className="space-y-2">
                  <Label htmlFor="open-at">Opening time</Label>
                  <Select
                    value={draft.openAt || ANY_VALUE}
                    onValueChange={(v) =>
                      setDraft((d) => ({
                        ...d,
                        openAt: v === ANY_VALUE ? "" : v,
                      }))
                    }
                  >
                    <SelectTrigger id="open-at">
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY_VALUE}>Any</SelectItem>
                      {timeOptions.map((time) => (
                        <SelectItem key={time} value={time}>
                          {formatHour(time)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="close-at">Closing time</Label>
                  <Select
                    value={draft.closeAt || ANY_VALUE}
                    onValueChange={(v) =>
                      setDraft((d) => ({
                        ...d,
                        closeAt: v === ANY_VALUE ? "" : v,
                      }))
                    }
                  >
                    <SelectTrigger id="close-at">
                      <SelectValue placeholder="Any" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ANY_VALUE}>Any</SelectItem>
                      {timeOptions.map((time) => (
                        <SelectItem key={time} value={time}>
                          {formatHour(time)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Hourly rate</p>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs font-normal">Min (₱/hr)</Label>
                      <Select
                        value={
                          draft.rateMin == null ? ANY_VALUE : String(draft.rateMin)
                        }
                        onValueChange={(v) =>
                          setDraft((d) => ({
                            ...d,
                            rateMin: v === ANY_VALUE ? null : Number(v),
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Any" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={ANY_VALUE}>Any</SelectItem>
                          {sortedRates.map((rate) => (
                            <SelectItem key={`min-${rate}`} value={String(rate)}>
                              {formatPhpCompact(rate)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs font-normal">Max (₱/hr)</Label>
                      <Select
                        value={
                          draft.rateMax == null ? ANY_VALUE : String(draft.rateMax)
                        }
                        onValueChange={(v) =>
                          setDraft((d) => ({
                            ...d,
                            rateMax: v === ANY_VALUE ? null : Number(v),
                          }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Any" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={ANY_VALUE}>Any</SelectItem>
                          {sortedRates.map((rate) => (
                            <SelectItem key={`max-${rate}`} value={String(rate)}>
                              {formatPhpCompact(rate)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {uniqueAmenities.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Amenities</p>
                    <p className="text-xs text-muted-foreground">
                      Court must include all selected.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {uniqueAmenities.map((amenity) => {
                        const on = draft.amenityPick.has(amenity);
                        return (
                          <button
                            key={amenity}
                            type="button"
                            onClick={() => toggleDraftAmenity(amenity)}
                            className={cn(
                              "rounded-full border border-border px-3 py-1.5 text-xs font-medium capitalize transition-colors hover:bg-accent",
                              on &&
                                "border-primary/50 bg-primary/10 text-primary",
                            )}
                          >
                            {formatAmenityLabel(amenity)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
              </div>

              <DialogFooter className="shrink-0 flex-row flex-wrap gap-2 border-t border-border px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:justify-between sm:px-6">
                <Button
                  type="button"
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={resetDraft}
                >
                  Clear all
                </Button>
                <Button
                  type="button"
                  className="font-heading"
                  onClick={applyDraft}
                >
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
          description="No courts match your filters."
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((court, i) => (
            <CourtCard
              key={court.venue_id}
              court={court}
              isFavorite={isFavorite(court.venue_id)}
              onToggleFavorite={() => toggleFavorite(court.venue_id)}
              priority={i === 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}

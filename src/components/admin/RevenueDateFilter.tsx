"use client";

import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useMemo, useState } from "react";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

function parseIsoToLocalDate(iso: string): Date | undefined {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined;
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

type Props = {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onApply: () => void;
  onClear: () => void;
  applyDisabled?: boolean;
  className?: string;
};

export function RevenueDateFilter({
  from,
  to,
  onFromChange,
  onToChange,
  onApply,
  onClear,
  applyDisabled = false,
  className,
}: Props) {
  const [open, setOpen] = useState(false);
  const fromDate = parseIsoToLocalDate(from);
  const toDate = parseIsoToLocalDate(to);

  const selectedRange: DateRange | undefined = useMemo(() => {
    if (!fromDate && !toDate) return undefined;
    return { from: fromDate, to: toDate ?? fromDate };
  }, [fromDate, toDate]);

  const summaryLabel = useMemo(() => {
    if (fromDate && toDate) {
      return `${format(fromDate, "MMM d, yyyy")} – ${format(toDate, "MMM d, yyyy")}`;
    }
    if (fromDate) {
      return `${format(fromDate, "MMM d, yyyy")} – …`;
    }
    return "Select date range";
  }, [fromDate, toDate]);

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/90 p-4 shadow-sm backdrop-blur-sm sm:flex-row sm:flex-wrap sm:items-end",
        className,
      )}
    >
      <div className="min-w-0 flex-1 sm:max-w-md">
        <Label htmlFor="revenue-date-range" className="text-xs font-medium text-muted-foreground">
          Reservation date range
        </Label>
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              id="revenue-date-range"
              type="button"
              variant="outline"
              className={cn(
                "mt-1.5 h-11 w-full justify-start gap-2.5 rounded-xl border-border/80 bg-background px-3 text-left text-sm font-normal shadow-sm transition-[box-shadow,background-color] hover:bg-muted/50 hover:shadow-md",
                !fromDate && !toDate && "text-muted-foreground",
              )}
            >
              <CalendarIcon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
              <span className="truncate">{summaryLabel}</span>
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-auto overflow-hidden border-border/80 p-0 shadow-xl"
            align="start"
          >
            <Calendar
              mode="range"
              numberOfMonths={2}
              pagedNavigation
              selected={selectedRange}
              defaultMonth={fromDate ?? toDate ?? new Date()}
              onSelect={(range) => {
                if (!range) {
                  onFromChange("");
                  onToChange("");
                  return;
                }
                if (range.from) {
                  onFromChange(format(range.from, "yyyy-MM-dd"));
                } else {
                  onFromChange("");
                }
                if (range.to) {
                  onToChange(format(range.to, "yyyy-MM-dd"));
                } else if (range.from) {
                  onToChange("");
                } else {
                  onToChange("");
                }
              }}
              initialFocus
            />
            <p className="border-t border-border/60 px-3 py-2 text-xs text-muted-foreground">
              Tap a start date, then an end date (inclusive). Range highlights in the calendar.
            </p>
          </PopoverContent>
        </Popover>
      </div>
      <Button
        type="button"
        className="h-11 shrink-0 rounded-xl font-medium"
        onClick={onApply}
        disabled={applyDisabled}
      >
        Apply
      </Button>
      <Button
        type="button"
        variant="secondary"
        className="h-11 shrink-0 rounded-xl font-medium"
        onClick={onClear}
      >
        All dates
      </Button>
    </div>
  );
}

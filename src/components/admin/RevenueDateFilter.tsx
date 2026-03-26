"use client";

import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { useState } from "react";
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

type DateFieldProps = {
  label: string;
  htmlId: string;
  value: string;
  onChange: (iso: string) => void;
};

function DateField({ label, htmlId, value, onChange }: DateFieldProps) {
  const [open, setOpen] = useState(false);
  const selected = parseIsoToLocalDate(value);

  return (
    <div className="min-w-0 flex-1 sm:max-w-60">
      <Label htmlFor={htmlId} className="text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={htmlId}
            type="button"
            variant="outline"
            className={cn(
              "mt-1.5 h-11 w-full justify-start gap-2.5 rounded-xl border-border/80 bg-background px-3 text-left text-sm font-normal shadow-sm transition-[box-shadow,background-color] hover:bg-muted/50 hover:shadow-md",
              !value && "text-muted-foreground",
            )}
          >
            <CalendarIcon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span className="truncate">
              {selected ? format(selected, "MMMM d, yyyy") : "Select date"}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-auto overflow-hidden border-border/80 p-0 shadow-xl"
          align="start"
        >
          <Calendar
            mode="single"
            selected={selected}
            onSelect={(d) => {
              if (d) {
                onChange(format(d, "yyyy-MM-dd"));
                setOpen(false);
              }
            }}
            initialFocus
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

type Props = {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onClear: () => void;
  className?: string;
};

export function RevenueDateFilter({
  from,
  to,
  onFromChange,
  onToChange,
  onClear,
  className,
}: Props) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/90 p-4 shadow-sm backdrop-blur-sm sm:flex-row sm:flex-wrap sm:items-end",
        className,
      )}
    >
      <DateField
        label="From (reservation date)"
        htmlId="revenue-date-from"
        value={from}
        onChange={onFromChange}
      />
      <DateField
        label="To (inclusive)"
        htmlId="revenue-date-to"
        value={to}
        onChange={onToChange}
      />
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

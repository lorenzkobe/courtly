"use client";

import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

/** Styled native time input for venue hours (HH:mm). */
export function VenueTimeInput({ id, value, onChange, className }: Props) {
  const displayValue =
    value.length >= 5 ? value.slice(0, 5) : value ? `${value}:00`.slice(0, 5) : "07:00";

  return (
    <div
      className={cn(
        "flex h-11 items-center gap-2 rounded-xl border border-border/80 bg-card px-3 shadow-sm transition-shadow focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/20",
        className,
      )}
    >
      <Clock className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      <input
        id={id}
        type="time"
        step={3600}
        value={displayValue}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 bg-transparent text-sm font-medium tabular-nums text-foreground outline-none scheme-dark"
      />
    </div>
  );
}

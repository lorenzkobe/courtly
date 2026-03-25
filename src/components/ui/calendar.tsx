"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import type { DayPickerProps } from "react-day-picker";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = DayPickerProps;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  /** Puts prev/next beside the month title so they stay clickable (default layout is covered by the grid). */
  navLayout = "around",
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      navLayout={navLayout}
      className={cn("p-3", className)}
      classNames={{
        root: cn("w-full max-w-full"),
        months: "relative flex w-full flex-col gap-4",
        month: "relative flex w-full min-w-0 flex-col gap-3",
        month_caption:
          "relative mb-1 flex min-h-10 w-full flex-nowrap items-center justify-center px-1 sm:px-0",
        caption_label:
          "pointer-events-none z-0 max-w-full truncate px-10 text-center text-sm font-semibold text-foreground",
        button_previous: cn(
          buttonVariants({ variant: "outline" }),
          /* vertical centering: see globals.css rdp[data-nav-layout="around"] */
          "absolute start-1 z-20 size-8 bg-background p-0 hover:bg-muted sm:start-2",
        ),
        button_next: cn(
          buttonVariants({ variant: "outline" }),
          "absolute end-1 z-20 size-8 bg-background p-0 hover:bg-muted sm:end-2",
        ),
        month_grid: "w-full border-collapse",
        weekdays: "mb-1 flex w-full",
        weekday:
          "flex-1 text-center text-[0.7rem] font-medium uppercase tracking-wide text-muted-foreground",
        week: "mt-1 flex w-full",
        day: "flex flex-1 justify-center p-0 text-center text-sm focus-within:relative focus-within:z-20",
        day_button: cn(
          buttonVariants({ variant: "ghost" }),
          "size-9 max-w-full p-0 font-medium text-foreground aria-selected:opacity-100",
        ),
        selected:
          "[&_button]:!bg-primary [&_button]:!text-primary-foreground [&_button]:shadow-sm [&_button]:hover:!bg-primary [&_button]:hover:!text-primary-foreground",
        today:
          "[&_button]:bg-accent/70 [&_button]:font-semibold [&_button]:text-accent-foreground",
        outside: "text-muted-foreground/70 [&_button]:text-muted-foreground/80",
        disabled: "text-muted-foreground/50 [&_button]:opacity-40",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === "left" ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          ),
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };

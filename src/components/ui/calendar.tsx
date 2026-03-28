"use client";

import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import type { DayPickerProps } from "react-day-picker";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

/** Keep bundled rdp-* classes so react-day-picker/style.css layout (esp. dropdown selects) still applies. */
function rdp(slot: string, ...tw: (string | boolean | undefined)[]) {
  return cn(`rdp-${slot}`, ...tw.filter(Boolean));
}

/** shadcn-style calendar: styles {@link DayPicker} from react-day-picker. */
export type CalendarProps = DayPickerProps & {
  /**
   * Month + year `<select>` dropdowns, ~120-year range ending this month, arrows hidden.
   * Use for birthdate fields; booking calendars can omit this.
   */
  birthdatePicker?: boolean;
};

function birthdateBounds() {
  const now = new Date();
  return {
    startMonth: new Date(now.getFullYear() - 120, 0, 1),
    endMonth: new Date(now.getFullYear(), now.getMonth(), 1),
  };
}

function Calendar({
  birthdatePicker = false,
  className,
  classNames,
  showOutsideDays = true,
  navLayout = "around",
  captionLayout,
  hideNavigation,
  startMonth,
  endMonth,
  reverseYears,
  ...props
}: CalendarProps) {
  const bounds = birthdatePicker ? birthdateBounds() : null;
  const resolvedCaptionLayout = birthdatePicker ? "dropdown" : captionLayout;
  const resolvedHideNavigation = birthdatePicker ? true : hideNavigation;
  const resolvedStartMonth = startMonth ?? bounds?.startMonth;
  const resolvedEndMonth = endMonth ?? bounds?.endMonth;
  const resolvedReverseYears = birthdatePicker ? true : reverseYears;

  const isCaptionDropdown =
    birthdatePicker ||
    (typeof resolvedCaptionLayout === "string" &&
      resolvedCaptionLayout.startsWith("dropdown"));

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      navLayout={navLayout}
      captionLayout={resolvedCaptionLayout}
      hideNavigation={resolvedHideNavigation}
      startMonth={resolvedStartMonth}
      endMonth={resolvedEndMonth}
      reverseYears={resolvedReverseYears}
      className={cn("p-2 sm:p-2.5", className)}
      classNames={{
        root: rdp("root", "w-full max-w-full"),
        months: rdp("months", "relative flex w-full flex-col gap-2"),
        month: rdp("month", "relative flex w-full min-w-0 flex-col gap-2"),
        month_caption: rdp(
          "month_caption",
          "relative mb-0.5 flex min-h-9 w-full flex-nowrap items-center justify-center px-0.5 sm:px-0",
          isCaptionDropdown && "mb-1 min-h-10 px-1.5",
        ),
        caption_label: rdp(
          "caption_label",
          isCaptionDropdown
            ? "pointer-events-none inline-flex items-center gap-1 whitespace-nowrap text-sm font-medium text-foreground [&_svg]:size-3 [&_svg]:shrink-0 [&_svg]:opacity-60"
            : "pointer-events-none z-0 max-w-full truncate px-9 text-center text-sm font-semibold text-foreground",
        ),
        dropdowns: rdp(
          "dropdowns",
          "flex flex-wrap items-center justify-center gap-2",
        ),
        dropdown_root: rdp(
          "dropdown_root",
          "h-9 min-h-9 rounded-md border border-input bg-background px-2.5 text-sm shadow-sm",
        ),
        /* Select uses rdp-dropdown + these; do not set h-/max-w- on the select — it must stay full-bleed over the label per rdp/style.css */
        months_dropdown: rdp("months_dropdown"),
        years_dropdown: rdp("years_dropdown"),
        button_previous: cn(
          rdp("button_previous"),
          buttonVariants({ variant: "outline" }),
          "absolute start-1 z-20 size-8 bg-background p-0 hover:bg-muted sm:start-2",
        ),
        button_next: cn(
          rdp("button_next"),
          buttonVariants({ variant: "outline" }),
          "absolute end-1 z-20 size-8 bg-background p-0 hover:bg-muted sm:end-2",
        ),
        month_grid: rdp("month_grid", "w-full border-collapse"),
        weekdays: rdp("weekdays", "mb-0.5 flex w-full"),
        weekday: rdp(
          "weekday",
          "flex-1 text-center text-[0.65rem] font-medium uppercase tracking-wide text-muted-foreground",
        ),
        week: rdp("week", "mt-0.5 flex w-full"),
        day: rdp(
          "day",
          "flex flex-1 justify-center p-0 text-center text-[0.8125rem] focus-within:relative focus-within:z-20",
        ),
        day_button: cn(
          rdp("day_button"),
          buttonVariants({ variant: "ghost" }),
          "size-8 max-w-full p-0 font-medium text-foreground aria-selected:opacity-100",
        ),
        selected: rdp(
          "selected",
          "[&_button]:!bg-primary [&_button]:!text-primary-foreground [&_button]:shadow-sm [&_button]:hover:!bg-primary [&_button]:hover:!text-primary-foreground",
        ),
        today: rdp(
          "today",
          "[&_button]:bg-accent/70 [&_button]:font-semibold [&_button]:text-accent-foreground",
        ),
        outside: rdp(
          "outside",
          "text-muted-foreground/70 [&_button]:text-muted-foreground/80",
        ),
        disabled: rdp("disabled", "text-muted-foreground/50 [&_button]:opacity-40"),
        hidden: rdp("hidden", "invisible"),
        ...classNames,
      }}
      components={{
        Chevron: ({ orientation, className, ...rest }) =>
          orientation === "left" ? (
            <ChevronLeft className={cn("h-4 w-4", className)} {...rest} />
          ) : orientation === "right" ? (
            <ChevronRight className={cn("h-4 w-4", className)} {...rest} />
          ) : (
            <ChevronDown className={cn("h-4 w-4 opacity-70", className)} {...rest} />
          ),
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };

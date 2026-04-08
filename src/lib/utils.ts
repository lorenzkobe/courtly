import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Title-case UI label for API/snake_case status values (e.g. `confirmed` → `Confirmed`). */
export function formatStatusLabel(status: string): string {
  return status
    .split("_")
    .map((part) =>
      part.length === 0
        ? ""
        : part[0].toUpperCase() + part.slice(1).toLowerCase(),
    )
    .join(" ");
}

const BOOKING_STATUS_UI_LABELS: Record<string, string> = {
  pending_confirmation: "Waiting for venue confirmation",
};

/** Player- and admin-facing label for `booking.status` (and segment status). */
export function formatBookingStatusLabel(status: string): string {
  const mapped = BOOKING_STATUS_UI_LABELS[status];
  if (mapped) return mapped;
  return formatStatusLabel(status);
}

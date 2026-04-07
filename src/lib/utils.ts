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

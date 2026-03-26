import type { CourtSport } from "@/lib/types/courtly";

export type SportOption = {
  id: CourtSport;
  label: string;
  /** Shown in UI when sport is not yet available */
  comingSoon?: boolean;
};

export const SPORT_OPTIONS: SportOption[] = [
  { id: "pickleball", label: "Pickleball" },
  { id: "tennis", label: "Tennis", comingSoon: true },
  { id: "badminton", label: "Badminton", comingSoon: true },
  { id: "padel", label: "Padel", comingSoon: true },
];

export const DEFAULT_SPORT: CourtSport = "pickleball";

export function isSportAvailable(id: CourtSport): boolean {
  return SPORT_OPTIONS.find((s) => s.id === id)?.comingSoon !== true;
}

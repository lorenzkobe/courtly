"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CourtSport } from "@/lib/types/courtly";
import { DEFAULT_SPORT, isSportAvailable } from "@/lib/sports";

type SportState = {
  sport: CourtSport;
  setSport: (sport: CourtSport) => void;
};

export const useSelectedSport = create<SportState>()(
  persist(
    (set) => ({
      sport: DEFAULT_SPORT,
      setSport: (sport) => {
        if (!isSportAvailable(sport)) return;
        set({ sport });
      },
    }),
    { name: "courtly-selected-sport" },
  ),
);

"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

const norm = (s: string) => s.trim().toLowerCase();

const EMPTY_LIST: string[] = [];

type State = {
  /** Signed-in email → custom amenity labels (unique, case-insensitive). */
  byEmail: Record<string, string[]>;
  addUniqueForEmail: (email: string, label: string) => boolean;
  mergeCourtAmenitiesForEmail: (
    email: string,
    labels: string[],
    isPreset: (raw: string) => boolean,
  ) => void;
  removeSavedForEmail: (email: string, label: string) => void;
  getSavedForEmail: (email: string) => string[];
};

export const useAdminCustomAmenities = create<State>()(
  persist(
    (set, get) => ({
      byEmail: {},

      getSavedForEmail: (email) => {
        if (!email) return EMPTY_LIST;
        return get().byEmail[email] ?? EMPTY_LIST;
      },

      addUniqueForEmail: (email, label) => {
        const trimmedLabel = label.trim();
        if (!email || !trimmedLabel) return false;
        const normalizedKey = norm(trimmedLabel);
        const cur = get().byEmail[email] ?? EMPTY_LIST;
        if (cur.some((amenity) => norm(amenity) === normalizedKey)) return false;
        set({
          byEmail: { ...get().byEmail, [email]: [...cur, trimmedLabel] },
        });
        return true;
      },

      mergeCourtAmenitiesForEmail: (email, labels, isPreset) => {
        if (!email) return;
        for (const raw of labels) {
          if (isPreset(raw)) continue;
          get().addUniqueForEmail(email, raw);
        }
      },

      removeSavedForEmail: (email, label) => {
        if (!email) return;
        const normalizedKey = norm(label);
        const cur = get().byEmail[email] ?? EMPTY_LIST;
        const next = cur.filter((amenity) => norm(amenity) !== normalizedKey);
        set({
          byEmail: { ...get().byEmail, [email]: next },
        });
      },
    }),
    { name: "courtly-admin-custom-amenities" },
  ),
);

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
        const t = label.trim();
        if (!email || !t) return false;
        const k = norm(t);
        const cur = get().byEmail[email] ?? EMPTY_LIST;
        if (cur.some((x) => norm(x) === k)) return false;
        set({
          byEmail: { ...get().byEmail, [email]: [...cur, t] },
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
        const k = norm(label);
        const cur = get().byEmail[email] ?? EMPTY_LIST;
        const next = cur.filter((x) => norm(x) !== k);
        set({
          byEmail: { ...get().byEmail, [email]: next },
        });
      },
    }),
    { name: "courtly-admin-custom-amenities" },
  ),
);

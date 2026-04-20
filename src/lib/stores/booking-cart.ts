"use client";

import { create } from "zustand";
import { hourFromTime } from "@/lib/booking-range";
import { trackBookingCartEvent } from "@/lib/bookings/booking-cart-analytics";
import type { CourtSport } from "@/lib/types/courtly";

export type BookingCartItem = {
  id: string;
  venueId: string;
  venueName: string;
  courtId: string;
  courtName: string;
  sport: CourtSport;
  date: string;
  slots: string[];
  notes?: string;
};

type AddItemInput = Omit<BookingCartItem, "id" | "slots"> & { slots: string[] };

type BookingCartState = {
  venueId: string | null;
  venueName: string | null;
  items: BookingCartItem[];
  addOrMergeItem: (input: AddItemInput) => { ok: true } | { ok: false; reason: string };
  removeItem: (itemId: string) => void;
  clearCart: () => void;
};

function makeItemId(courtId: string, date: string) {
  return `${courtId}:${date}`;
}

function normalizeSlots(slots: string[]): string[] {
  return Array.from(new Set(slots)).sort((a, b) => hourFromTime(a) - hourFromTime(b));
}

export const useBookingCart = create<BookingCartState>()((set, get) => ({
      venueId: null,
      venueName: null,
      items: [],
      addOrMergeItem: (input) => {
        const current = get();
        if (
          current.venueId &&
          current.venueId !== input.venueId &&
          current.items.length > 0
        ) {
          return {
            ok: false as const,
            reason: "Cart can only contain courts from one venue at a time.",
          };
        }

        const id = makeItemId(input.courtId, input.date);
        const normalizedIncoming = normalizeSlots(input.slots);
        if (normalizedIncoming.length === 0) {
          return {
            ok: false as const,
            reason: "Select at least one available time slot first.",
          };
        }

        const existing = current.items.find((item) => item.id === id);
        if (existing) {
          const updatedSlots = normalizeSlots(normalizedIncoming);
          const merged: BookingCartItem = {
            ...existing,
            slots: updatedSlots,
            notes: input.notes?.trim() || existing.notes,
          };
          set((state) => ({
            venueId: input.venueId,
            venueName: input.venueName,
            items: state.items.map((item) => (item.id === id ? merged : item)),
          }));
          trackBookingCartEvent("cart_item_merged", {
            venueId: input.venueId,
            cartSize: current.items.length,
            courtId: input.courtId,
            date: input.date,
            slotsNow: updatedSlots.length,
          });
          return { ok: true as const };
        }

        const nextItem: BookingCartItem = {
          id,
          venueId: input.venueId,
          venueName: input.venueName,
          courtId: input.courtId,
          courtName: input.courtName,
          sport: input.sport,
          date: input.date,
          slots: normalizedIncoming,
          notes: input.notes?.trim() || undefined,
        };
        set((state) => ({
          venueId: input.venueId,
          venueName: input.venueName,
          items: [...state.items, nextItem],
        }));
        trackBookingCartEvent("cart_item_added", {
          venueId: input.venueId,
          cartSize: current.items.length + 1,
          courtId: input.courtId,
          date: input.date,
          slotsAdded: normalizedIncoming.length,
        });
        return { ok: true as const };
      },
      removeItem: (itemId) => {
        set((state) => {
          const items = state.items.filter((item) => item.id !== itemId);
          const first = items[0];
          trackBookingCartEvent("cart_item_removed", {
            removedItemId: itemId,
            cartSize: items.length,
          });
          return {
            items,
            venueId: first?.venueId ?? null,
            venueName: first?.venueName ?? null,
          };
        });
      },
      clearCart: () => {
        set({ venueId: null, venueName: null, items: [] });
        trackBookingCartEvent("cart_cleared", {});
      },
}));

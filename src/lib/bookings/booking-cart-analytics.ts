"use client";

export type BookingCartEventName =
  | "cart_item_added"
  | "cart_item_merged"
  | "cart_item_removed"
  | "cart_cleared"
  | "cart_checkout_started"
  | "cart_checkout_succeeded"
  | "cart_checkout_conflict"
  | "cart_checkout_failed";

export function trackBookingCartEvent(
  event: BookingCartEventName,
  detail: Record<string, unknown>,
) {
  if (typeof window === "undefined") return;
  const payload = { event, ...detail, at: new Date().toISOString() };
  window.dispatchEvent(
    new CustomEvent("courtly:booking-cart", {
      detail: payload,
    }),
  );
  if (process.env.NODE_ENV !== "production") {
    // Local-only debug signal for funnel verification during rollout.
    console.debug("[booking-cart]", payload);
  }
}

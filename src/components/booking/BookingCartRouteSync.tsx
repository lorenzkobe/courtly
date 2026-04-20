"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { useBookingCart } from "@/lib/stores/booking-cart";

const BOOKING_PAGE = /^\/courts\/[^/]+\/book$/;
const CART_PAGE = /^\/courts\/cart$/;

function isBookingFlowPath(pathname: string) {
  return BOOKING_PAGE.test(pathname) || CART_PAGE.test(pathname);
}

/** Clears the in-memory booking cart when navigating away from book/cart (SPA). Full page refresh also clears. */
export function BookingCartRouteSync() {
  const pathname = usePathname();
  const clearCart = useBookingCart((s) => s.clearCart);
  const prevRef = useRef<string | null>(null);

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = pathname;
    if (prev === null) return;
    if (isBookingFlowPath(prev) && !isBookingFlowPath(pathname)) {
      clearCart();
    }
  }, [pathname, clearCart]);

  return null;
}

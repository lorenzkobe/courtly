import type { ReactNode } from "react";
import { BookingCartRouteSync } from "@/components/booking/BookingCartRouteSync";

export default function CourtsLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <BookingCartRouteSync />
      {children}
    </>
  );
}

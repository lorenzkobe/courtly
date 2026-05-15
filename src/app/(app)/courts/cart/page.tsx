"use client";

import { useMutation, useQueries, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowLeft,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiErrorMessage } from "@/lib/api/api-error-message";
import { courtlyApi } from "@/lib/api/courtly-client";
import { useAuth } from "@/lib/auth/auth-context";
import {
  availableSegmentsInRange,
  exclusiveEndAfterLastIncludedHour,
  formatBookableHourSlotRange,
  formatSegmentLine,
  groupIntoContiguousHourRuns,
  occupiedHourStarts,
  occupiedHourStartsFromClosures,
  totalBillableHours,
} from "@/lib/booking-range";
import {
  trackBookingCartEvent,
} from "@/lib/bookings/booking-cart-analytics";
import { buildBookingPayloads } from "@/lib/bookings/booking-payloads";
import { formatPhp } from "@/lib/format-currency";
import { queryKeys } from "@/lib/query/query-keys";
import { useBookingCart } from "@/lib/stores/booking-cart";
import type { Booking, Court, CourtBookingSurfaceResponse } from "@/lib/types/courtly";
import { segmentsTotalCost } from "@/lib/court-pricing";
import { splitBookingAmounts } from "@/lib/platform-fee";

function cartLineLabel(slots: string[]) {
  const runs = groupIntoContiguousHourRuns(slots);
  return runs
    .map((run) => {
      const start = run[0]!;
      const endExclusive = exclusiveEndAfterLastIncludedHour(run[run.length - 1]!);
      return formatSegmentLine({
        start_time: start,
        end_time: endExclusive,
        hours: run.length,
      });
    })
    .join(" and ");
}

export default function BookingCartPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const cartItems = useBookingCart((state) => state.items);
  const venueName = useBookingCart((state) => state.venueName);
  const removeItem = useBookingCart((state) => state.removeItem);
  const clearCart = useBookingCart((state) => state.clearCart);

  const [bookingConfirmed, setBookingConfirmed] = useState(false);

  const cartFetchGroups = useMemo(() => {
    const seen = new Map<
      string,
      { leaderCourtId: string; date: string }
    >();
    for (const item of cartItems) {
      const groupKey = `${item.venueId}__${item.date}`;
      if (seen.has(groupKey)) continue;
      seen.set(groupKey, { leaderCourtId: item.courtId, date: item.date });
    }
    return Array.from(seen.values());
  }, [cartItems]);

  const cartGroupQueries = useQueries({
    queries: cartFetchGroups.map((group) => ({
      queryKey: queryKeys.bookingSurface.courtDay(group.leaderCourtId, group.date),
      queryFn: async () => {
        const { data } = await courtlyApi.courts.bookingSurface(group.leaderCourtId, {
          date: group.date,
        });
        return data;
      },
      staleTime: 15_000,
      enabled: !!group.leaderCourtId,
    })),
  });

  const cartSurfaceByCourtAndDate = useMemo(() => {
    const out = new Map<string, CourtBookingSurfaceResponse>();
    cartFetchGroups.forEach((group, index) => {
      const data = cartGroupQueries[index]?.data;
      if (!data) return;
      for (const cid of Object.keys(data.availability_by_court_id)) {
        out.set(`${cid}__${group.date}`, data);
      }
    });
    return out;
  }, [cartFetchGroups, cartGroupQueries]);

  const cartLines = useMemo(() => {
    return cartItems.map((item) => {
      const surface = cartSurfaceByCourtAndDate.get(`${item.courtId}__${item.date}`);
      const court: Court | null = surface
        ? surface.court.id === item.courtId
          ? surface.court
          : (surface.sibling_courts.find((c) => c.id === item.courtId) ?? null)
        : null;
      const slot = surface?.availability_by_court_id?.[item.courtId];
      const bookings = slot?.bookings ?? [];
      const courtClosures = slot?.court_closures ?? [];
      const venueClosures = surface?.venue_closures ?? [];

      const occupied = new Set<string>();
      for (const token of occupiedHourStarts(bookings)) occupied.add(token);
      for (const token of occupiedHourStartsFromClosures(courtClosures, item.date)) {
        occupied.add(token);
      }
      for (const token of occupiedHourStartsFromClosures(venueClosures, item.date)) {
        occupied.add(token);
      }

      const runs = groupIntoContiguousHourRuns(item.slots);
      const segments = runs.flatMap((run) => {
        const a = run[0]!;
        const b = run[run.length - 1]!;
        return availableSegmentsInRange(a, exclusiveEndAfterLastIncludedHour(b), occupied);
      });
      const unavailableSlots = item.slots.filter((slot) => occupied.has(slot));
      const billableHours = totalBillableHours(segments);
      const requestedHours = item.slots.length;
      const subtotal = court ? segmentsTotalCost(court, segments, item.date) : 0;
      const flatFee = surface?.flat_booking_fee;
      const totals = splitBookingAmounts(subtotal, flatFee, billableHours);

      return {
        item,
        court,
        isLoading: !surface,
        isError: false,
        segments,
        unavailableSlots,
        billableHours,
        requestedHours,
        flatBookingFeePhp: flatFee ?? 0,
        totals,
      };
    });
  }, [cartItems, cartSurfaceByCourtAndDate]);

  const hasBlockingConflicts = cartLines.some(
    (line) => line.unavailableSlots.length > 0 || line.segments.length === 0 || !line.court,
  );
  const isAnyLoading = cartGroupQueries.some((query) => query.isLoading);

  const grandTotal = cartLines.reduce((sum, line) => sum + line.totals.total_cost, 0);

  const createBookings = useMutation({
    mutationFn: async (payloads: Partial<Booking>[]) => {
      const { data } = await courtlyApi.bookings.checkout(payloads);
      return data;
    },
    onSuccess: (checkout) => {
      if (user?.email) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.bookings.list({ player_email: user.email }),
        });
      }
      for (const group of cartFetchGroups) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.bookingSurface.courtDay(group.leaderCourtId, group.date),
        });
      }
      clearCart();
      trackBookingCartEvent("cart_checkout_succeeded", {
        checkoutGroupId: checkout.booking_group_id,
      });
      toast.success("Booking hold created. Submit payment proof within 5 minutes.");
    },
    onError: (error: unknown) => {
      const message = apiErrorMessage(
        error,
        "Could not complete checkout. Please review availability and try again.",
      );
      trackBookingCartEvent("cart_checkout_failed", { message });
      toast.error(message);
      for (const group of cartFetchGroups) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.bookingSurface.courtDay(group.leaderCourtId, group.date),
        });
      }
    },
  });

  const startCheckout = () => {
    if (!user) {
      toast.error("You need to be signed in to checkout.");
      return;
    }
    if (cartLines.length === 0) {
      toast.error("Your booking cart is empty.");
      return;
    }
    if (hasBlockingConflicts) {
      trackBookingCartEvent("cart_checkout_conflict", {
        linesWithConflicts: cartLines.filter(
          (line) => line.unavailableSlots.length > 0 || line.segments.length === 0 || !line.court,
        ).length,
      });
      toast.error("Some lines changed availability. Resolve affected lines before checkout.");
      return;
    }

    const displayName = user.full_name?.trim() || user.email;
    const bookingGroupId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `grp-${Date.now()}`;
    const payloads = cartLines.flatMap((line) =>
      buildBookingPayloads(line.segments, line.court!, {
        date: line.item.date,
        playerName: displayName,
        playerEmail: user.email,
        notes: line.item.notes ?? "",
        bookingGroupId,
        flatBookingFeePhp: line.flatBookingFeePhp,
      }),
    );
    trackBookingCartEvent("cart_checkout_started", {
      lineItems: cartLines.length,
      bookingRows: payloads.length,
      venueName,
    });
    createBookings.mutate(payloads);
  };

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 md:px-10">
      <Button
        variant="ghost"
        className="mb-4 -ml-2 text-muted-foreground"
        onClick={() => router.push("/courts")}
      >
        <ArrowLeft className="mr-2 h-4 w-4" /> Back to Courts
      </Button>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight">
            Booking cart
          </h1>
          <p className="text-sm text-muted-foreground">
            {venueName ? `Venue: ${venueName}` : "Review lines before checkout."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => router.push("/courts")}>
            Add another booking
          </Button>
          <Button
            variant="ghost"
            className="text-muted-foreground"
            onClick={clearCart}
            disabled={cartItems.length === 0}
          >
            Clear cart
          </Button>
        </div>
      </div>

      {cartItems.length === 0 ? (
        <Card className="border-border/50">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <ShoppingCart className="h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Your cart is empty. Add one or more court/date/time lines first.
            </p>
            <Button asChild>
              <Link href="/courts">Browse courts</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {cartLines.map((line) => {
            return (
              <Card key={line.item.id} className="border-border/50">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center justify-between gap-3 text-base">
                    <span>{line.item.courtName}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      onClick={() => removeItem(line.item.id)}
                    >
                      <Trash2 className="mr-1.5 h-4 w-4" />
                      Remove
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <p className="text-muted-foreground">
                    {format(new Date(`${line.item.date}T12:00:00`), "EEE, MMM d, yyyy")}
                  </p>
                  <p className="font-medium">{cartLineLabel(line.item.slots)}</p>
                  <p className="text-xs text-muted-foreground">
                    {line.requestedHours} selected{" "}
                    {line.requestedHours === 1 ? "hour" : "hours"}{" "}
                    {line.billableHours !== line.requestedHours
                      ? `· ${line.billableHours} billable`
                      : ""}
                  </p>
                  {line.unavailableSlots.length > 0 ? (
                    <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                      Some slots are no longer available:{" "}
                      {line.unavailableSlots.map(formatBookableHourSlotRange).join(", ")}.
                      Remove this line or reselect times.
                    </div>
                  ) : null}
                  {line.isError || !line.court ? (
                    <div className="rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                      Could not refresh this court line. Remove it and add again.
                    </div>
                  ) : null}
                  {line.item.notes ? (
                    <p className="text-xs text-muted-foreground">
                      Note: {line.item.notes}
                    </p>
                  ) : null}
                  <div className="flex items-center justify-between border-t border-border/60 pt-2">
                    <span className="text-muted-foreground">Line total</span>
                    <span className="font-semibold">{formatPhp(line.totals.total_cost)}</span>
                  </div>
                  <div>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/courts/${line.item.courtId}/book`}>
                        Change court/time
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}

          <Card className="border-border/50">
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Total</span>
                <span className="font-heading text-xl font-bold text-primary">
                  {formatPhp(grandTotal)}
                </span>
              </div>
              {hasBlockingConflicts ? (
                <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
                  Checkout is paused until affected lines are fixed. Valid lines are
                  preserved in your cart.
                </p>
              ) : null}
              <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border/60 bg-muted/20 px-3 py-3">
                <input
                  type="checkbox"
                  checked={bookingConfirmed}
                  onChange={(e) => setBookingConfirmed(e.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                />
                <span className="text-xs leading-relaxed text-muted-foreground">
                  I confirm that my booking details are correct. I understand that once
                  submitted, any mistakes are my responsibility and the venue is not
                  obligated to accommodate changes or issue refunds.
                </span>
              </label>
              <Button
                className="w-full font-heading font-semibold"
                size="lg"
                onClick={startCheckout}
                disabled={
                  isAnyLoading ||
                  hasBlockingConflicts ||
                  createBookings.isPending ||
                  cartLines.length === 0 ||
                  !bookingConfirmed
                }
              >
                {createBookings.isPending ? "Checking out..." : "Confirm all bookings"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

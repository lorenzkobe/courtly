"use client";

import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowLeft,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import PaymentLockOverlay from "@/components/payments/PaymentLockOverlay";
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
import { optimizePaymentProofImage } from "@/lib/payments/optimize-payment-proof";
import {
  PAYMENT_PROOF_ALLOWED_INPUT_MIME_TYPES,
} from "@/lib/payments/payment-proof-constraints";
import { queryKeys } from "@/lib/query/query-keys";
import { useBookingCart } from "@/lib/stores/booking-cart";
import type { Booking, Court } from "@/lib/types/courtly";
import { venuePaymentMethodsForCheckout } from "@/lib/venue-payment-methods";
import { segmentsTotalCost } from "@/lib/court-pricing";
import { splitBookingAmounts } from "@/lib/platform-fee";

type PaymentOverlayState = {
  booking_id: string;
  booking_group_id: string;
  hold_expires_at: string;
  total_due: number;
  payment_methods: Array<{
    method: "gcash" | "maya";
    account_name: string;
    account_number: string;
  }>;
};

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

  const [paymentOverlay, setPaymentOverlay] = useState<PaymentOverlayState | null>(null);
  const [countdownNow, setCountdownNow] = useState(() => Date.now());
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<"gcash" | "maya" | null>(
    null,
  );
  const [optimizedProof, setOptimizedProof] = useState<{
    dataUrl: string;
    mimeType: "image/jpeg";
    bytes: number;
    width: number;
    height: number;
  } | null>(null);
  const [proofOptimizing, setProofOptimizing] = useState(false);
  const { data: myPendingBookings = [] } = useQuery({
    queryKey: queryKeys.bookings.list({
      player_email: user?.email,
    }),
    queryFn: async () => {
      if (!user?.email) return [] as Booking[];
      const { data } = await courtlyApi.bookings.list({
        player_email: user.email,
      });
      return data;
    },
    enabled: !!user?.email,
  });
  const activePendingBooking = useMemo(() => {
    const now = Date.now();
    const candidates = myPendingBookings
      .filter(
        (booking) =>
          booking.status === "pending_payment" &&
          booking.hold_expires_at &&
          new Date(booking.hold_expires_at).getTime() > now &&
          !booking.payment_failed_at,
      )
      .sort((a, b) => (b.created_date ?? "").localeCompare(a.created_date ?? ""));
    return candidates[0] ?? null;
  }, [myPendingBookings]);
  const pendingPaymentCourtId = activePendingBooking?.court_id ?? null;
  const { data: pendingPaymentCourt } = useQuery({
    queryKey: pendingPaymentCourtId
      ? queryKeys.courts.detail(pendingPaymentCourtId)
      : queryKeys.courts.detail(""),
    queryFn: async () => {
      if (!pendingPaymentCourtId) return null as Court | null;
      const { data } = await courtlyApi.courts.get(pendingPaymentCourtId);
      return data;
    },
    enabled: !!pendingPaymentCourtId,
  });

  const itemSurfaces = useQueries({
    queries: cartItems.map((item) => ({
      queryKey: queryKeys.bookingSurface.courtDay(item.courtId, item.date),
      queryFn: async () => {
        const { data } = await courtlyApi.courts.bookingSurface(item.courtId, {
          date: item.date,
        });
        return data;
      },
      staleTime: 15_000,
      enabled: !!item.courtId,
    })),
  });

  const cartLines = useMemo(() => {
    return cartItems.map((item, index) => {
      const surface = itemSurfaces[index]?.data;
      const court = (surface?.court ?? null) as Court | null;
      const bookings = surface?.availability.bookings ?? [];
      const courtClosures = surface?.availability.court_closures ?? [];
      const venueClosures = surface?.availability.venue_closures ?? [];

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
      const subtotal = court ? segmentsTotalCost(court, segments) : 0;
      const totals = splitBookingAmounts(subtotal, undefined);

      return {
        item,
        court,
        isLoading: itemSurfaces[index]?.isLoading ?? false,
        isError: itemSurfaces[index]?.isError ?? false,
        segments,
        unavailableSlots,
        billableHours,
        requestedHours,
        totals,
      };
    });
  }, [cartItems, itemSurfaces]);

  const hasBlockingConflicts = cartLines.some(
    (line) => line.unavailableSlots.length > 0 || line.segments.length === 0 || !line.court,
  );
  const isAnyLoading = itemSurfaces.some((query) => query.isLoading);

  const grandTotal = cartLines.reduce((sum, line) => sum + line.totals.total_cost, 0);

  const createBookings = useMutation({
    mutationFn: async (payloads: Partial<Booking>[]) => {
      const { data } = await courtlyApi.bookings.checkout(payloads);
      return data;
    },
    onSuccess: (checkout) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all() });
      cartItems.forEach((item) => {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.bookingSurface.courtDay(item.courtId, item.date),
        });
      });
      setPaymentOverlay(checkout);
      setSelectedPaymentMethod(checkout.payment_methods[0]?.method ?? null);
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
      void Promise.all(
        cartItems.map((item) =>
          queryClient.invalidateQueries({
            queryKey: queryKeys.bookingSurface.courtDay(item.courtId, item.date),
          }),
        ),
      );
    },
  });

  const submitPaymentProof = useMutation({
    mutationFn: async () => {
      if (!paymentOverlay) throw new Error("No active booking hold.");
      if (!selectedPaymentMethod) throw new Error("Select a payment method.");
      if (!optimizedProof) throw new Error("Upload a payment screenshot first.");
      const { data } = await courtlyApi.bookings.submitPaymentProof(paymentOverlay.booking_id, {
        payment_method: selectedPaymentMethod,
        payment_proof_data_url: optimizedProof.dataUrl,
        payment_proof_mime_type: optimizedProof.mimeType,
        payment_proof_bytes: optimizedProof.bytes,
        payment_proof_width: optimizedProof.width,
        payment_proof_height: optimizedProof.height,
      });
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all() });
      setPaymentOverlay(null);
      setOptimizedProof(null);
      setSelectedPaymentMethod(null);
      toast.success("Payment submitted. Waiting for venue confirmation.");
      router.push("/my-bookings");
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, "Could not submit payment proof."));
    },
  });
  const cancelPendingPayment = useMutation({
    mutationFn: async () => {
      if (!paymentOverlay) throw new Error("No active booking hold.");
      await courtlyApi.bookings.cancelPending({
        booking_id: paymentOverlay.booking_id,
        booking_group_id: paymentOverlay.booking_group_id,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all() });
      void queryClient.invalidateQueries({ queryKey: ["booking-surface"] });
      setPaymentOverlay(null);
      setOptimizedProof(null);
      setSelectedPaymentMethod(null);
      toast.success("Pending booking cancelled. Slots are now available again.");
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, "Could not cancel pending booking."));
    },
  });

  useEffect(() => {
    const id = window.setInterval(() => setCountdownNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    if (!activePendingBooking || !pendingPaymentCourt) return;
    const paymentMethods = venuePaymentMethodsForCheckout(pendingPaymentCourt);
    if (paymentMethods.length === 0) return;
    const bookingGroupId =
      activePendingBooking.booking_group_id ?? activePendingBooking.id;
    const relatedPending = myPendingBookings.filter(
      (booking) =>
        (booking.booking_group_id === bookingGroupId ||
          booking.id === activePendingBooking.id) &&
        booking.status === "pending_payment",
    );
    const totalDue = relatedPending.reduce(
      (sum, booking) => sum + Number(booking.total_cost ?? 0),
      0,
    );
    setPaymentOverlay((current) => {
      if (
        current &&
        current.booking_group_id === bookingGroupId &&
        current.hold_expires_at === activePendingBooking.hold_expires_at
      ) {
        return { ...current, total_due: totalDue, payment_methods: paymentMethods };
      }
      return {
        booking_id: activePendingBooking.id,
        booking_group_id: bookingGroupId,
        hold_expires_at: activePendingBooking.hold_expires_at!,
        total_due: totalDue,
        payment_methods: paymentMethods,
      };
    });
    setSelectedPaymentMethod((current) => {
      if (current && paymentMethods.some((method) => method.method === current)) return current;
      return paymentMethods[0]?.method ?? null;
    });
  }, [activePendingBooking, myPendingBookings, pendingPaymentCourt]);
  const overlayRemainingSeconds = paymentOverlay
    ? Math.max(
        0,
        Math.ceil((new Date(paymentOverlay.hold_expires_at).getTime() - countdownNow) / 1000),
      )
    : 0;
  useEffect(() => {
    if (!paymentOverlay) return;
    if (overlayRemainingSeconds > 0) return;
    window.location.reload();
  }, [overlayRemainingSeconds, paymentOverlay]);

  const processProofFile = async (file: File) => {
    const allowed = PAYMENT_PROOF_ALLOWED_INPUT_MIME_TYPES as readonly string[];
    if (!allowed.includes(file.type)) {
      toast.error("Please use a JPG, PNG, or WebP photo.");
      return;
    }
    setProofOptimizing(true);
    setOptimizedProof(null);
    try {
      const optimized = await optimizePaymentProofImage(file);
      setOptimizedProof(optimized);
      toast.success("Photo uploaded");
    } catch (error) {
      toast.error(
        apiErrorMessage(error, "Could not use that image. Try another photo."),
      );
      setOptimizedProof(null);
    } finally {
      setProofOptimizing(false);
    }
  };

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
              <Button
                className="w-full font-heading font-semibold"
                size="lg"
                onClick={startCheckout}
                disabled={
                  isAnyLoading ||
                  hasBlockingConflicts ||
                  createBookings.isPending ||
                  cartLines.length === 0
                }
              >
                {createBookings.isPending ? "Checking out..." : "Confirm all bookings"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {paymentOverlay ? (
        <PaymentLockOverlay
          description="Send the amount to the account below, then upload your proof."
          remainingSeconds={overlayRemainingSeconds}
          totalDue={paymentOverlay.total_due}
          paymentMethods={paymentOverlay.payment_methods}
          selectedPaymentMethod={selectedPaymentMethod}
          onPaymentMethodChange={(value) => setSelectedPaymentMethod(value)}
          onPickProofFile={processProofFile}
          proofPreviewUrl={optimizedProof?.dataUrl ?? null}
          proofOptimizing={proofOptimizing}
          onClearProof={() => setOptimizedProof(null)}
          onSubmit={() => submitPaymentProof.mutate()}
          submitDisabled={
            submitPaymentProof.isPending ||
            proofOptimizing ||
            !selectedPaymentMethod ||
            !optimizedProof
          }
          submitPending={submitPaymentProof.isPending}
          onCancel={() => cancelPendingPayment.mutate()}
          cancelDisabled={submitPaymentProof.isPending}
          cancelPending={cancelPendingPayment.isPending}
        />
      ) : null}
    </div>
  );
}

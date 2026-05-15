"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import PaymentLockOverlay from "@/components/payments/PaymentLockOverlay";
import { courtlyApi } from "@/lib/api/courtly-client";
import { apiErrorMessage } from "@/lib/api/api-error-message";
import { useAuth } from "@/lib/auth/auth-context";
import { optimizePaymentProofImage } from "@/lib/payments/optimize-payment-proof";
import { PAYMENT_PROOF_ALLOWED_INPUT_MIME_TYPES } from "@/lib/payments/payment-proof-constraints";
import { queryKeys } from "@/lib/query/query-keys";
import type { Booking, Court } from "@/lib/types/courtly";
import { venuePaymentMethodsForCheckout } from "@/lib/venue-payment-methods";

export default function GlobalPendingPaymentGate() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
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
  const [optimisticCancelBookingId, setOptimisticCancelBookingId] = useState<string | null>(
    null,
  );

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
    staleTime: 15_000,
  });

  useEffect(() => {
    const timer = window.setInterval(() => setCountdownNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const activePendingBooking = useMemo(() => {
    const now = countdownNow;
    const candidates = myPendingBookings
      .filter(
        (booking) =>
          booking.status === "pending_payment" &&
          booking.hold_expires_at &&
          new Date(booking.hold_expires_at).getTime() > now,
      )
      .sort((a, b) => (b.created_date ?? "").localeCompare(a.created_date ?? ""));
    return candidates[0] ?? null;
  }, [myPendingBookings, countdownNow]);

  /** Hide overlay immediately after cancel tap until server confirms (or restore on error). */
  const overlayPendingBooking =
    activePendingBooking &&
    optimisticCancelBookingId &&
    activePendingBooking.id === optimisticCancelBookingId
      ? null
      : activePendingBooking;

  const pendingPaymentCourtId = overlayPendingBooking?.court_id ?? null;
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
    staleTime: 15_000,
  });

  const paymentMethods = useMemo(
    () => venuePaymentMethodsForCheckout(pendingPaymentCourt ?? {}),
    [pendingPaymentCourt],
  );
  const bookingGroupId = overlayPendingBooking
    ? overlayPendingBooking.booking_group_id ?? overlayPendingBooking.id
    : null;
  const relatedPending = useMemo(
    () =>
      overlayPendingBooking && bookingGroupId
        ? myPendingBookings.filter(
            (booking) =>
              (booking.booking_group_id === bookingGroupId ||
                booking.id === overlayPendingBooking.id) &&
              booking.status === "pending_payment",
          )
        : [],
    [overlayPendingBooking, bookingGroupId, myPendingBookings],
  );
  const overlayTotalDue = useMemo(
    () => relatedPending.reduce((sum, booking) => sum + Number(booking.total_cost ?? 0), 0),
    [relatedPending],
  );
  const overlayRemainingSeconds = overlayPendingBooking?.hold_expires_at
    ? Math.max(
        0,
        Math.ceil(
          (new Date(overlayPendingBooking.hold_expires_at).getTime() - countdownNow) / 1000,
        ),
      )
    : 0;

  const activeHoldRemainingSeconds = activePendingBooking?.hold_expires_at
    ? Math.max(
        0,
        Math.ceil(
          (new Date(activePendingBooking.hold_expires_at).getTime() - countdownNow) / 1000,
        ),
      )
    : 0;

  useEffect(() => {
    if (!activePendingBooking) {
      setSelectedPaymentMethod(null);
      setOptimizedProof(null);
      return;
    }
    if (selectedPaymentMethod && paymentMethods.some((method) => method.method === selectedPaymentMethod)) {
      return;
    }
    setSelectedPaymentMethod(paymentMethods[0]?.method ?? null);
  }, [activePendingBooking, paymentMethods, selectedPaymentMethod]);

  useEffect(() => {
    if (!activePendingBooking) return;
    if (activeHoldRemainingSeconds > 0) return;
    window.location.reload();
  }, [activePendingBooking, activeHoldRemainingSeconds]);

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
      toast.error(apiErrorMessage(error, "Could not use that image. Try another photo."));
      setOptimizedProof(null);
    } finally {
      setProofOptimizing(false);
    }
  };

  const submitPaymentProof = useMutation({
    mutationFn: async () => {
      if (!overlayPendingBooking) throw new Error("No active booking hold.");
      if (!selectedPaymentMethod) throw new Error("Select a payment method.");
      if (!optimizedProof) throw new Error("Upload a payment screenshot first.");
      await courtlyApi.bookings.submitPaymentProof(overlayPendingBooking.id, {
        payment_method: selectedPaymentMethod,
        payment_proof_data_url: optimizedProof.dataUrl,
        payment_proof_mime_type: optimizedProof.mimeType,
        payment_proof_bytes: optimizedProof.bytes,
        payment_proof_width: optimizedProof.width,
        payment_proof_height: optimizedProof.height,
      });
    },
    onSuccess: () => {
      const submittedMethod = selectedPaymentMethod;
      const groupId = bookingGroupId;
      const anchorId = overlayPendingBooking?.id ?? null;
      setOptimizedProof(null);
      setSelectedPaymentMethod(null);
      queryClient.setQueriesData<Booking[]>(
        { queryKey: queryKeys.bookings.all() },
        (prev) => {
          if (!Array.isArray(prev)) return prev;
          let changed = false;
          const next = prev.map((booking) => {
            const inGroup =
              booking.status === "pending_payment" &&
              ((groupId && booking.booking_group_id === groupId) ||
                booking.id === anchorId);
            if (!inGroup) return booking;
            changed = true;
            return {
              ...booking,
              status: "pending_confirmation" as Booking["status"],
              payment_submitted_method:
                submittedMethod ?? booking.payment_submitted_method ?? null,
              payment_submitted_at:
                booking.payment_submitted_at ?? new Date().toISOString(),
            };
          });
          return changed ? next : prev;
        },
      );
      void queryClient.invalidateQueries({ queryKey: ["my-booking-detail"] });
      toast.success("Payment submitted. Waiting for venue confirmation.");
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, "Could not submit payment proof."));
    },
  });

  const cancelPendingBooking = useMutation({
    mutationFn: async (payload: { booking_id: string; booking_group_id: string }) => {
      await courtlyApi.bookings.cancelPending({
        booking_id: payload.booking_id,
        booking_group_id: payload.booking_group_id,
      });
    },
    onMutate: (payload: { booking_id: string; booking_group_id: string }) => {
      setOptimisticCancelBookingId(payload.booking_id);
    },
    onSuccess: (_response, payload) => {
      setOptimisticCancelBookingId(null);
      setOptimizedProof(null);
      setSelectedPaymentMethod(null);
      const freedSurfaceKeys = new Set<string>();
      queryClient.setQueriesData<Booking[]>(
        { queryKey: queryKeys.bookings.all() },
        (prev) => {
          if (!Array.isArray(prev)) return prev;
          let removed = false;
          const next = prev.filter((booking) => {
            const inGroup =
              booking.status === "pending_payment" &&
              (booking.booking_group_id === payload.booking_group_id ||
                booking.id === payload.booking_id);
            if (!inGroup) return true;
            removed = true;
            if (booking.court_id && booking.date) {
              freedSurfaceKeys.add(`${booking.court_id}__${booking.date}`);
            }
            return false;
          });
          return removed ? next : prev;
        },
      );
      for (const composite of freedSurfaceKeys) {
        const [courtId, date] = composite.split("__");
        if (!courtId || !date) continue;
        void queryClient.invalidateQueries({
          queryKey: queryKeys.bookingSurface.courtDay(courtId, date),
        });
      }
      void queryClient.invalidateQueries({ queryKey: ["my-booking-detail"] });
      toast.success("Pending booking cancelled. Slots are now available again.");
    },
    onError: (error) => {
      setOptimisticCancelBookingId(null);
      toast.error(apiErrorMessage(error, "Could not cancel pending booking."));
    },
  });

  if (!overlayPendingBooking || paymentMethods.length === 0) return null;

  return (
    <PaymentLockOverlay
      description="Send the amount to the account below, then upload a clear payment screenshot."
      remainingSeconds={overlayRemainingSeconds}
      totalDue={overlayTotalDue}
      paymentMethods={paymentMethods}
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
      onCancel={() => {
        if (!activePendingBooking) return;
        cancelPendingBooking.mutate({
          booking_id: activePendingBooking.id,
          booking_group_id:
            activePendingBooking.booking_group_id ?? activePendingBooking.id,
        });
      }}
      cancelDisabled={submitPaymentProof.isPending || proofOptimizing}
      cancelPending={cancelPendingBooking.isPending}
    />
  );
}


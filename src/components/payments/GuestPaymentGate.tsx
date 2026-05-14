"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import PaymentLockOverlay from "@/components/payments/PaymentLockOverlay";
import { apiErrorMessage } from "@/lib/api/api-error-message";
import {
  clearGuestHold,
  loadGuestHold,
  type GuestHoldState,
} from "@/lib/guest-booking-storage";
import { optimizePaymentProofImage } from "@/lib/payments/optimize-payment-proof";
import { PAYMENT_PROOF_ALLOWED_INPUT_MIME_TYPES } from "@/lib/payments/payment-proof-constraints";

export default function GuestPaymentGate() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [hold, setHold] = useState<GuestHoldState | null>(null);
  const [countdownNow, setCountdownNow] = useState(() => Date.now());
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<
    "gcash" | "maya" | null
  >(null);
  const [optimizedProof, setOptimizedProof] = useState<{
    dataUrl: string;
    mimeType: "image/jpeg";
    bytes: number;
    width: number;
    height: number;
  } | null>(null);
  const [proofOptimizing, setProofOptimizing] = useState(false);

  const refreshHold = () => {
    const stored = loadGuestHold();
    setHold(stored);
    if (stored) setSelectedPaymentMethod((prev) => prev ?? stored.payment_methods[0]?.method ?? null);
    else {
      setSelectedPaymentMethod(null);
      setOptimizedProof(null);
    }
  };

  // Reload hold when the route changes or when the booking page signals a new hold
  useEffect(() => { refreshHold(); }, [pathname]);
  useEffect(() => {
    window.addEventListener("courtly:hold-updated", refreshHold);
    return () => window.removeEventListener("courtly:hold-updated", refreshHold);
  }, []);

  // Countdown ticker
  useEffect(() => {
    const timer = window.setInterval(() => setCountdownNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const remainingSeconds = hold
    ? Math.max(
        0,
        Math.ceil((new Date(hold.hold_expires_at).getTime() - countdownNow) / 1000),
      )
    : 0;

  // Expire hold when countdown hits 0
  useEffect(() => {
    if (!hold) return;
    if (remainingSeconds <= 0) {
      clearGuestHold();
      setHold(null);
      setOptimizedProof(null);
      setSelectedPaymentMethod(null);
      void queryClient.invalidateQueries({ queryKey: ["booking-surface"] });
      window.dispatchEvent(new Event("courtly:hold-updated"));
      toast.error("Your slot hold expired. Please select slots again.");
    }
  }, [remainingSeconds, hold, queryClient]);

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

  type SubmitProofVars = {
    bookingId: string;
    playerEmail: string;
    playerFirstName: string;
    playerLastName: string;
    playerPhone: string;
    bookingNumber: string;
    paymentMethod: "gcash" | "maya";
    proof: { dataUrl: string; mimeType: "image/jpeg"; bytes: number; width: number; height: number };
  };

  const submitProofMut = useMutation({
    mutationFn: async (vars: SubmitProofVars) => {
      const res = await fetch(`/api/bookings/${vars.bookingId}/submit-proof`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player_email: vars.playerEmail,
          payment_method: vars.paymentMethod,
          payment_proof_data_url: vars.proof.dataUrl,
          payment_proof_mime_type: vars.proof.mimeType,
          payment_proof_bytes: vars.proof.bytes,
          payment_proof_width: vars.proof.width,
          payment_proof_height: vars.proof.height,
        }),
      });
      const json = (await res.json()) as { error?: string; booking_number?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not submit payment proof.");
      return { ...json, vars };
    },
    onSuccess: (data) => {
      const bookingNumber = data.booking_number ?? data.vars.bookingNumber;
      clearGuestHold();
      setHold(null);
      setOptimizedProof(null);
      setSelectedPaymentMethod(null);
      toast.success("Payment submitted. Waiting for venue confirmation.");
      if (bookingNumber) {
        const sp = new URLSearchParams();
        sp.set("em", data.vars.playerEmail);
        sp.set("fn", data.vars.playerFirstName);
        sp.set("ln", data.vars.playerLastName);
        sp.set("ph", data.vars.playerPhone);
        router.push(`/b/${bookingNumber}?${sp.toString()}`);
      }
    },
    onError: (err: unknown) => {
      toast.error(
        err instanceof Error ? err.message : "Could not submit payment proof.",
      );
    },
  });

  const cancelMut = useMutation({
    mutationFn: async (payload: { bookingId: string; playerEmail: string }) => {
      const res = await fetch(`/api/bookings/cancel-pending`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          booking_id: payload.bookingId,
          player_email: payload.playerEmail,
        }),
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: string };
        throw new Error(json.error ?? "Could not cancel booking.");
      }
    },
    onSuccess: () => {
      clearGuestHold();
      setHold(null);
      setOptimizedProof(null);
      setSelectedPaymentMethod(null);
      void queryClient.invalidateQueries({ queryKey: ["booking-surface"] });
      window.dispatchEvent(new Event("courtly:hold-updated"));
      toast.success("Slot hold cancelled. Slots are now available again.");
    },
    onError: (err: unknown) => {
      toast.error(apiErrorMessage(err, "Could not cancel booking. Please try again."));
    },
  });

  if (!hold) return null;

  return (
    <PaymentLockOverlay
      description="Send the amount to the account below, then add a clear photo of your receipt or transfer screen."
      remainingSeconds={remainingSeconds}
      totalDue={hold.total_due}
      paymentMethods={hold.payment_methods}
      selectedPaymentMethod={selectedPaymentMethod}
      onPaymentMethodChange={(value) => setSelectedPaymentMethod(value)}
      onPickProofFile={processProofFile}
      proofPreviewUrl={optimizedProof?.dataUrl ?? null}
      proofOptimizing={proofOptimizing}
      onClearProof={() => setOptimizedProof(null)}
      onSubmit={() => {
        if (!hold || !selectedPaymentMethod || !optimizedProof) return;
        submitProofMut.mutate({
          bookingId: hold.booking_id,
          playerEmail: hold.player_email,
          playerFirstName: hold.player_first_name,
          playerLastName: hold.player_last_name,
          playerPhone: hold.player_phone,
          bookingNumber: hold.booking_number,
          paymentMethod: selectedPaymentMethod,
          proof: optimizedProof,
        });
      }}
      submitDisabled={
        submitProofMut.isPending ||
        proofOptimizing ||
        !selectedPaymentMethod ||
        !optimizedProof
      }
      submitPending={submitProofMut.isPending}
      onCancel={() => {
        if (!hold) return;
        cancelMut.mutate({ bookingId: hold.booking_id, playerEmail: hold.player_email });
      }}
      cancelDisabled={submitProofMut.isPending || proofOptimizing}
      cancelPending={cancelMut.isPending}
    />
  );
}

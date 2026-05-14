"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, CheckCircle, MapPin, Printer, Upload, XCircle } from "lucide-react";
import Link from "next/link";
import { use, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { apiErrorMessage } from "@/lib/api/api-error-message";
import { courtlyApi } from "@/lib/api/courtly-client";
import { formatPhp } from "@/lib/format-currency";
import { optimizePaymentProofImage } from "@/lib/payments/optimize-payment-proof";
import { PAYMENT_PROOF_ALLOWED_INPUT_MIME_TYPES } from "@/lib/payments/payment-proof-constraints";
import type { BillingCycleStatus } from "@/lib/types/courtly";

function formatPeriod(periodStart: string): string {
  const [year, month] = periodStart.split("-").map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
  });
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function StatusBadge({ status }: { status: BillingCycleStatus }) {
  if (status === "paid") {
    return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Paid</Badge>;
  }
  return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Unsettled</Badge>;
}

type OptimizedProof = {
  dataUrl: string;
  mimeType: "image/jpeg";
  bytes: number;
  width: number;
  height: number;
};

export default function AdminBillingCyclePage({
  params,
}: {
  params: Promise<{ cycleId: string }>;
}) {
  const { cycleId } = use(params);
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [paymentMethod, setPaymentMethod] = useState<"gcash" | "maya" | "">("");
  const [optimizedProof, setOptimizedProof] = useState<OptimizedProof | null>(null);
  const [optimizing, setOptimizing] = useState(false);
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [loadingProof, setLoadingProof] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "billing", "cycle", cycleId],
    queryFn: async () => {
      const res = await courtlyApi.adminBilling.getCycle(cycleId);
      return res.data;
    },
    staleTime: 30_000,
  });

  const { data: methodsData } = useQuery({
    queryKey: ["admin", "billing", "payment-methods"],
    queryFn: async () => {
      const res = await courtlyApi.adminBilling.getPaymentMethods();
      return res.data;
    },
    staleTime: 60_000,
  });

  const platformMethods = methodsData?.methods ?? [];

  const submitMutation = useMutation({
    mutationFn: () => {
      if (!optimizedProof || !paymentMethod) throw new Error("Missing proof or payment method.");
      return courtlyApi.adminBilling.submitProof(cycleId, {
        payment_method: paymentMethod as "gcash" | "maya",
        payment_proof_data_url: optimizedProof.dataUrl,
        payment_proof_mime_type: optimizedProof.mimeType,
        payment_proof_bytes: optimizedProof.bytes,
        payment_proof_width: optimizedProof.width,
        payment_proof_height: optimizedProof.height,
      });
    },
    onSuccess: () => {
      toast.success("Payment proof submitted.");
      setOptimizedProof(null);
      setPaymentMethod("");
      setProofUrl(null);
      queryClient.invalidateQueries({ queryKey: ["admin", "billing"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Something went wrong.")),
  });

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!fileInputRef.current) fileInputRef.current = e.target;
    e.target.value = "";
    if (!file) return;
    setOptimizing(true);
    setOptimizedProof(null);
    try {
      const result = await optimizePaymentProofImage(file);
      setOptimizedProof(result);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not process image.");
    } finally {
      setOptimizing(false);
    }
  }

  async function handleViewProof() {
    setLoadingProof(true);
    try {
      const res = await courtlyApi.adminBilling.getProofUrl(cycleId);
      setProofUrl(res.data.url);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Something went wrong."));
    } finally {
      setLoadingProof(false);
    }
  }

  const cycle = data?.cycle;
  const venue = data?.venue;
  const bookings = (data?.bookings ?? []).slice().sort(
    (a, b) => a.date.localeCompare(b.date),
  );
  const isPaid = cycle?.status === "paid";
  const hasSubmittedProof = !!cycle?.payment_submitted_at;
  const isRejected = !!cycle?.payment_rejected_at;

  const selectedMethod = platformMethods.find((m) => m.method === paymentMethod);

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 md:px-10">
      {/* Navigation — hidden when printing */}
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Link
          href="/admin/billing"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Billing
        </Link>
        <div className="flex items-center gap-2">
          {cycle && <StatusBadge status={cycle.status} />}
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="gap-1.5"
          >
            <Printer className="h-4 w-4" />
            Print
          </Button>
        </div>
      </div>

      {/* ── Document ── */}
      <div className="rounded-xl border border-border bg-white shadow-sm print:shadow-none print:border-none">
        {/* Document header */}
        <div className="border-b border-border px-8 py-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Courtly</p>
              <h1 className="mt-1 font-heading text-2xl font-bold text-foreground">
                Monthly Billing Statement
              </h1>
            </div>
            <div className="text-right text-sm">
              {cycle ? (
                <>
                  <p className="font-semibold">{formatPeriod(cycle.period_start)}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Issued {formatDate(cycle.created_at)}
                  </p>
                </>
              ) : (
                <div className="h-4 w-32 animate-pulse rounded bg-muted" />
              )}
            </div>
          </div>
        </div>

        {/* Billed to */}
        <div className="border-b border-border px-8 py-5">
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Billed to</p>
              {isLoading ? (
                <div className="space-y-1.5">
                  <div className="h-4 w-40 animate-pulse rounded bg-muted" />
                  <div className="h-3.5 w-56 animate-pulse rounded bg-muted" />
                </div>
              ) : (
                <>
                  <p className="font-semibold">{venue?.name}</p>
                  {venue?.location && (
                    <p className="mt-0.5 flex items-center gap-1 text-sm text-muted-foreground">
                      <MapPin className="h-3.5 w-3.5 shrink-0" />
                      {venue.location}
                    </p>
                  )}
                </>
              )}
            </div>
            <div className="sm:text-right">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Billing period</p>
              {isLoading || !cycle ? (
                <div className="h-4 w-28 animate-pulse rounded bg-muted sm:ml-auto" />
              ) : (
                <p className="font-semibold">{formatPeriod(cycle.period_start)}</p>
              )}
            </div>
          </div>
        </div>

        {/* Booking table */}
        <div className="px-8 py-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="py-3 text-left font-semibold text-muted-foreground">Date</th>
                <th className="py-3 text-left font-semibold text-muted-foreground">Court</th>
                <th className="py-3 text-left font-semibold text-muted-foreground whitespace-nowrap">Time</th>
                <th className="py-3 text-left font-semibold text-muted-foreground">Player</th>
                <th className="py-3 text-right font-semibold text-muted-foreground">Fee</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/50">
                    {Array.from({ length: 5 }).map((__, j) => (
                      <td key={j} className="py-3">
                        <div className="h-4 w-full animate-pulse rounded bg-muted" />
                      </td>
                    ))}
                  </tr>
                ))
              ) : bookings.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">
                    No bookings for this period.
                  </td>
                </tr>
              ) : (
                bookings.map((b) => (
                  <tr key={b.booking_id} className="border-b border-border/40 last:border-0">
                    <td className="py-3">{b.date}</td>
                    <td className="py-3">{b.court_name}</td>
                    <td className="py-3 whitespace-nowrap">{b.start_time}–{b.end_time}</td>
                    <td className="py-3 text-muted-foreground">{b.player_name ?? "—"}</td>
                    <td className="py-3 text-right font-medium">{formatPhp(b.booking_fee)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Total */}
        {cycle && (
          <div className="flex items-center justify-between border-t border-border bg-muted/30 px-8 py-4">
            <span className="text-sm text-muted-foreground">
              {cycle.booking_count} booking{cycle.booking_count !== 1 ? "s" : ""}
            </span>
            <div className="text-right">
              <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold mb-0.5">Total Due</p>
              <p className="text-xl font-heading font-bold">{formatPhp(cycle.total_booking_fees)}</p>
            </div>
          </div>
        )}

        {/* Print-only payment note */}
        {cycle && !isPaid && (
          <div className="hidden border-t border-border px-8 py-5 print:block">
            <p className="text-xs text-muted-foreground">
              Please settle this amount via your registered payment method and submit your proof of payment through the Courtly admin portal.
            </p>
          </div>
        )}
      </div>

      {/* ── Payment section — hidden when printing ── */}
      {cycle && (
        <div className="mt-6 rounded-xl border border-border p-6 space-y-4 print:hidden">
          <p className="font-semibold">Payment</p>

          {isPaid ? (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              <CheckCircle className="h-4 w-4 shrink-0" />
              <span>Paid on {formatDate(cycle.marked_paid_at!)}</span>
            </div>
          ) : (
            <>
              {/* Rejection notice */}
              {isRejected && !optimizedProof && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium text-red-800">
                    <XCircle className="h-4 w-4 shrink-0" />
                    Payment proof was rejected
                  </div>
                  {cycle.payment_rejection_note && (
                    <p className="text-sm text-red-700 pl-6">{cycle.payment_rejection_note}</p>
                  )}
                  <p className="text-xs text-red-600 pl-6">
                    Rejected on {formatDate(cycle.payment_rejected_at!)}. Please submit a new proof below.
                  </p>
                </div>
              )}

              {/* Proof submitted (pending review) */}
              {hasSubmittedProof && !optimizedProof && (
                <div className="rounded-lg border border-border/60 p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />
                    <span>
                      Proof submitted on {formatDate(cycle.payment_submitted_at!)}
                      {cycle.payment_method ? ` via ${cycle.payment_method.toUpperCase()}` : ""}
                      {" — "}awaiting review
                    </span>
                  </div>
                  {proofUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={proofUrl}
                      alt="Payment proof"
                      className="max-h-64 rounded-lg border object-contain"
                    />
                  ) : (
                    <Button size="sm" variant="outline" onClick={handleViewProof} disabled={loadingProof}>
                      {loadingProof ? "Loading…" : "View proof"}
                    </Button>
                  )}
                </div>
              )}

              {/* Payment form */}
              <div className="space-y-4">
                {(hasSubmittedProof || isRejected) && (
                  <p className="text-sm font-medium text-muted-foreground">
                    {hasSubmittedProof ? "Re-upload proof" : "Submit new proof"}
                  </p>
                )}

                {platformMethods.length === 0 ? (
                  <p className="rounded-lg border border-border/60 px-4 py-3 text-sm text-muted-foreground">
                    No payment methods configured yet. Contact your administrator.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <Label>Payment method</Label>
                    <Select
                      value={paymentMethod}
                      onValueChange={(v) => setPaymentMethod(v as "gcash" | "maya")}
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Select method" />
                      </SelectTrigger>
                      <SelectContent>
                        {platformMethods.map((m) => (
                          <SelectItem key={m.id} value={m.method}>
                            {m.method === "gcash" ? "GCash" : "Maya"}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {selectedMethod && (
                  <div className={`rounded-lg border px-4 py-3 space-y-1 ${selectedMethod.method === "gcash" ? "border-blue-200 bg-blue-50" : "border-green-200 bg-green-50"}`}>
                    <p className={`text-xs font-semibold uppercase tracking-wide ${selectedMethod.method === "gcash" ? "text-blue-600" : "text-green-600"}`}>
                      {selectedMethod.method === "gcash" ? "GCash" : "Maya"} account
                    </p>
                    <p className={`text-sm font-medium ${selectedMethod.method === "gcash" ? "text-blue-900" : "text-green-900"}`}>
                      {selectedMethod.account_name}
                    </p>
                    <p className={`text-sm font-mono ${selectedMethod.method === "gcash" ? "text-blue-800" : "text-green-800"}`}>
                      {selectedMethod.account_number}
                    </p>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>Payment screenshot</Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={[...PAYMENT_PROOF_ALLOWED_INPUT_MIME_TYPES].join(",")}
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  {optimizedProof ? (
                    <div className="relative overflow-hidden rounded-lg border border-border">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={optimizedProof.dataUrl}
                        alt="Preview"
                        className="w-full max-h-64 object-contain bg-muted/30"
                      />
                      <div className="flex items-center justify-between border-t px-3 py-2 bg-background">
                        <p className="text-xs text-muted-foreground">
                          {optimizedProof.width}×{optimizedProof.height}px · {Math.round(optimizedProof.bytes / 1024)} KB
                        </p>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={optimizing}
                        >
                          Change
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={optimizing}
                      className="flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border px-6 py-8 text-center transition-colors hover:border-foreground/30 hover:bg-muted/30 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Upload className="h-5 w-5 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">
                        {optimizing ? "Optimizing image…" : "Click to upload screenshot"}
                      </span>
                    </button>
                  )}
                </div>

                <Button
                  onClick={() => submitMutation.mutate()}
                  disabled={!optimizedProof || !paymentMethod || submitMutation.isPending}
                >
                  {submitMutation.isPending ? "Submitting…" : "Submit proof"}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

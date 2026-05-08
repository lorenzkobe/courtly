"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle, Upload } from "lucide-react";
import Link from "next/link";
import { use, useRef, useState } from "react";
import { toast } from "sonner";
import PageHeader from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

function StatusBadge({ status }: { status: BillingCycleStatus }) {
  if (status === "paid") {
    return (
      <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Paid</Badge>
    );
  }
  return (
    <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Unsettled</Badge>
  );
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
  const bookings = data?.bookings ?? [];
  const isPaid = cycle?.status === "paid";
  const hasProof = !!cycle?.payment_submitted_at;

  return (
    <div className="mx-auto max-w-3xl px-6 py-8 md:px-10">
      <Link
        href="/admin/billing"
        className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Billing
      </Link>

      <div className="mb-6 flex items-start justify-between gap-4">
        <PageHeader
          title={isLoading || !cycle ? "Billing cycle" : formatPeriod(cycle.period_start)}
          subtitle={data?.venue.name ?? ""}
        />
        {cycle && <StatusBadge status={cycle.status} />}
      </div>

      {/* Booking breakdown */}
      <div className="mb-8 rounded-lg border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Court</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Player</TableHead>
              <TableHead className="text-right">Fee</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((__, j) => (
                    <TableCell key={j}>
                      <div className="h-4 w-full animate-pulse rounded bg-muted" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : bookings.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-6 text-center text-sm text-muted-foreground"
                >
                  No bookings for this period.
                </TableCell>
              </TableRow>
            ) : (
              bookings.map((b) => (
                <TableRow key={b.booking_id}>
                  <TableCell className="text-sm">{b.date}</TableCell>
                  <TableCell className="text-sm">{b.court_name}</TableCell>
                  <TableCell className="whitespace-nowrap text-sm">
                    {b.start_time}–{b.end_time}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {b.player_name ?? "—"}
                  </TableCell>
                  <TableCell className="text-right text-sm font-medium">
                    {formatPhp(b.booking_fee)}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {cycle && (
          <div className="flex items-center justify-between border-t px-4 py-3">
            <span className="text-sm font-medium">
              {cycle.booking_count} booking{cycle.booking_count !== 1 ? "s" : ""}
            </span>
            <span className="text-base font-semibold">
              {formatPhp(cycle.total_booking_fees)}
            </span>
          </div>
        )}
      </div>

      {/* Payment section */}
      {cycle && (
        <div className="rounded-lg border border-border/60 p-5 space-y-4">
          <p className="font-medium">Payment</p>

          {isPaid ? (
            <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
              <CheckCircle className="h-4 w-4 shrink-0" />
              <span>
                Paid on{" "}
                {new Date(cycle.marked_paid_at!).toLocaleDateString("en-PH", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}
              </span>
            </div>
          ) : (
            <>
              {hasProof && !optimizedProof && (
                <div className="rounded-lg border border-border/60 p-4 space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Proof submitted on{" "}
                    {new Date(cycle.payment_submitted_at!).toLocaleDateString("en-PH", {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
                    {cycle.payment_method
                      ? ` via ${cycle.payment_method.toUpperCase()}`
                      : ""}
                  </p>
                  {proofUrl ? (
                    <img
                      src={proofUrl}
                      alt="Payment proof"
                      className="max-h-64 rounded-lg border object-contain"
                    />
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleViewProof}
                      disabled={loadingProof}
                    >
                      {loadingProof ? "Loading…" : "View proof"}
                    </Button>
                  )}
                </div>
              )}

              <div className="space-y-4">
                {hasProof && (
                  <p className="text-sm font-medium text-muted-foreground">
                    Re-upload proof
                  </p>
                )}

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
                      <SelectItem value="gcash">GCash</SelectItem>
                      <SelectItem value="maya">Maya</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Payment screenshot</Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept={[...PAYMENT_PROOF_ALLOWED_INPUT_MIME_TYPES].join(",")}
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={optimizing}
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    {optimizing ? "Optimizing…" : optimizedProof ? "Change image" : "Upload screenshot"}
                  </Button>
                  {optimizedProof && (
                    <div className="mt-3 space-y-2">
                      <img
                        src={optimizedProof.dataUrl}
                        alt="Preview"
                        className="max-h-48 rounded-lg border object-contain"
                      />
                      <p className="text-xs text-muted-foreground">
                        {optimizedProof.width}×{optimizedProof.height}px ·{" "}
                        {Math.round(optimizedProof.bytes / 1024)} KB
                      </p>
                    </div>
                  )}
                </div>

                <Button
                  onClick={() => submitMutation.mutate()}
                  disabled={
                    !optimizedProof || !paymentMethod || submitMutation.isPending
                  }
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

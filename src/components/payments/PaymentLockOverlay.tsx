"use client";

import { type ChangeEvent, useState } from "react";
import { CheckCircle2, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatPhp } from "@/lib/format-currency";
import { cn } from "@/lib/utils";

export type PaymentMethodOption = {
  method: "gcash" | "maya";
  account_name: string;
  account_number: string;
  label?: string;
};

type PaymentLockOverlayProps = {
  description: string;
  remainingSeconds: number;
  totalDue: number;
  paymentMethods: PaymentMethodOption[];
  selectedPaymentMethod: "gcash" | "maya" | null;
  onPaymentMethodChange: (value: "gcash" | "maya") => void;
  onPickProofFile: (file: File) => void | Promise<void>;
  proofPreviewUrl: string | null;
  proofOptimizing: boolean;
  onClearProof: () => void;
  onSubmit: () => void;
  submitDisabled: boolean;
  submitPending: boolean;
  submitLabel?: string;
};

export default function PaymentLockOverlay({
  description,
  remainingSeconds,
  totalDue,
  paymentMethods,
  selectedPaymentMethod,
  onPaymentMethodChange,
  onPickProofFile,
  proofPreviewUrl,
  proofOptimizing,
  onClearProof,
  onSubmit,
  submitDisabled,
  submitPending,
  submitLabel = "Submit for confirmation",
}: PaymentLockOverlayProps) {
  const [dragActive, setDragActive] = useState(false);
  const selectedPayment = paymentMethods.find(
    (method) => method.method === selectedPaymentMethod,
  );

  const onProofFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    void onPickProofFile(file);
    event.target.value = "";
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/85 p-4 backdrop-blur-sm">
      <Card className="w-full max-w-md border-primary/25 shadow-2xl">
        <CardContent className="space-y-5 p-6">
          <div className="space-y-1.5 text-center">
            <h2 className="font-heading text-xl font-semibold tracking-tight">
              Complete your payment
            </h2>
            <p className="text-sm text-muted-foreground leading-snug">{description}</p>
          </div>
          <div className="rounded-2xl bg-primary/10 px-4 py-4 text-center ring-1 ring-primary/20">
            <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              Time left to submit
            </p>
            <p className="mt-1 font-heading text-3xl font-bold text-primary tabular-nums">
              {Math.floor(remainingSeconds / 60).toString().padStart(2, "0")}:
              {(remainingSeconds % 60).toString().padStart(2, "0")}
            </p>
          </div>
          <div className="rounded-xl border border-border/70 bg-muted/40 px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Total due
            </p>
            <p className="mt-1 text-lg font-semibold text-foreground">
              {formatPhp(totalDue)}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="payment-method-select" className="text-sm font-medium">
              Pay with
            </Label>
            <Select
              value={selectedPaymentMethod ?? ""}
              onValueChange={(value) => onPaymentMethodChange(value as "gcash" | "maya")}
            >
              <SelectTrigger id="payment-method-select" className="h-11">
                <SelectValue placeholder="Choose GCash or Maya" />
              </SelectTrigger>
              <SelectContent>
                {paymentMethods.map((method) => (
                  <SelectItem key={method.method} value={method.method}>
                    {method.label ?? method.method.toUpperCase()}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedPayment ? (
              <div className="rounded-xl bg-muted/50 px-3.5 py-3 text-sm">
                <dl className="space-y-1">
                  <div>
                    <dt className="text-xs text-muted-foreground">Account name</dt>
                    <dd className="font-medium text-foreground">
                      {selectedPayment.account_name || "Unavailable"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Number</dt>
                    <dd className="font-mono text-[15px] font-medium tracking-wide text-foreground">
                      {selectedPayment.account_number || "Unavailable"}
                    </dd>
                  </div>
                </dl>
              </div>
            ) : null}
          </div>
          <div className="space-y-2" aria-busy={proofOptimizing}>
            <span className="text-sm font-medium text-foreground">Payment photo</span>
            <input
              id="payment-proof-file"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={onProofFileChange}
              className="sr-only"
            />
            {proofPreviewUrl && !proofOptimizing ? (
              <div className="overflow-hidden rounded-2xl border border-border bg-muted/20">
                {/* eslint-disable-next-line @next/next/no-img-element -- data URL preview */}
                <img
                  src={proofPreviewUrl}
                  alt="Preview of your payment screenshot"
                  className="max-h-48 w-full object-contain bg-black/5"
                />
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 bg-background/80 px-3 py-2.5">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden />
                    Looks good - tap submit when ready
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 shrink-0 text-muted-foreground"
                    onClick={onClearProof}
                  >
                    Change photo
                  </Button>
                </div>
              </div>
            ) : (
              <label
                htmlFor="payment-proof-file"
                onDragEnter={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragActive(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragActive(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDragActive(false);
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragActive(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file) void onPickProofFile(file);
                }}
                className={cn(
                  "flex min-h-38 cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition-colors",
                  dragActive
                    ? "border-primary bg-primary/10"
                    : "border-muted-foreground/25 bg-muted/15 hover:border-muted-foreground/40 hover:bg-muted/25",
                  proofOptimizing && "pointer-events-none opacity-70",
                )}
              >
                {proofOptimizing ? (
                  <>
                    <Loader2 className="h-9 w-9 animate-spin text-primary" aria-hidden />
                    <span className="text-sm font-medium text-foreground">
                      Preparing photo...
                    </span>
                    <span className="text-xs text-muted-foreground">
                      This usually takes a moment
                    </span>
                  </>
                ) : (
                  <>
                    <span className="flex size-12 items-center justify-center rounded-full bg-background shadow-sm ring-1 ring-border">
                      <Upload className="h-5 w-5 text-muted-foreground" aria-hidden />
                    </span>
                    <span className="text-sm font-medium text-foreground">
                      Tap to choose or drop a photo here
                    </span>
                    <span className="max-w-[16rem] text-xs text-muted-foreground leading-relaxed">
                      Screenshot or camera photo of your payment confirmation. JPG, PNG, or
                      WebP.
                    </span>
                  </>
                )}
              </label>
            )}
          </div>
          <Button
            type="button"
            size="lg"
            className="w-full font-heading font-semibold"
            onClick={onSubmit}
            disabled={submitDisabled}
          >
            {submitPending ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Submitting...
              </span>
            ) : (
              submitLabel
            )}
          </Button>
          <p className="text-center text-xs text-muted-foreground leading-relaxed">
            This window closes when the timer ends or after you submit.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

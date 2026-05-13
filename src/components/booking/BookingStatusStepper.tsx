"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { key: "awaiting", label: "Awaiting Confirmation" },
  { key: "confirmed", label: "Confirmed" },
  { key: "completed", label: "Completed" },
] as const;

function statusToActiveIndex(status: string): number {
  switch (status) {
    case "pending_payment":
    case "pending_confirmation":
    case "__session_mixed__":
      return 0;
    case "confirmed":
      return 1;
    case "completed":
      return 3; // beyond last → all done
    default:
      return 0;
  }
}

export function BookingStatusStepper({ status }: { status: string }) {
  const isCancelled = status === "cancelled";
  const isRefund = status === "refund";
  const isRefunded = status === "refunded";
  const activeIdx = statusToActiveIndex(status);

  if (isCancelled) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2.5">
        <span className="text-sm font-medium text-destructive">Booking cancelled</span>
      </div>
    );
  }

  if (isRefund) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
        <span className="text-sm font-medium text-amber-700">Refund in progress</span>
      </div>
    );
  }

  if (isRefunded) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2.5">
        <Check className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">Refunded</span>
      </div>
    );
  }

  return (
    <div className="flex w-full items-start">
      {STEPS.flatMap((step, i) => {
        const isDone = i < activeIdx;
        const isCurrent = i === activeIdx;
        const isLast = i === STEPS.length - 1;
        const stepEl = (
          <div key={step.key} className="flex shrink-0 flex-col items-center gap-1.5">
            <div
              className={cn(
                "flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold",
                isDone && "border-emerald-500 bg-emerald-500 text-white",
                isCurrent && "border-primary bg-primary text-primary-foreground",
                !isDone && !isCurrent && "border-border bg-background text-muted-foreground",
              )}
            >
              {isDone ? <Check className="h-3.5 w-3.5" /> : <span>{i + 1}</span>}
            </div>
            <span
              className={cn(
                "max-w-[5.5rem] text-center text-[11px] leading-tight",
                isDone && "font-medium text-emerald-600 dark:text-emerald-400",
                isCurrent && "font-semibold text-primary",
                !isDone && !isCurrent && "text-muted-foreground",
              )}
            >
              {step.label}
            </span>
          </div>
        );
        if (isLast) return [stepEl];
        return [
          stepEl,
          <div
            key={`${step.key}-line`}
            className={cn("mt-3.5 h-0.5 flex-1", isDone ? "bg-emerald-500" : "bg-border")}
          />,
        ];
      })}
    </div>
  );
}

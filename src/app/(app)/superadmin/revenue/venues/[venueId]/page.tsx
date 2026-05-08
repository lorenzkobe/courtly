"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { use, useState } from "react";
import { toast } from "sonner";
import PageHeader from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import type {
  BillingCycleDetailResponse,
  BillingCycleStatus,
  VenueBillingCycle,
} from "@/lib/types/courtly";

type StatusFilter = "all" | BillingCycleStatus;

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

function CycleDetailDialog({
  cycleId,
  venueId,
  open,
  onOpenChange,
}: {
  cycleId: string | null;
  venueId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const [proofUrl, setProofUrl] = useState<string | null>(null);
  const [loadingProof, setLoadingProof] = useState(false);

  const { data, isLoading } = useQuery<BillingCycleDetailResponse>({
    queryKey: ["superadmin", "billing", "cycle", cycleId],
    queryFn: async () => {
      const res = await courtlyApi.superadminBilling.getCycleDetail(cycleId!);
      return res.data;
    },
    enabled: open && !!cycleId,
    staleTime: 0,
  });

  const markPaidMutation = useMutation({
    mutationFn: () => courtlyApi.superadminBilling.markPaid(cycleId!),
    onSuccess: () => {
      toast.success("Billing cycle marked as paid.");
      queryClient.invalidateQueries({ queryKey: ["superadmin", "billing"] });
      onOpenChange(false);
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Something went wrong.")),
  });

  async function handleViewProof() {
    if (!cycleId) return;
    setLoadingProof(true);
    try {
      const res = await courtlyApi.superadminBilling.getProofUrl(cycleId);
      setProofUrl(res.data.url);
    } catch (err) {
      toast.error(apiErrorMessage(err, "Something went wrong."));
    } finally {
      setLoadingProof(false);
    }
  }

  const cycle = data?.cycle;
  const bookings = data?.bookings ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setProofUrl(null);
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {isLoading || !cycle ? (
              "Loading…"
            ) : (
              <>
                {formatPeriod(cycle.period_start)}
                <StatusBadge status={cycle.status} />
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3 py-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-6 animate-pulse rounded bg-muted" />
            ))}
          </div>
        ) : cycle ? (
          <div className="space-y-5">
            <div className="rounded-lg border border-border/60">
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
                  {bookings.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="py-6 text-center text-sm text-muted-foreground"
                      >
                        No bookings found for this period.
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
              <div className="flex items-center justify-between border-t px-4 py-3">
                <span className="text-sm font-medium">
                  {cycle.booking_count} booking
                  {cycle.booking_count !== 1 ? "s" : ""}
                </span>
                <span className="text-base font-semibold">
                  {formatPhp(cycle.total_booking_fees)}
                </span>
              </div>
            </div>

            {cycle.payment_submitted_at && (
              <div className="space-y-3 rounded-lg border border-border/60 p-4">
                <p className="text-sm font-medium">Payment proof</p>
                <p className="text-xs text-muted-foreground">
                  Submitted{" "}
                  {new Date(cycle.payment_submitted_at).toLocaleDateString("en-PH", {
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

            {cycle.status === "paid" && cycle.marked_paid_at && (
              <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
                <CheckCircle className="h-4 w-4 shrink-0" />
                <span>
                  Marked as paid on{" "}
                  {new Date(cycle.marked_paid_at).toLocaleDateString("en-PH", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
              </div>
            )}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          {cycle?.status === "unsettled" && (
            <Button
              onClick={() => markPaidMutation.mutate()}
              disabled={markPaidMutation.isPending}
            >
              {markPaidMutation.isPending ? "Marking…" : "Mark as paid"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function VenueBillingDetailPage({
  params,
}: {
  params: Promise<{ venueId: string }>;
}) {
  const { venueId } = use(params);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [selectedCycleId, setSelectedCycleId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ["superadmin", "billing", "summary", venueId],
    queryFn: async () => {
      const res = await courtlyApi.superadminBilling.summary({ venue_id: venueId });
      return res.data;
    },
    staleTime: 30_000,
  });

  const venueRow = data?.venues.find((v) => v.venue_id === venueId);
  const venueName = venueRow?.venue_name ?? "Venue";
  const allCycles = data?.venue_cycles ?? [];

  const cycles = allCycles.filter((c: VenueBillingCycle) => {
    if (statusFilter === "all") return true;
    return c.status === statusFilter;
  });

  const totalGenerated = allCycles.reduce((s, c) => s + c.total_booking_fees, 0);
  const totalUnsettled = allCycles
    .filter((c) => c.status === "unsettled")
    .reduce((s, c) => s + c.total_booking_fees, 0);
  const totalPaid = allCycles
    .filter((c) => c.status === "paid")
    .reduce((s, c) => s + c.total_booking_fees, 0);

  function openCycle(id: string) {
    setSelectedCycleId(id);
    setDialogOpen(true);
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 md:px-10">
      <Link
        href="/superadmin/revenue"
        className="mb-4 flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Billing
      </Link>

      <PageHeader
        title={(isLoading || isRefetching) ? "Billing" : venueName}
        subtitle="Billing cycles"
      >
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => void refetch()}
          disabled={isLoading || isRefetching}
        >
          <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
        </Button>
      </PageHeader>

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total fees generated
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-heading font-bold">
              {(isLoading || isRefetching) ? "—" : formatPhp(totalGenerated)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Current payable
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-heading font-bold text-amber-600">
              {(isLoading || isRefetching) ? "—" : formatPhp(totalUnsettled)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total paid
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-heading font-bold text-green-600">
              {(isLoading || isRefetching) ? "—" : formatPhp(totalPaid)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mb-4 flex items-center gap-2">
        <span className="text-sm font-medium text-muted-foreground">Filter:</span>
        {(["all", "unsettled", "paid"] as StatusFilter[]).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={statusFilter === s ? "default" : "outline"}
            className="capitalize"
            onClick={() => setStatusFilter(s)}
          >
            {s === "all" ? "All" : s}
          </Button>
        ))}
      </div>

      <div className="rounded-lg border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Period</TableHead>
              <TableHead className="text-right">Bookings</TableHead>
              <TableHead className="text-right">Total fees</TableHead>
              <TableHead>Proof</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(isLoading || isRefetching) ? (
              Array.from({ length: 3 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((__, j) => (
                    <TableCell key={j}>
                      <div className="h-4 w-full animate-pulse rounded bg-muted" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : cycles.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-8 text-center text-muted-foreground"
                >
                  No billing cycles found.
                </TableCell>
              </TableRow>
            ) : (
              cycles.map((c) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => openCycle(c.id)}
                >
                  <TableCell className="font-medium">
                    {formatPeriod(c.period_start)}
                  </TableCell>
                  <TableCell className="text-right">{c.booking_count}</TableCell>
                  <TableCell className="text-right font-medium">
                    {formatPhp(c.total_booking_fees)}
                  </TableCell>
                  <TableCell>
                    {c.payment_submitted_at ? (
                      <span className="text-sm text-green-700">Uploaded</span>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={c.status} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <CycleDetailDialog
        cycleId={selectedCycleId}
        venueId={venueId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
      />
    </div>
  );
}

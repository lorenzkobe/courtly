"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Receipt, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { Suspense, useState } from "react";
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
import type { BillingSummaryVenueRow, BillingCycleStatus } from "@/lib/types/courtly";

type StatusFilter = "all" | BillingCycleStatus;
type GenerateMode = "backfill" | "replace_unsettled";

function getPreviousMonth(): { year: number; month: number } {
  const now = new Date();
  const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return { year: prev.getFullYear(), month: prev.getMonth() + 1 };
}

function buildMonthOptions() {
  const options: { label: string; year: number; month: number }[] = [];
  const now = new Date();
  for (let i = 1; i <= 12; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    options.push({
      label: d.toLocaleDateString("en-PH", { year: "numeric", month: "long" }),
      year: d.getFullYear(),
      month: d.getMonth() + 1,
    });
  }
  return options;
}

function venueStatusBadge(row: BillingSummaryVenueRow) {
  if (row.total_cycles === 0) return <Badge variant="secondary">No cycles</Badge>;
  if (row.unsettled_cycles === 0) return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">All paid</Badge>;
  if (row.paid_cycles === 0) return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Unsettled</Badge>;
  return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Partial</Badge>;
}

function GenerateBillingDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}) {
  const defaultMonth = getPreviousMonth();
  const [mode, setMode] = useState<GenerateMode>("backfill");
  const [selectedYear, setSelectedYear] = useState(defaultMonth.year);
  const [selectedMonth, setSelectedMonth] = useState(defaultMonth.month);
  const monthOptions = buildMonthOptions();

  const mutation = useMutation({
    mutationFn: () =>
      courtlyApi.superadminBilling.generateMonthly({
        year: selectedYear,
        month: selectedMonth,
        mode,
      }),
    onSuccess: (res) => {
      const { data } = res;
      const paidMsg = data.protected_paid > 0 ? `, ${data.protected_paid} paid cycle(s) protected` : "";
      toast.success(`Generated ${data.generated}, skipped ${data.skipped}${paidMsg}.`);
      onSuccess();
      onOpenChange(false);
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Something went wrong.")),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Generate billing cycles</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">
          <div className="space-y-2">
            <Label>Billing month</Label>
            <Select
              value={`${selectedYear}-${selectedMonth}`}
              onValueChange={(v) => {
                const [y, m] = v.split("-").map(Number);
                setSelectedYear(y);
                setSelectedMonth(m);
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthOptions.map((o) => (
                  <SelectItem key={`${o.year}-${o.month}`} value={`${o.year}-${o.month}`}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Mode</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode("backfill")}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  mode === "backfill"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/40"
                }`}
              >
                <p className="text-sm font-medium">Fill missing</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Only create cycles that don&apos;t exist yet. Safe to run anytime.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setMode("replace_unsettled")}
                className={`rounded-lg border p-3 text-left transition-colors ${
                  mode === "replace_unsettled"
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-primary/40"
                }`}
              >
                <p className="text-sm font-medium">Regenerate unsettled</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Recalculate all unsettled cycles. Paid cycles are never touched.
                </p>
              </button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Generating…" : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BillingOverviewInner() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [generateOpen, setGenerateOpen] = useState(false);

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ["superadmin", "billing", "summary"],
    queryFn: async () => {
      const res = await courtlyApi.superadminBilling.summary();
      return res.data;
    },
    staleTime: 30_000,
  });

  const totals = data?.platform_totals;

  const filteredVenues = (data?.venues ?? []).filter((v) => {
    if (statusFilter === "all") return true;
    if (statusFilter === "unsettled") return v.unsettled_cycles > 0;
    if (statusFilter === "paid") return v.paid_cycles > 0;
    return true;
  });

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 md:px-10">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <PageHeader
          title="Billing"
          subtitle="Monthly booking fee statements per venue."
        />
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => void refetch()}
            disabled={isLoading || isRefetching}
          >
            <RefreshCw className={`h-4 w-4 ${isRefetching ? "animate-spin" : ""}`} />
          </Button>
          <Button
            onClick={() => setGenerateOpen(true)}
            variant="outline"
          >
            <Receipt className="mr-2 h-4 w-4" />
            Generate billing
          </Button>
        </div>
      </div>

      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total fees (all time)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-heading font-bold">
              {(isLoading || isRefetching) ? "—" : formatPhp(totals?.total_fees_all_time ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total unsettled
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-heading font-bold text-amber-600">
              {(isLoading || isRefetching) ? "—" : formatPhp(totals?.total_fees_unsettled ?? 0)}
            </p>
            {!(isLoading || isRefetching) && (totals?.unsettled_cycle_count ?? 0) > 0 && (
              <p className="text-xs text-muted-foreground">
                {totals?.unsettled_cycle_count} cycle(s)
              </p>
            )}
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
              {(isLoading || isRefetching) ? "—" : formatPhp(totals?.total_fees_paid ?? 0)}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="mb-4 flex items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground">Filter:</span>
        {(["all", "unsettled", "paid"] as StatusFilter[]).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={statusFilter === s ? "default" : "outline"}
            className="capitalize"
            onClick={() => setStatusFilter(s)}
          >
            {s === "all" ? "All venues" : s}
          </Button>
        ))}
      </div>

      <div className="rounded-lg border border-border/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Venue</TableHead>
              <TableHead className="text-right">Cycles</TableHead>
              <TableHead className="text-right">Unsettled</TableHead>
              <TableHead className="text-right">Total fees</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(isLoading || isRefetching) ? (
              Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((__, j) => (
                    <TableCell key={j}>
                      <div className="h-4 w-full animate-pulse rounded bg-muted" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : filteredVenues.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  No venues found.
                </TableCell>
              </TableRow>
            ) : (
              filteredVenues.map((v) => (
                <TableRow
                  key={v.venue_id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/superadmin/revenue/venues/${v.venue_id}`)}
                >
                  <TableCell className="font-medium">{v.venue_name}</TableCell>
                  <TableCell className="text-right">{v.total_cycles}</TableCell>
                  <TableCell className="text-right">
                    {v.unsettled_cycles > 0 ? (
                      <span className="text-amber-600">{v.unsettled_cycles}</span>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatPhp(v.total_fees_unsettled)}
                    {v.total_fees_all_time !== v.total_fees_unsettled && (
                      <span className="ml-1 text-xs text-muted-foreground">
                        / {formatPhp(v.total_fees_all_time)}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{venueStatusBadge(v)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <GenerateBillingDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        onSuccess={() =>
          queryClient.invalidateQueries({ queryKey: ["superadmin", "billing", "summary"] })
        }
      />
    </div>
  );
}

export default function SuperadminBillingPage() {
  return (
    <Suspense>
      <BillingOverviewInner />
    </Suspense>
  );
}

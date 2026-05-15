"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Receipt, RefreshCw, Trash2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
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
import type { BillingSummaryVenueRow, BillingCycleStatus, PlatformPaymentMethod } from "@/lib/types/courtly";
import { isValidPhMobile } from "@/lib/validation/person-fields";

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

function PaymentMethodDialog({
  open,
  onOpenChange,
  existing,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  existing: PlatformPaymentMethod | null;
  onSuccess: () => void;
}) {
  const isEdit = !!existing;
  const [method, setMethod] = useState<"gcash" | "maya">(existing?.method ?? "gcash");
  const [accountName, setAccountName] = useState(existing?.account_name ?? "");
  const [accountNumber, setAccountNumber] = useState(existing?.account_number ?? "");

  const mutation = useMutation({
    mutationFn: () =>
      isEdit
        ? courtlyApi.superadminBilling.updatePaymentMethod(existing!.id, {
            account_name: accountName,
            account_number: accountNumber,
          })
        : courtlyApi.superadminBilling.createPaymentMethod({ method, account_name: accountName, account_number: accountNumber }),
    onSuccess: () => {
      toast.success(isEdit ? "Payment method updated." : "Payment method added.");
      onSuccess();
      onOpenChange(false);
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Something went wrong.")),
  });

  function handleOpen(v: boolean) {
    if (!v) {
      setMethod(existing?.method ?? "gcash");
      setAccountName(existing?.account_name ?? "");
      setAccountNumber(existing?.account_number ?? "");
    }
    onOpenChange(v);
  }

  const numberTouched = accountNumber.trim().length > 0;
  const numberValid = isValidPhMobile(accountNumber);
  const canSubmit = accountName.trim().length > 0 && numberValid;

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit payment method" : "Add payment method"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-1">
          {!isEdit && (
            <div className="space-y-2">
              <Label>Method</Label>
              <Select value={method} onValueChange={(v) => setMethod(v as "gcash" | "maya")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gcash">GCash</SelectItem>
                  <SelectItem value="maya">Maya</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label>Account name</Label>
            <Input
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="e.g. Juan dela Cruz"
            />
          </div>
          <div className="space-y-2">
            <Label>Account number</Label>
            <Input
              value={accountNumber}
              onChange={(e) => setAccountNumber(e.target.value)}
              placeholder="09XX XXX XXXX"
              className={numberTouched && !numberValid ? "border-destructive focus-visible:ring-destructive" : ""}
            />
            {numberTouched && !numberValid && (
              <p className="text-xs text-destructive">
                Enter a valid PH mobile number (e.g. 09171234567 or 639171234567).
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpen(false)}>Cancel</Button>
          <Button onClick={() => mutation.mutate()} disabled={!canSubmit || mutation.isPending}>
            {mutation.isPending ? "Saving…" : isEdit ? "Save changes" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PlatformPaymentMethodsSection() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<PlatformPaymentMethod | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["superadmin", "billing", "payment-methods"],
    queryFn: async () => {
      const res = await courtlyApi.superadminBilling.listPaymentMethods();
      return res.data;
    },
    staleTime: 60_000,
  });

  const methods = data?.methods ?? [];

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: string; is_active: boolean }) =>
      courtlyApi.superadminBilling.updatePaymentMethod(id, { is_active }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["superadmin", "billing", "payment-methods"] }),
    onError: (err) => toast.error(apiErrorMessage(err, "Something went wrong.")),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => courtlyApi.superadminBilling.deletePaymentMethod(id),
    onSuccess: () => {
      toast.success("Payment method removed.");
      queryClient.invalidateQueries({ queryKey: ["superadmin", "billing", "payment-methods"] });
    },
    onError: (err) => toast.error(apiErrorMessage(err, "Something went wrong.")),
  });

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["superadmin", "billing", "payment-methods"] });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-base font-heading">Platform payment methods</CardTitle>
        <Button
          size="sm"
          variant="outline"
          onClick={() => { setEditing(null); setDialogOpen(true); }}
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          Add
        </Button>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-10 animate-pulse rounded-lg bg-muted" />
            ))}
          </div>
        ) : methods.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No payment methods configured. Add one so venue admins know where to send billing payments.
          </p>
        ) : (
          <div className="divide-y divide-border/60">
            {methods.map((m) => (
              <div key={m.id} className="flex items-center gap-3 py-3">
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${m.method === "gcash" ? "bg-blue-100 text-blue-700" : "bg-green-100 text-green-700"}`}>
                  {m.method === "gcash" ? "G" : "M"}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium leading-tight">{m.account_name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{m.account_number}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => toggleMutation.mutate({ id: m.id, is_active: !m.is_active })}
                    disabled={toggleMutation.isPending}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${m.is_active ? "bg-green-100 text-green-700 hover:bg-green-200" : "bg-muted text-muted-foreground hover:bg-muted/80"}`}
                  >
                    {m.is_active ? "Active" : "Inactive"}
                  </button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => { setEditing(m); setDialogOpen(true); }}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive hover:text-destructive"
                    onClick={() => deleteMutation.mutate(m.id)}
                    disabled={deleteMutation.isPending}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <PaymentMethodDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        existing={editing}
        onSuccess={invalidate}
      />
    </Card>
  );
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
  const [selectedVenueId, setSelectedVenueId] = useState<string>("all");
  const monthOptions = buildMonthOptions();

  const venuesQuery = useQuery({
    queryKey: ["superadmin", "billing", "generate-venues"],
    queryFn: async () => {
      const res = await courtlyApi.venues.list();
      return res.data
        .filter((v) => v.status === "active")
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    enabled: open,
    staleTime: 60_000,
  });
  const venueOptions = venuesQuery.data ?? [];

  const mutation = useMutation({
    mutationFn: () =>
      courtlyApi.superadminBilling.generateMonthly({
        year: selectedYear,
        month: selectedMonth,
        mode,
        venue_id: selectedVenueId === "all" ? undefined : selectedVenueId,
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
            <Label>Venue</Label>
            <Select
              value={selectedVenueId}
              onValueChange={setSelectedVenueId}
              disabled={venuesQuery.isLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder={venuesQuery.isLoading ? "Loading venues…" : "All venues"} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All active venues</SelectItem>
                {venueOptions.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Limit generation to a single venue, or run for every active venue.
            </p>
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
                <p className="text-sm font-medium">Only create missing cycles</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Skip venues that already have a cycle for this month. Safe to re-run.
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
                <p className="text-sm font-medium">Recalculate unsettled cycles</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Re-run the totals for unsettled cycles this month. Paid cycles are never touched.
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

      <div className="mt-8">
        <PlatformPaymentMethodsSection />
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

"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import PageHeader from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { courtlyApi } from "@/lib/api/courtly-client";
import { formatPhp } from "@/lib/format-currency";
import type { BillingCycleStatus } from "@/lib/types/courtly";

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

export default function AdminBillingPage() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "billing", "list"],
    queryFn: async () => {
      const res = await courtlyApi.adminBilling.list();
      return res.data;
    },
    staleTime: 30_000,
  });

  const allCycles = data?.cycles ?? [];
  const cycles = allCycles.filter((c) => {
    if (statusFilter === "all") return true;
    return c.status === statusFilter;
  });

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 md:px-10">
      <PageHeader
        title="Billing"
        subtitle={
          data?.venue.name
            ? `Monthly booking fee statements for ${data.venue.name}.`
            : "Monthly booking fee statements."
        }
      />

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
            ) : cycles.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="py-10 text-center text-muted-foreground"
                >
                  {allCycles.length === 0
                    ? "No billing cycles have been generated yet."
                    : "No cycles match the selected filter."}
                </TableCell>
              </TableRow>
            ) : (
              cycles.map((c) => (
                <TableRow
                  key={c.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/admin/billing/${c.id}`)}
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
    </div>
  );
}

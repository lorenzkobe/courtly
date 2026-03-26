"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useMemo } from "react";
import { RevenueDateFilter } from "@/components/admin/RevenueDateFilter";
import PageHeader from "@/components/shared/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
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

function VenueRevenueInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";

  const setRange = useCallback(
    (nextFrom: string, nextTo: string) => {
      const p = new URLSearchParams(searchParams.toString());
      if (nextFrom) p.set("from", nextFrom);
      else p.delete("from");
      if (nextTo) p.set("to", nextTo);
      else p.delete("to");
      const qs = p.toString();
      router.replace(`/admin/revenue${qs ? `?${qs}` : ""}`);
    },
    [router, searchParams],
  );

  const queryParams = useMemo(
    () => ({
      from: from || undefined,
      to: to || undefined,
    }),
    [from, to],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["revenue-summary", "venue", queryParams.from, queryParams.to],
    queryFn: async () => {
      const { data: d } = await courtlyApi.revenue.summary(queryParams);
      return d;
    },
  });

  if (isLoading || !data) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 px-6 py-8 md:px-10">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const { totals, fee_percent, by_court } = data;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 md:px-10">
      <PageHeader
        title="Revenue"
        subtitle="Earnings from confirmed and completed reservations on your courts. Filter by reservation date; customer totals include the Courtly transaction fee on top of your listed rates."
      />

      <div className="mb-6">
        <RevenueDateFilter
          from={from}
          to={to}
          onFromChange={(v) => setRange(v, to)}
          onToChange={(v) => setRange(from, v)}
          onClear={() => setRange("", "")}
        />
        {from || to ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Showing bookings whose <strong className="font-medium text-foreground">reservation date</strong>{" "}
            falls in this range.
          </p>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">All dates — lifetime totals for your courts.</p>
        )}
      </div>

      <div className="mb-8 rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
        <strong className="font-medium text-foreground">Your net</strong> is the
        court subtotal (what you earn from court time before the platform fee).{" "}
        <strong className="font-medium text-foreground">Platform fee</strong> is
        the {fee_percent}% collected on top of that subtotal — it is not deducted
        from your rate in this demo model.
      </div>

      <div className="mb-10 grid gap-4 sm:grid-cols-3">
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-sm font-medium text-muted-foreground">
              Your net (court subtotal)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-heading text-2xl font-bold text-foreground">
              {formatPhp(totals.court_net)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {totals.booking_count} billable booking
              {totals.booking_count === 1 ? "" : "s"}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-sm font-medium text-muted-foreground">
              Platform fees (on your bookings)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-heading text-2xl font-bold text-foreground">
              {formatPhp(totals.platform_fees)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {fee_percent}% on top of your subtotal — retained by Courtly
            </p>
          </CardContent>
        </Card>
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-sm font-medium text-muted-foreground">
              Paid by customers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-heading text-2xl font-bold text-primary">
              {formatPhp(totals.customer_total)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Subtotal + platform fee
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">By court</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Court</TableHead>
                <TableHead className="text-right">Bookings</TableHead>
                <TableHead className="text-right">Your net</TableHead>
                <TableHead className="text-right">Platform fee</TableHead>
                <TableHead className="text-right">Customer total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {by_court.map((row) => (
                <TableRow key={row.court_id}>
                  <TableCell className="font-medium">{row.court_name}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.booking_count}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPhp(row.court_net)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatPhp(row.platform_fees)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPhp(row.customer_total)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Fallback() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-8 md:px-10">
      <Skeleton className="h-12 w-64" />
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="grid gap-4 sm:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export default function VenueRevenuePage() {
  return (
    <Suspense fallback={<Fallback />}>
      <VenueRevenueInner />
    </Suspense>
  );
}

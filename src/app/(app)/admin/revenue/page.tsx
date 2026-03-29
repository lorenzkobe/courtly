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
      const { data: revenueSummary } =
        await courtlyApi.revenue.summary(queryParams);
      return revenueSummary;
    },
  });

  const byCourtRows = data?.by_court;
  const byVenue = useMemo(() => {
    if (!byCourtRows?.length) return [];
    const groups = new Map<
      string,
      {
        venueName: string;
        rows: NonNullable<typeof byCourtRows>;
        totals: {
          booking_count: number;
          court_net: number;
          booking_fees: number;
          customer_total: number;
        };
      }
    >();

    for (const row of byCourtRows) {
      const key = row.venue_id ?? "unassigned";
      const venueName = row.venue_name ?? "Unassigned venue";
      const existing = groups.get(key) ?? {
        venueName,
        rows: [],
        totals: {
          booking_count: 0,
          court_net: 0,
          booking_fees: 0,
          customer_total: 0,
        },
      };
      existing.rows.push(row);
      existing.totals.booking_count += row.booking_count;
      existing.totals.court_net += row.court_net;
      existing.totals.booking_fees += row.booking_fees;
      existing.totals.customer_total += row.customer_total;
      groups.set(key, existing);
    }

    return [...groups.values()].sort((a, b) => b.totals.customer_total - a.totals.customer_total);
  }, [byCourtRows]);

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

  const { totals } = data;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 md:px-10">
      <PageHeader
        title="Revenue"
        subtitle="Earnings from confirmed and completed reservations on your courts. Filter by reservation date; customer totals include Courtly booking fees on top of your listed rates."
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
        court subtotal (what you earn from court time before the booking fee).{" "}
        <strong className="font-medium text-foreground">Booking fees</strong> are
        fixed per court and collected on top of that subtotal — they are not
        deducted from your rate in this demo model.
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
              Booking fees (on your bookings)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-heading text-2xl font-bold text-foreground">
              {formatPhp(totals.booking_fees)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Flat fee retained by Courtly</p>
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
              Subtotal + booking fee
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4">
        {byVenue.map((group) => (
          <Card key={group.venueName}>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <CardTitle className="font-heading text-lg">{group.venueName}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {group.totals.booking_count} booking
                  {group.totals.booking_count === 1 ? "" : "s"} ·{" "}
                  {formatPhp(group.totals.customer_total)} customer total
                </p>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-3">
                <Card className="border-border/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="font-heading text-xs font-medium text-muted-foreground">
                      Venue net
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="font-heading text-lg font-bold text-foreground">
                      {formatPhp(group.totals.court_net)}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-border/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="font-heading text-xs font-medium text-muted-foreground">
                      Venue booking fees
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="font-heading text-lg font-bold text-foreground">
                      {formatPhp(group.totals.booking_fees)}
                    </p>
                  </CardContent>
                </Card>
                <Card className="border-primary/20 bg-primary/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="font-heading text-xs font-medium text-muted-foreground">
                      Venue customer total
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <p className="font-heading text-lg font-bold text-primary">
                      {formatPhp(group.totals.customer_total)}
                    </p>
                  </CardContent>
                </Card>
              </div>
              <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Court</TableHead>
                    <TableHead className="text-right">Bookings</TableHead>
                    <TableHead className="text-right">Your net</TableHead>
                    <TableHead className="text-right">Booking fee</TableHead>
                    <TableHead className="text-right">Customer total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {group.rows.map((row) => (
                    <TableRow key={row.court_id}>
                      <TableCell className="font-medium">{row.court_name}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {row.booking_count}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPhp(row.court_net)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-muted-foreground">
                        {formatPhp(row.booking_fees)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatPhp(row.customer_total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
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

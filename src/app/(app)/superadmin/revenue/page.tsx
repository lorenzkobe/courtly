"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
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

function accountHref(accountId: string, from: string, to: string) {
  const seg = accountId === "" ? "unassigned" : accountId;
  const q = new URLSearchParams();
  if (from) q.set("from", from);
  if (to) q.set("to", to);
  const qs = q.toString();
  return `/superadmin/revenue/accounts/${seg}${qs ? `?${qs}` : ""}`;
}

function PlatformRevenueInner() {
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
      router.replace(`/superadmin/revenue${qs ? `?${qs}` : ""}`);
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
    queryKey: ["revenue-summary", "platform", queryParams.from, queryParams.to],
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

  const { totals, fee_percent, by_account } = data;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 md:px-10">
      <PageHeader
        title="Platform revenue"
        subtitle="Totals and court accounts for the selected reservation dates. Open an account to see courts and per-court income. Confirmed and completed bookings only."
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
            Showing bookings with reservation date
            {from && to && from === to
              ? ` on ${from}.`
              : from && to
                ? ` from ${from} through ${to}.`
                : from
                  ? ` on or after ${from}.`
                  : ` on or before ${to}.`}
          </p>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">
            No date filter — all time for courts in the network.
          </p>
        )}
      </div>

      <div className="mb-8 rounded-xl border border-border/60 bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
        <strong className="font-medium text-foreground">Court net</strong> is the
        reservation subtotal for venues (before the {fee_percent}% fee).{" "}
        <strong className="font-medium text-foreground">Courtly fees</strong> are
        charged to customers on top. <strong className="font-medium text-foreground">Customer total</strong>{" "}
        is what players paid.
      </div>

      <div className="mb-10 grid gap-4 sm:grid-cols-3">
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-sm font-medium text-muted-foreground">
              Court net (payable to venues)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-heading text-2xl font-bold text-foreground">
              {formatPhp(totals.court_net)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-primary/25 bg-primary/5">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-sm font-medium text-muted-foreground">
              Courtly booking fees
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-heading text-2xl font-bold text-primary">
              {formatPhp(totals.platform_fees)}
            </p>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-sm font-medium text-muted-foreground">
              Customer payments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-heading text-2xl font-bold text-foreground">
              {formatPhp(totals.customer_total)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {totals.booking_count} booking{totals.booking_count === 1 ? "" : "s"}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-heading text-lg">Court accounts</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {by_account && by_account.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Bookings</TableHead>
                  <TableHead className="text-right">Court net</TableHead>
                  <TableHead className="text-right">Courtly fee</TableHead>
                  <TableHead className="text-right">Customer total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {by_account.map((row) => (
                  <TableRow
                    key={row.court_account_id || "unassigned"}
                    className="cursor-pointer transition-colors hover:bg-muted/50"
                  >
                    <TableCell className="font-medium">
                      <Link
                        href={accountHref(row.court_account_id, from, to)}
                        className="text-primary underline-offset-4 hover:underline"
                      >
                        {row.court_account_name}
                      </Link>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.booking_count}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPhp(row.court_net)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-primary">
                      {formatPhp(row.platform_fees)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPhp(row.customer_total)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-sm text-muted-foreground">No account data.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function PlatformRevenueFallback() {
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

export default function PlatformRevenuePage() {
  return (
    <Suspense fallback={<PlatformRevenueFallback />}>
      <PlatformRevenueInner />
    </Suspense>
  );
}

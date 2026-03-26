"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useMemo } from "react";
import { ArrowLeft } from "lucide-react";
import { RevenueDateFilter } from "@/components/admin/RevenueDateFilter";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
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

function AccountRevenueInner() {
  const params = useParams<{ accountId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const accountId = params.accountId;
  const courtAccountParam =
    accountId === "unassigned" ? "unassigned" : (accountId ?? "");

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
      router.replace(
        `/superadmin/revenue/accounts/${accountId}${qs ? `?${qs}` : ""}`,
      );
    },
    [router, searchParams, accountId],
  );

  const queryParams = useMemo(
    () => ({
      from: from || undefined,
      to: to || undefined,
      court_account_id: courtAccountParam,
    }),
    [from, to, courtAccountParam],
  );

  const backHref = useMemo(() => {
    const p = new URLSearchParams();
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    const qs = p.toString();
    return `/superadmin/revenue${qs ? `?${qs}` : ""}`;
  }, [from, to]);

  const { data, isLoading, isError } = useQuery({
    queryKey: [
      "revenue-summary",
      "account",
      courtAccountParam,
      queryParams.from,
      queryParams.to,
    ],
    queryFn: async () => {
      const { data: d } = await courtlyApi.revenue.summary(queryParams);
      return d;
    },
    enabled: !!courtAccountParam,
  });

  if (isLoading || !data) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 px-6 py-8 md:px-10">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8 md:px-10">
        <p className="text-muted-foreground">Could not load revenue for this account.</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/superadmin/revenue">Back to platform revenue</Link>
        </Button>
      </div>
    );
  }

  const { totals, fee_percent, by_court, focus_account } = data;
  const title = focus_account?.name ?? "Court account";

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 md:px-10">
      <Button variant="ghost" className="mb-4 -ml-2" asChild>
        <Link href={backHref}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Platform revenue
        </Link>
      </Button>

      <PageHeader
        title={title}
        subtitle="Courts under this account and booking income for the selected reservation dates."
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
            Filter matches booking <strong className="font-medium text-foreground">reservation date</strong>{" "}
            (not payment date).
          </p>
        ) : null}
      </div>

      <div className="mb-10 grid gap-4 sm:grid-cols-3">
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-sm font-medium text-muted-foreground">
              Court net
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
              Courtly fees
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-heading text-2xl font-bold text-primary">
              {formatPhp(totals.platform_fees)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{fee_percent}% on subtotal</p>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardHeader className="pb-2">
            <CardTitle className="font-heading text-sm font-medium text-muted-foreground">
              Customer total
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
          <CardTitle className="font-heading text-lg">Courts in this account</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Court</TableHead>
                <TableHead className="text-right">Bookings</TableHead>
                <TableHead className="text-right">Court net</TableHead>
                <TableHead className="text-right">Courtly fee</TableHead>
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
        </CardContent>
      </Card>
    </div>
  );
}

function Fallback() {
  return (
    <div className="mx-auto max-w-7xl space-y-6 px-6 py-8 md:px-10">
      <Skeleton className="h-10 w-56" />
      <Skeleton className="h-24 w-full rounded-xl" />
    </div>
  );
}

export default function AccountRevenueDetailPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <AccountRevenueInner />
    </Suspense>
  );
}

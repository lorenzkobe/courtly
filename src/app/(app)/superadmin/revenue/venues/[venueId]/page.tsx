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

function VenueRevenueInner() {
  const params = useParams<{ venueId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const venueRouteId = params.venueId;
  const venueFilterParam =
    venueRouteId === "unassigned" ? "unassigned" : (venueRouteId ?? "");

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
        `/superadmin/revenue/venues/${venueRouteId}${qs ? `?${qs}` : ""}`,
      );
    },
    [router, searchParams, venueRouteId],
  );

  const queryParams = useMemo(
    () => ({
      from: from || undefined,
      to: to || undefined,
      venue_id: venueFilterParam,
    }),
    [from, to, venueFilterParam],
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
      "venue",
      venueFilterParam,
      queryParams.from,
      queryParams.to,
    ],
    queryFn: async () => {
      const { data: revenueSummary } =
        await courtlyApi.revenue.summary(queryParams);
      return revenueSummary;
    },
    enabled: !!venueFilterParam,
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
        <p className="text-muted-foreground">Could not load revenue for this venue.</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/superadmin/revenue">Back to platform revenue</Link>
        </Button>
      </div>
    );
  }

  const { totals, by_court, focus_venue } = data;
  const title = focus_venue?.name ?? "Venue";

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
        subtitle="Courts under this venue and booking income for the selected reservation dates."
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
              Courtly booking fees
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="font-heading text-2xl font-bold text-primary">
              {formatPhp(totals.booking_fees)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Flat fee per booking</p>
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
          <CardTitle className="font-heading text-lg">Courts in this venue</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Court</TableHead>
                <TableHead className="text-right">Bookings</TableHead>
                <TableHead className="text-right">Court net</TableHead>
                <TableHead className="text-right">Courtly booking fee</TableHead>
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
                    {formatPhp(row.booking_fees)}
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

export default function VenueRevenueDetailPage() {
  return (
    <Suspense fallback={<Fallback />}>
      <VenueRevenueInner />
    </Suspense>
  );
}

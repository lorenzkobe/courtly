"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Fragment, Suspense, useCallback, useMemo, useState } from "react";
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
  const [expandedCourts, setExpandedCourts] = useState<Record<string, boolean>>({});
  const toggleCourtExpanded = useCallback((courtId: string) => {
    setExpandedCourts((current) => ({ ...current, [courtId]: !current[courtId] }));
  }, []);

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
              {by_court.map((row) => {
                const isExpanded = Boolean(expandedCourts[row.court_id]);
                const hasBreakdown = (row.rate_breakdown?.length ?? 0) > 0;
                return (
                  <Fragment key={row.court_id}>
                    <TableRow>
                      <TableCell className="font-medium">
                        <button
                          type="button"
                          onClick={() => toggleCourtExpanded(row.court_id)}
                          className="inline-flex items-center gap-2 text-left hover:text-primary"
                          aria-expanded={isExpanded}
                        >
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          )}
                          <span>{row.court_name}</span>
                        </button>
                      </TableCell>
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
                    {isExpanded ? (
                      <TableRow>
                        <TableCell colSpan={5} className="bg-muted/20">
                          {hasBreakdown ? (
                            <div className="space-y-2 py-1">
                              <p className="text-xs text-muted-foreground">
                                Price breakdown by booked hours
                              </p>
                              <div className="grid grid-cols-3 gap-2 text-xs font-medium text-muted-foreground">
                                <span>Hourly rate</span>
                                <span className="text-right">Hours booked</span>
                                <span className="text-right">Subtotal</span>
                              </div>
                              {row.rate_breakdown!.map((rateRow) => (
                                <div
                                  key={`${row.court_id}-${rateRow.hourly_rate}`}
                                  className="grid grid-cols-3 gap-2 text-sm"
                                >
                                  <span>{formatPhp(rateRow.hourly_rate)}/hr</span>
                                  <span className="text-right tabular-nums">
                                    {rateRow.hours_booked}
                                  </span>
                                  <span className="text-right tabular-nums">
                                    {formatPhp(rateRow.court_subtotal)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="py-1 text-sm text-muted-foreground">
                              No booked hours for the selected range.
                            </p>
                          )}
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })}
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

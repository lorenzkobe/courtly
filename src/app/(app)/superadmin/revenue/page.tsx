"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, Suspense, useCallback, useMemo, useState } from "react";
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

function venueHref(venueId: string, from: string, to: string) {
  const seg = venueId === "" ? "unassigned" : venueId;
  const q = new URLSearchParams();
  if (from) q.set("from", from);
  if (to) q.set("to", to);
  const qs = q.toString();
  return `/superadmin/revenue/venues/${seg}${qs ? `?${qs}` : ""}`;
}

function PlatformRevenueInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const [draftFrom, setDraftFrom] = useState(() => from);
  const [draftTo, setDraftTo] = useState(() => to);

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
      const { data: revenueSummary } =
        await courtlyApi.revenue.summary(queryParams);
      return revenueSummary;
    },
  });
  const [expandedVenueIds, setExpandedVenueIds] = useState<Record<string, boolean>>({});
  const toggleVenueExpanded = useCallback((venueId: string) => {
    setExpandedVenueIds((current) => ({ ...current, [venueId]: !current[venueId] }));
  }, []);
  const byCourtByVenue = useMemo(() => {
    const groups = new Map<string, NonNullable<typeof data>["by_court"]>();
    for (const row of data?.by_court ?? []) {
      const key = row.venue_id ?? "";
      const existing = groups.get(key) ?? [];
      existing.push(row);
      groups.set(key, existing);
    }
    for (const rows of groups.values()) {
      rows.sort((a, b) => b.customer_total - a.customer_total);
    }
    return groups;
  }, [data?.by_court]);

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

  const { totals, by_account } = data;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 md:px-10">
      <PageHeader
        title="Platform revenue"
        subtitle="Totals by venue for the selected reservation dates. Open a venue to see courts and per-court income. Confirmed and completed bookings only."
      />

      <div className="mb-6">
        <RevenueDateFilter
          from={draftFrom}
          to={draftTo}
          onFromChange={setDraftFrom}
          onToChange={setDraftTo}
          onApply={() => setRange(draftFrom, draftTo)}
          onClear={() => setRange("", "")}
          applyDisabled={draftFrom === from && draftTo === to}
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
        reservation subtotal for venues (before booking fees).{" "}
        <strong className="font-medium text-foreground">Courtly booking fees</strong> are
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
              {formatPhp(totals.booking_fees)}
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
          <CardTitle className="font-heading text-lg">Venues</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          {by_account && by_account.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Venue</TableHead>
                  <TableHead className="text-right">Bookings</TableHead>
                  <TableHead className="text-right">Court net</TableHead>
                  <TableHead className="text-right">Courtly booking fee</TableHead>
                  <TableHead className="text-right">Customer total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {by_account.map((row) => {
                  const venueKey = row.venue_id || "unassigned";
                  const isExpanded = Boolean(expandedVenueIds[venueKey]);
                  const courtRows = byCourtByVenue.get(row.venue_id ?? "") ?? [];
                  return (
                    <Fragment key={venueKey}>
                      <TableRow className="transition-colors hover:bg-muted/40">
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleVenueExpanded(venueKey)}
                              className="inline-flex items-center text-muted-foreground hover:text-foreground"
                              aria-label={isExpanded ? "Collapse venue details" : "Expand venue details"}
                              aria-expanded={isExpanded}
                            >
                              {isExpanded ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                            <Link
                              href={venueHref(row.venue_id, from, to)}
                              className="text-primary underline-offset-4 hover:underline"
                            >
                              {row.venue_name}
                            </Link>
                          </div>
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
                            {courtRows.length > 0 ? (
                              <div className="space-y-3 py-1">
                                <p className="text-xs text-muted-foreground">
                                  Per-court price breakdown by booked hours
                                </p>
                                {courtRows.map((courtRow) => (
                                  <div
                                    key={courtRow.court_id}
                                    className="rounded-md border border-border/60 bg-background px-3 py-2"
                                  >
                                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                      <p className="text-sm font-medium">{courtRow.court_name}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {courtRow.booking_count} booking
                                        {courtRow.booking_count === 1 ? "" : "s"} ·{" "}
                                        {formatPhp(courtRow.court_net)} net
                                      </p>
                                    </div>
                                    {courtRow.rate_breakdown && courtRow.rate_breakdown.length > 0 ? (
                                      <div className="space-y-1">
                                        {courtRow.rate_breakdown.map((rateRow) => (
                                          <div
                                            key={`${courtRow.court_id}-${rateRow.hourly_rate}`}
                                            className="grid grid-cols-3 gap-2 text-sm"
                                          >
                                            <span>{formatPhp(rateRow.hourly_rate)}/hr</span>
                                            <span className="text-right tabular-nums">
                                              {rateRow.hours_booked} hr
                                            </span>
                                            <span className="text-right tabular-nums">
                                              {formatPhp(rateRow.court_subtotal)}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <p className="text-sm text-muted-foreground">
                                        No booked hours for the selected range.
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="py-1 text-sm text-muted-foreground">
                                No court data for this venue in the selected range.
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
          ) : (
            <p className="text-sm text-muted-foreground">No venue data.</p>
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

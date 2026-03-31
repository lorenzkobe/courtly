"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Calendar, Clock, ListFilter, Search, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import PageHeader from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { apiErrorMessage } from "@/lib/api/api-error-message";
import { courtlyApi } from "@/lib/api/courtly-client";
import { timeRangesOverlap } from "@/lib/booking-overlap";
import { formatPhp } from "@/lib/format-currency";
import { formatTimeShort } from "@/lib/booking-range";
import { useAuth } from "@/lib/auth/auth-context";
import { isSuperadmin } from "@/lib/auth/management";
import { useBookingsRealtime } from "@/lib/bookings/use-bookings-realtime";
import type { Booking } from "@/lib/types/courtly";
import { cn, formatStatusLabel } from "@/lib/utils";

const statusStyles: Record<string, string> = {
  pending_payment: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  confirmed: "bg-primary/10 text-primary border-primary/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
  completed: "bg-muted text-muted-foreground border-border",
};

type AdminBookingFilters = {
  status: "all" | Booking["status"];
  paymentReview: "all" | "refund_required" | "failed" | "pending" | "paid";
  venueId: string;
  dateFrom: string;
  dateTo: string;
  timeFrom: string;
  timeTo: string;
};

function defaultAdminBookingFilters(): AdminBookingFilters {
  return {
    status: "confirmed",
    paymentReview: "all",
    venueId: "",
    dateFrom: "",
    dateTo: "",
    timeFrom: "",
    timeTo: "",
  };
}

function cloneAdminBookingFilters(s: AdminBookingFilters): AdminBookingFilters {
  return { ...s };
}

function bookingPaymentTraceStatus(
  booking: Pick<Booking, "status" | "refund_required" | "payment_failed_at" | "paid_at">,
): "refund_required" | "failed" | "pending" | "paid" | "none" {
  if (booking.refund_required) return "refund_required";
  if (booking.status === "pending_payment" && booking.payment_failed_at) return "failed";
  if (booking.status === "pending_payment") return "pending";
  if (booking.paid_at || booking.status === "confirmed" || booking.status === "completed") return "paid";
  return "none";
}

type AppliedFilterChip = {
  id: string;
  label: string;
  onRemove: () => void;
};

function AdminBookingNoteFields({
  booking,
  onSave,
  onRequestClear,
  savePending,
  clearPending,
}: {
  booking: Booking;
  onSave: (note: string) => void;
  onRequestClear: () => void;
  savePending: boolean;
  clearPending: boolean;
}) {
  const [draft, setDraft] = useState(booking.admin_note ?? "");

  return (
    <section className="border-t border-border/60 pt-4">
      <Label htmlFor="admin-booking-note">Admin note</Label>
      <Textarea
        id="admin-booking-note"
        className="mt-1.5"
        rows={3}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Add internal note/comment for this booking"
      />
      {booking.admin_note_updated_at ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Last updated by{" "}
          {booking.admin_note_updated_by_name ?? "Admin"} on{" "}
          {format(new Date(booking.admin_note_updated_at), "PPpp")}
        </p>
      ) : null}
      <div className="mt-2 flex gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => onSave(draft)}
          disabled={savePending}
        >
          Save note
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={onRequestClear}
          disabled={clearPending}
        >
          Delete note
        </Button>
      </div>
    </section>
  );
}

export default function AdminBookingsPage() {
  const PAGE_LIMIT = 25;
  const { user } = useAuth();
  const globalAdmin = isSuperadmin(user);
  const queryClient = useQueryClient();
  const [appliedFilters, setAppliedFilters] = useState<AdminBookingFilters>(() =>
    defaultAdminBookingFilters(),
  );
  const [draftFilters, setDraftFilters] = useState<AdminBookingFilters>(() =>
    defaultAdminBookingFilters(),
  );
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [sortBy, setSortBy] = useState<
    "latest_date" | "oldest_date" | "amount_high" | "amount_low"
  >("latest_date");
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [confirmCancelBookingId, setConfirmCancelBookingId] = useState<string | null>(null);
  const [confirmDeleteNoteOpen, setConfirmDeleteNoteOpen] = useState(false);
  const adminRealtimeKeys = useMemo(
    () => [["admin-bookings"], ["admin-booking-detail"], ["admin-booking-group"]],
    [],
  );
  useBookingsRealtime({
    enabled: !!user && (user.role === "admin" || user.role === "superadmin"),
    queryKeysToInvalidate: adminRealtimeKeys,
  });

  const {
    data: bookingsPages,
    isLoading,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: ["admin-bookings", globalAdmin ? "all" : "managed", PAGE_LIMIT],
    queryFn: async ({ pageParam }) => {
      const { data } = await courtlyApi.bookings.listPaged({
        manageable: true,
        limit: PAGE_LIMIT,
        cursor: pageParam,
      });
      return data;
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor,
    staleTime: 20_000,
  });
  const bookings = useMemo(
    () => (bookingsPages?.pages ?? []).flatMap((page) => page.items),
    [bookingsPages?.pages],
  );
  const hasMoreBookings =
    bookingsPages?.pages?.[bookingsPages.pages.length - 1]?.has_more ?? false;

  const openFilterDialog = useCallback(() => {
    if (!filterDialogOpen) {
      setDraftFilters(cloneAdminBookingFilters(appliedFilters));
    }
    setFilterDialogOpen(true);
  }, [appliedFilters, filterDialogOpen]);

  const applyFilterDraft = useCallback(() => {
    setAppliedFilters(cloneAdminBookingFilters(draftFilters));
    setFilterDialogOpen(false);
  }, [draftFilters]);

  const resetFilterDraft = useCallback(() => {
    setDraftFilters(defaultAdminBookingFilters());
  }, []);

  const clearAllBookingFilters = useCallback(() => {
    const empty = defaultAdminBookingFilters();
    setAppliedFilters(empty);
    if (filterDialogOpen) {
      setDraftFilters(cloneAdminBookingFilters(empty));
    }
  }, [filterDialogOpen]);

  const venueFilterOptions = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of bookings) {
      const id = b.venue_id;
      const name = (b.establishment_name ?? "").trim();
      if (id && name) m.set(id, name);
    }
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [bookings]);

  const { data: detailPayload } = useQuery({
    queryKey: ["admin-booking-detail", detailId, "with-group"],
    queryFn: async () => {
      const { data } = await courtlyApi.bookings.getWithGroup(detailId!);
      return data;
    },
    enabled: !!detailId,
    staleTime: 15_000,
  });
  const detailBooking = detailPayload?.booking;
  const detailGroup = detailPayload?.group_segments;
  const paymentTransactions = detailPayload?.payment_transactions ?? [];

  const detailSegments = useMemo(() => {
    if (!detailBooking) return [];
    if (detailBooking.booking_group_id && (detailGroup?.length ?? 0) > 0) {
      return detailGroup ?? [];
    }
    return [detailBooking];
  }, [detailBooking, detailGroup]);

  const adminBookingNotes = useMemo(() => {
    const texts = new Set<string>();
    for (const s of detailSegments) {
      const t = s.notes?.trim();
      if (t) texts.add(t);
    }
    return [...texts].join("\n\n");
  }, [detailSegments]);

  const adminSessionTotal = useMemo(
    () => detailSegments.reduce((sum, s) => sum + (s.total_cost ?? 0), 0),
    [detailSegments],
  );

  const updateStatus = useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: string;
    }) => {
      await courtlyApi.bookings.update(id, {
        status: status as Booking["status"],
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-bookings"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-booking-detail"] });
      void queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
      toast.success("Booking updated");
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, "Could not update booking"));
    },
  });

  const saveAdminNote = useMutation({
    mutationFn: async (note: string) => {
      if (!detailBooking) throw new Error("No booking selected");
      await courtlyApi.bookings.setAdminNote(detailBooking.id, {
        admin_note: note,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["admin-booking-detail", detailId, "with-group"],
      });
      void queryClient.invalidateQueries({ queryKey: ["admin-bookings"] });
      toast.success("Note saved");
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, "Could not save note"));
    },
  });

  const clearAdminNote = useMutation({
    mutationFn: async () => {
      if (!detailBooking) throw new Error("No booking selected");
      await courtlyApi.bookings.setAdminNote(detailBooking.id, {
        clear_admin_note: true,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["admin-booking-detail", detailId, "with-group"],
      });
      void queryClient.invalidateQueries({ queryKey: ["admin-bookings"] });
      toast.success("Note deleted");
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, "Could not delete note"));
    },
  });

  const filtered = useMemo(() => {
    const searchTerm = search.trim();
    const searchLower = searchTerm.toLowerCase();
    const searchUpper = searchTerm.toUpperCase();
    const {
      status: statusFilter,
      paymentReview,
      venueId,
      dateFrom,
      dateTo,
      timeFrom,
      timeTo,
    } = appliedFilters;

    const list = bookings.filter((booking) => {
      const statusMatch =
        statusFilter === "all" || booking.status === statusFilter;
      const paymentReviewMatch =
        paymentReview === "all" ||
        bookingPaymentTraceStatus(booking) === paymentReview;
      const venueMatch = !venueId || booking.venue_id === venueId;
      const fromOk = !dateFrom || booking.date >= dateFrom;
      const toOk = !dateTo || booking.date <= dateTo;

      let timeOk = true;
      if (timeFrom && timeTo) {
        timeOk = timeRangesOverlap(
          booking.start_time,
          booking.end_time,
          timeFrom,
          timeTo,
        );
      } else if (timeFrom) {
        timeOk = booking.end_time > timeFrom;
      } else if (timeTo) {
        timeOk = booking.start_time < timeTo;
      }

      const searchMatch =
        !searchTerm ||
        booking.player_name?.toLowerCase().includes(searchLower) ||
        booking.player_email?.toLowerCase().includes(searchLower) ||
        booking.court_name?.toLowerCase().includes(searchLower) ||
        booking.establishment_name?.toLowerCase().includes(searchLower) ||
        booking.booking_number?.toUpperCase().includes(searchUpper) ||
        booking.booking_number?.split("-").at(-1)?.toUpperCase().includes(searchUpper);
      return (
        statusMatch &&
        paymentReviewMatch &&
        venueMatch &&
        fromOk &&
        toOk &&
        timeOk &&
        searchMatch
      );
    });
    list.sort((a, b) => {
      if (sortBy === "oldest_date") {
        const byDate = a.date.localeCompare(b.date);
        if (byDate !== 0) return byDate;
        return a.start_time.localeCompare(b.start_time);
      }
      if (sortBy === "amount_high") {
        return (b.total_cost ?? 0) - (a.total_cost ?? 0);
      }
      if (sortBy === "amount_low") {
        return (a.total_cost ?? 0) - (b.total_cost ?? 0);
      }
      const byDate = b.date.localeCompare(a.date);
      if (byDate !== 0) return byDate;
      return b.start_time.localeCompare(a.start_time);
    });
    return list;
  }, [appliedFilters, bookings, search, sortBy]);

  const appliedBookingFilterChips = useMemo((): AppliedFilterChip[] => {
    const chips: AppliedFilterChip[] = [];
    const f = appliedFilters;

    if (f.status !== "all") {
      chips.push({
        id: "status",
        label: `Status: ${formatStatusLabel(f.status)}`,
        onRemove: () =>
          setAppliedFilters((p) => ({ ...p, status: "all" })),
      });
    }
    if (f.paymentReview === "refund_required") {
      chips.push({
        id: "payment-review",
        label: "Payment: Refund required",
        onRemove: () =>
          setAppliedFilters((p) => ({ ...p, paymentReview: "all" })),
      });
    } else if (f.paymentReview === "failed") {
      chips.push({
        id: "payment-review",
        label: "Payment: Failed",
        onRemove: () =>
          setAppliedFilters((p) => ({ ...p, paymentReview: "all" })),
      });
    } else if (f.paymentReview === "pending") {
      chips.push({
        id: "payment-review",
        label: "Payment: Pending",
        onRemove: () =>
          setAppliedFilters((p) => ({ ...p, paymentReview: "all" })),
      });
    } else if (f.paymentReview === "paid") {
      chips.push({
        id: "payment-review",
        label: "Payment: Paid",
        onRemove: () =>
          setAppliedFilters((p) => ({ ...p, paymentReview: "all" })),
      });
    }
    if (f.venueId) {
      const name =
        venueFilterOptions.find(([id]) => id === f.venueId)?.[1] ?? "Venue";
      chips.push({
        id: "venue",
        label: `Venue: ${name}`,
        onRemove: () => setAppliedFilters((p) => ({ ...p, venueId: "" })),
      });
    }
    if (f.dateFrom) {
      chips.push({
        id: "date-from",
        label: `From ${f.dateFrom}`,
        onRemove: () => setAppliedFilters((p) => ({ ...p, dateFrom: "" })),
      });
    }
    if (f.dateTo) {
      chips.push({
        id: "date-to",
        label: `Through ${f.dateTo}`,
        onRemove: () => setAppliedFilters((p) => ({ ...p, dateTo: "" })),
      });
    }
    if (f.timeFrom || f.timeTo) {
      const label =
        f.timeFrom && f.timeTo
          ? `Time: ${formatTimeShort(f.timeFrom)} – ${formatTimeShort(f.timeTo)}`
          : f.timeFrom
            ? `From ${formatTimeShort(f.timeFrom)}`
            : `Before ${formatTimeShort(f.timeTo!)}`;
      chips.push({
        id: "time",
        label,
        onRemove: () =>
          setAppliedFilters((p) => ({ ...p, timeFrom: "", timeTo: "" })),
      });
    }
    return chips;
  }, [appliedFilters, venueFilterOptions]);

  const activeBookingFilterCount = appliedBookingFilterChips.length;

  const stats = {
    total: bookings.length,
    confirmed: bookings.filter((booking) => booking.status === "confirmed")
      .length,
    cancelled: bookings.filter((booking) => booking.status === "cancelled")
      .length,
    refundRequired: bookings.filter((booking) => booking.refund_required === true)
      .length,
    revenue: bookings
      .filter((booking) => booking.status !== "cancelled")
      .reduce((sum, booking) => sum + (booking.total_cost || 0), 0),
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 md:px-10">
      <ConfirmDialog
        open={!!confirmCancelBookingId}
        onOpenChange={(open) => {
          if (!open) setConfirmCancelBookingId(null);
        }}
        title="Cancel booking?"
        description="This will mark the booking as cancelled."
        confirmLabel="Yes, cancel booking"
        isPending={updateStatus.isPending}
        onConfirm={() => {
          if (!confirmCancelBookingId) return;
          updateStatus.mutate({ id: confirmCancelBookingId, status: "cancelled" });
          setConfirmCancelBookingId(null);
        }}
      />
      <ConfirmDialog
        open={confirmDeleteNoteOpen}
        onOpenChange={setConfirmDeleteNoteOpen}
        title="Delete admin note?"
        description="This will remove the internal note for this booking."
        confirmLabel="Delete note"
        isPending={clearAdminNote.isPending}
        onConfirm={() => {
          clearAdminNote.mutate();
          setConfirmDeleteNoteOpen(false);
        }}
      />
      <Dialog open={!!detailId} onOpenChange={(o) => !o && setDetailId(null)}>
        <DialogContent className="max-h-[min(90dvh,40rem)] sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">Booking details</DialogTitle>
          </DialogHeader>
          {detailBooking ? (
            <div className="space-y-6 text-sm">
              <section>
                <h3 className="mb-2 font-heading font-semibold text-foreground">
                  Reservation
                </h3>
                <dl className="grid gap-2 sm:grid-cols-[7rem_1fr]">
                  <dt className="text-muted-foreground">Venue</dt>
                  <dd className="font-medium">
                    {detailBooking.establishment_name ?? "—"}
                  </dd>
                  <dt className="text-muted-foreground">Booking #</dt>
                  <dd className="font-mono text-xs">
                    {detailBooking.booking_number ?? "—"}
                  </dd>
                  <dt className="text-muted-foreground">Court</dt>
                  <dd className="font-medium">{detailBooking.court_name ?? "—"}</dd>
                  <dt className="text-muted-foreground">Player</dt>
                  <dd>{detailBooking.player_name ?? "—"}</dd>
                  <dt className="text-muted-foreground">Email</dt>
                  <dd className="break-all">{detailBooking.player_email ?? "—"}</dd>
                  <dt className="text-muted-foreground">Contact number</dt>
                  <dd className="tabular-nums">
                    {detailBooking.player_mobile_number?.trim() || "—"}
                  </dd>
                  <dt className="text-muted-foreground">Date</dt>
                  <dd>
                    {detailBooking.date
                      ? format(new Date(detailBooking.date), "MMM d, yyyy")
                      : "—"}
                  </dd>
                  <dt className="text-muted-foreground">Reserved times</dt>
                  <dd>
                    <ul className="space-y-2">
                      {detailSegments.map((segment) => (
                        <li
                          key={segment.id}
                          className="flex flex-wrap items-center gap-2 text-foreground"
                        >
                          <span>
                            {formatTimeShort(segment.start_time)} –{" "}
                            {formatTimeShort(segment.end_time)}
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-xs ${statusStyles[segment.status] ?? ""}`}
                          >
                            {formatStatusLabel(segment.status)}
                          </Badge>
                          <span className="text-muted-foreground">
                            {formatPhp(segment.total_cost ?? 0)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </dd>
                  <dt className="text-muted-foreground">Total</dt>
                  <dd className="font-heading font-bold text-primary">
                    {formatPhp(adminSessionTotal)}
                  </dd>
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className={statusStyles[detailBooking.status] ?? ""}>
                        {formatStatusLabel(detailBooking.status)}
                      </Badge>
                      {detailBooking.refund_required ? (
                        <Badge
                          variant="outline"
                          className="border-amber-500/30 bg-amber-500/10 text-amber-700"
                        >
                          Refund required
                        </Badge>
                      ) : null}
                    </div>
                  </dd>
                  {detailBooking.payment_reference_id ? (
                    <>
                      <dt className="text-muted-foreground">Payment reference</dt>
                      <dd className="break-all text-xs">{detailBooking.payment_reference_id}</dd>
                    </>
                  ) : null}
                  {adminBookingNotes ? (
                    <>
                      <dt className="text-muted-foreground">Booking notes</dt>
                      <dd className="whitespace-pre-wrap text-foreground">
                        {adminBookingNotes}
                      </dd>
                    </>
                  ) : (
                    <>
                      <dt className="text-muted-foreground">Booking notes</dt>
                      <dd className="text-muted-foreground">—</dd>
                    </>
                  )}
                  {detailBooking.created_date ? (
                    <>
                      <dt className="text-muted-foreground">Booked at</dt>
                      <dd className="text-xs text-muted-foreground">
                        {format(new Date(detailBooking.created_date), "PPpp")}
                      </dd>
                    </>
                  ) : null}
                </dl>
                {detailBooking.status === "confirmed" ? (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs"
                      onClick={() =>
                        updateStatus.mutate({
                          id: detailBooking.id,
                          status: "completed",
                        })
                      }
                    >
                      Complete
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-destructive/20 text-xs text-destructive hover:bg-destructive/5 hover:text-destructive"
                      onClick={() => setConfirmCancelBookingId(detailBooking.id)}
                    >
                      <X className="mr-1 h-3.5 w-3.5" /> Cancel
                    </Button>
                  </div>
                ) : null}
              </section>
              <AdminBookingNoteFields
                key={`${detailBooking.id}-${detailBooking.admin_note_updated_at ?? ""}`}
                booking={detailBooking}
                onSave={(note) => saveAdminNote.mutate(note)}
                onRequestClear={() => setConfirmDeleteNoteOpen(true)}
                savePending={saveAdminNote.isPending}
                clearPending={clearAdminNote.isPending}
              />
              <section className="border-t border-border/60 pt-4">
                <h3 className="mb-2 font-heading font-semibold text-foreground">
                  Payment audit
                </h3>
                {paymentTransactions.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No payment audit events yet.</p>
                ) : (
                  <ul className="space-y-2">
                    {paymentTransactions.map((tx) => (
                      <li
                        key={tx.id}
                        className="rounded-md border border-border/50 bg-muted/20 p-2 text-xs"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="text-[10px] uppercase">
                            {tx.trace_status}
                          </Badge>
                          <span className="text-muted-foreground">
                            {tx.created_at ? format(new Date(tx.created_at), "PPpp") : "—"}
                          </span>
                          {tx.provider_payment_id ? (
                            <span className="font-mono text-[10px]">{tx.provider_payment_id}</span>
                          ) : null}
                        </div>
                        {tx.trace_note ? (
                          <p className="mt-1 text-muted-foreground">{tx.trace_note}</p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Loading…</p>
          )}
        </DialogContent>
      </Dialog>

      <PageHeader
        title={globalAdmin ? "Court bookings" : "My court bookings"}
        subtitle={
          globalAdmin
            ? "Reservations on any court in the directory"
            : "Reservations on courts you manage"
        }
      />

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-5">
        {[
          { label: "Total Bookings", value: stats.total, color: "text-foreground" },
          { label: "Confirmed", value: stats.confirmed, color: "text-primary" },
          {
            label: "Cancelled",
            value: stats.cancelled,
            color: "text-destructive",
          },
          {
            label: "Refund Required",
            value: stats.refundRequired,
            color: "text-amber-700",
          },
          {
            label: "Revenue",
            value: formatPhp(stats.revenue),
            color: "text-chart-3",
          },
        ].map((stat) => (
          <Card key={stat.label} className="border-border/50">
            <CardContent className="p-5">
              <p className="mb-1 text-sm text-muted-foreground">{stat.label}</p>
              <p className={`font-heading text-2xl font-bold ${stat.color}`}>
                {stat.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mb-6 flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, email, court, venue, booking # or suffix..."
              className="pl-9"
            />
          </div>
          <div className="flex shrink-0 items-center justify-end gap-2">
            <Select
              value={sortBy}
              onValueChange={(v) =>
                setSortBy(v as "latest_date" | "oldest_date" | "amount_high" | "amount_low")
              }
            >
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="latest_date">Latest date (default)</SelectItem>
                <SelectItem value="oldest_date">Oldest date</SelectItem>
                <SelectItem value="amount_high">Amount: high to low</SelectItem>
                <SelectItem value="amount_low">Amount: low to high</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="relative shrink-0"
              aria-label="Open booking filters"
              onClick={openFilterDialog}
            >
              <ListFilter className="h-4 w-4" />
              {activeBookingFilterCount > 0 ? (
                <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">
                  {activeBookingFilterCount}
                </span>
              ) : null}
            </Button>
          </div>
        </div>

        <div
          className={cn(
            "flex min-w-0 flex-wrap items-center gap-2",
            appliedBookingFilterChips.length > 0 && "rounded-lg border border-border/60 bg-muted/20 p-2",
          )}
        >
          {appliedBookingFilterChips.map((chip) => (
            <Badge
              key={chip.id}
              variant="secondary"
              className="h-7 shrink-0 gap-0.5 rounded-full pr-0.5 pl-2.5 font-normal"
            >
              <span className="max-w-[220px] truncate sm:max-w-[320px]">
                {chip.label}
              </span>
              <button
                type="button"
                onClick={chip.onRemove}
                className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={`Remove filter ${chip.label}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {activeBookingFilterCount > 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 px-2 text-xs text-muted-foreground hover:text-foreground"
              onClick={clearAllBookingFilters}
            >
              Clear filters
            </Button>
          ) : null}
        </div>
      </div>

      <Dialog open={filterDialogOpen} onOpenChange={setFilterDialogOpen}>
        <DialogContent
          className="max-h-[min(92dvh,36rem)] max-w-lg overflow-y-auto"
          linkDescription
        >
          <DialogHeader>
            <DialogTitle className="font-heading">Filters</DialogTitle>
            <DialogDescription>
              Narrow bookings by status, venue, reservation date, or time window. Apply to update the
              list; filter chips above can be removed individually.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="admin-booking-filter-status">Status</Label>
              <Select
                value={draftFilters.status}
                onValueChange={(v) =>
                  setDraftFilters((d) => ({
                    ...d,
                    status: v as AdminBookingFilters["status"],
                  }))
                }
              >
                <SelectTrigger id="admin-booking-filter-status" className="mt-1.5">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="pending_payment">Pending payment</SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="admin-booking-filter-payment-review">Payment review</Label>
              <Select
                value={draftFilters.paymentReview}
                onValueChange={(v) =>
                  setDraftFilters((d) => ({
                    ...d,
                    paymentReview: v as AdminBookingFilters["paymentReview"],
                  }))
                }
              >
                <SelectTrigger id="admin-booking-filter-payment-review" className="mt-1.5">
                  <SelectValue placeholder="All payment states" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All payment states</SelectItem>
                  <SelectItem value="refund_required">Refund required only</SelectItem>
                  <SelectItem value="failed">Failed (pending_payment with failed callback)</SelectItem>
                  <SelectItem value="pending">Pending payment</SelectItem>
                  <SelectItem value="paid">Paid / confirmed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="admin-booking-filter-venue">Venue</Label>
              <Select
                value={draftFilters.venueId || "__all_venues__"}
                onValueChange={(v) =>
                  setDraftFilters((d) => ({
                    ...d,
                    venueId: v === "__all_venues__" ? "" : v,
                  }))
                }
              >
                <SelectTrigger id="admin-booking-filter-venue" className="mt-1.5">
                  <SelectValue placeholder="All venues" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all_venues__">All venues</SelectItem>
                  {venueFilterOptions.map(([id, name]) => (
                    <SelectItem key={id} value={id}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="admin-booking-filter-date-from">Reservation from</Label>
                <Input
                  id="admin-booking-filter-date-from"
                  type="date"
                  className="mt-1.5"
                  value={draftFilters.dateFrom}
                  onChange={(e) =>
                    setDraftFilters((d) => ({ ...d, dateFrom: e.target.value }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="admin-booking-filter-date-to">Reservation through</Label>
                <Input
                  id="admin-booking-filter-date-to"
                  type="date"
                  className="mt-1.5"
                  value={draftFilters.dateTo}
                  onChange={(e) =>
                    setDraftFilters((d) => ({ ...d, dateTo: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="admin-booking-filter-time-from">Time from</Label>
                <Input
                  id="admin-booking-filter-time-from"
                  className="mt-1.5"
                  placeholder="09:00"
                  value={draftFilters.timeFrom}
                  onChange={(e) =>
                    setDraftFilters((d) => ({ ...d, timeFrom: e.target.value.trim() }))
                  }
                />
              </div>
              <div>
                <Label htmlFor="admin-booking-filter-time-to">Time through</Label>
                <Input
                  id="admin-booking-filter-time-to"
                  className="mt-1.5"
                  placeholder="18:00"
                  value={draftFilters.timeTo}
                  onChange={(e) =>
                    setDraftFilters((d) => ({ ...d, timeTo: e.target.value.trim() }))
                  }
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Time filters match any booking segment that overlaps the window (24-hour clock, same as
              listings).
            </p>
          </div>
          <DialogFooter className="flex-row flex-wrap gap-2 sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              className="text-muted-foreground"
              onClick={resetFilterDraft}
            >
              Reset
            </Button>
            <Button type="button" className="font-heading" onClick={applyFilterDraft}>
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          No bookings found.
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((booking) => (
            <Card
              key={booking.id}
              className="cursor-pointer border-border/50 transition-shadow hover:shadow-sm"
              onClick={() => setDetailId(booking.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setDetailId(booking.id);
                }
              }}
            >
              <CardContent className="min-h-30 p-5">
                <div className="flex min-h-20 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-1 flex-col justify-between">
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="font-heading font-bold text-foreground">
                        {booking.court_name || "Court"}
                      </span>
                      {booking.booking_number ? (
                        <Badge variant="outline" className="font-mono text-[11px]">
                          {booking.booking_number}
                        </Badge>
                      ) : null}
                      <Badge
                        variant="outline"
                        className={statusStyles[booking.status] ?? ""}
                      >
                        {formatStatusLabel(booking.status)}
                      </Badge>
                      {booking.refund_required ? (
                        <Badge
                          variant="outline"
                          className="border-amber-500/30 bg-amber-500/10 text-amber-700"
                        >
                          Refund required
                        </Badge>
                      ) : null}
                    </div>
                    {booking.establishment_name?.trim() ? (
                      <p className="mb-1 text-xs text-muted-foreground">
                        {booking.establishment_name.trim()}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {booking.player_name}
                      </span>
                      <span>{booking.player_email}</span>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />{" "}
                        {booking.date &&
                          format(new Date(booking.date), "MMM d, yyyy")}
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />{" "}
                        {formatTimeShort(booking.start_time)} –{" "}
                        {formatTimeShort(booking.end_time)}
                      </div>
                      {booking.notes?.trim() ? (
                        <span
                          className="max-w-full truncate text-xs text-muted-foreground"
                          title={booking.notes.trim()}
                        >
                          {booking.notes.trim()}
                        </span>
                      ) : (
                        <span className="invisible max-w-full truncate text-xs">No note</span>
                      )}
                      <div className="font-semibold text-foreground tabular-nums">
                        {booking.total_cost != null
                          ? formatPhp(booking.total_cost)
                          : "—"}
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 text-xs text-muted-foreground">View details</div>
                </div>
              </CardContent>
            </Card>
          ))}
          {hasMoreBookings ? (
            <div className="flex justify-center pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={isFetchingNextPage}
                onClick={() => void fetchNextPage()}
              >
                {isFetchingNextPage ? "Loading..." : "Load more"}
              </Button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}

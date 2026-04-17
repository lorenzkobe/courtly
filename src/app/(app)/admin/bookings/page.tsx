"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { Calendar, ListFilter, Loader2, Search, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { apiErrorMessage } from "@/lib/api/api-error-message";
import { httpStatusOf } from "@/lib/api/http-status";
import { courtlyApi } from "@/lib/api/courtly-client";
import { timeRangesOverlap } from "@/lib/booking-overlap";
import { formatPhp } from "@/lib/format-currency";
import { formatTimeShort } from "@/lib/booking-range";
import { useAuth } from "@/lib/auth/auth-context";
import { isSuperadmin } from "@/lib/auth/management";
import type { Booking, BookingAdminNote } from "@/lib/types/courtly";
import { cn, formatBookingStatusLabel, formatStatusLabel } from "@/lib/utils";

function isEmbedSafePaymentProofUrl(url: string): boolean {
  const u = url.trim();
  if (u.startsWith("data:image/jpeg;base64,")) return true;
  if (u.startsWith("data:image/png;base64,")) return true;
  if (u.startsWith("data:image/webp;base64,")) return true;
  return /^https:\/\//i.test(u);
}

const statusStyles: Record<string, string> = {
  pending_payment: "bg-amber-500/15 text-amber-700 border-amber-500/30",
  pending_confirmation: "bg-blue-500/15 text-blue-700 border-blue-500/30",
  confirmed: "bg-primary/10 text-primary border-primary/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
  completed: "bg-muted text-muted-foreground border-border",
  __mixed_status__: "bg-muted/80 text-foreground border-border/80",
};

type AdminBookingFilters = {
  status: "all" | Booking["status"];
  paymentReview: "all" | "refund_required" | "paid";
  venueId: string;
  dateFrom: string;
  dateTo: string;
  timeFrom: string;
  timeTo: string;
};

function defaultAdminBookingFilters(): AdminBookingFilters {
  return {
    status: "all",
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
  booking: Pick<Booking, "status" | "refund_required" | "paid_at">,
): "refund_required" | "paid" | "none" {
  if (booking.refund_required) return "refund_required";
  if (booking.paid_at || booking.status === "confirmed" || booking.status === "completed")
    return "paid";
  return "none";
}

/** One row per checkout: shared `booking_group_id`, or the row’s own id when standalone. */
function adminBookingGroupKey(
  booking: Pick<Booking, "id" | "booking_group_id">,
): string {
  const g = booking.booking_group_id?.trim();
  if (g) return g;
  return booking.id;
}

type AdminBookingListGroup = {
  key: string;
  leader: Booking;
  members: Booking[];
  segmentCount: number;
  totalCost: number;
  venueLabel: string;
  statusKey: string;
  refundRequired: boolean;
  dateMin: string;
  dateMax: string;
  courtsSummary: string;
};

type AppliedFilterChip = {
  id: string;
  label: string;
  onRemove: () => void;
};

type BookingAuditEvent = {
  id: string;
  at: string | null;
  title: string;
  detail: string;
  actor?: string | null;
};

function normalizeAuditActor(actor: string | null | undefined): string | null {
  const trimmedActor = actor?.trim();
  return trimmedActor || null;
}

function bookingAuditBadgeClass(title: string): string {
  switch (title) {
    case "Booking created":
      return "border-slate-500/30 bg-slate-500/10 text-slate-700";
    case "Payment proof submitted":
      return "border-blue-500/30 bg-blue-500/10 text-blue-700";
    case "Booking confirmed":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700";
    case "Booking completed":
      return "border-violet-500/30 bg-violet-500/10 text-violet-700";
    case "Booking cancelled":
      return "border-orange-500/30 bg-orange-500/10 text-orange-700";
    case "Booking rejected":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    case "Admin note added/updated":
      return "border-amber-500/30 bg-amber-500/10 text-amber-700";
    default:
      return "border-border bg-muted text-muted-foreground";
  }
}

function bookingAuditAccentClass(title: string): string {
  switch (title) {
    case "Booking created":
      return "bg-slate-500/70";
    case "Payment proof submitted":
      return "bg-blue-500/70";
    case "Booking confirmed":
      return "bg-emerald-500/70";
    case "Booking completed":
      return "bg-violet-500/70";
    case "Booking cancelled":
      return "bg-orange-500/70";
    case "Booking rejected":
      return "bg-destructive/80";
    case "Admin note added/updated":
      return "bg-amber-500/70";
    default:
      return "bg-border";
  }
}

function bookingAuditEventsForSegment(segment: Booking): BookingAuditEvent[] {
  const segmentLabel =
    segment.court_name?.trim() || segment.establishment_name?.trim() || "Booking";
  const statusActor = normalizeAuditActor(segment.status_updated_by_name);
  const events: BookingAuditEvent[] = [];
  if (segment.created_date) {
    events.push({
      id: `${segment.id}-created`,
      at: segment.created_date,
      title: "Booking created",
      detail: `${segmentLabel} · ${formatTimeShort(segment.start_time)} - ${formatTimeShort(
        segment.end_time,
      )}`,
    });
  }
  if (segment.payment_submitted_at) {
    events.push({
      id: `${segment.id}-payment-submitted`,
      at: segment.payment_submitted_at,
      title: "Payment proof submitted",
      detail: `${segmentLabel}`,
    });
  }
  if (segment.status === "confirmed") {
    events.push({
      id: `${segment.id}-confirmed`,
      at: segment.status_updated_at ?? segment.paid_at ?? null,
      title: "Booking confirmed",
      detail: segmentLabel,
      actor: statusActor,
    });
  }
  if (segment.status === "completed") {
    events.push({
      id: `${segment.id}-completed`,
      at: segment.status_updated_at ?? null,
      title: "Booking completed",
      detail: segmentLabel,
      actor: statusActor,
    });
  }
  if (segment.status === "cancelled") {
    const rejected =
      Boolean(segment.payment_failed_at) ||
      (segment.cancel_reason ?? "").toLowerCase().includes("reject");
    events.push({
      id: `${segment.id}-${rejected ? "rejected" : "cancelled"}`,
      at:
        segment.status_updated_at ??
        segment.payment_failed_at ??
        segment.refunded_at ??
        segment.created_date ??
        null,
      title: rejected ? "Booking rejected" : "Booking cancelled",
      detail: segment.cancel_reason?.trim() || segmentLabel,
      actor: statusActor,
    });
  }
  if (segment.admin_note_updated_at) {
    const noteText = segment.admin_note?.trim() || "Note cleared";
    const noteActor = normalizeAuditActor(segment.admin_note_updated_by_name) || "Admin";
    events.push({
      id: `${segment.id}-note`,
      at: segment.admin_note_updated_at,
      title: "Admin note added/updated",
      detail: noteText,
      actor: noteActor,
    });
  }
  return events;
}

function BookingNotesPanel({
  notes,
  legacyNote,
  onAddNote,
  addPending,
  loading,
}: {
  notes: BookingAdminNote[];
  legacyNote: Pick<Booking, "admin_note" | "admin_note_updated_at" | "admin_note_updated_by_name"> | null;
  onAddNote: (note: string) => void;
  addPending: boolean;
  loading: boolean;
}) {
  const [draft, setDraft] = useState("");
  const canSubmit = draft.trim().length > 0 && !addPending;
  const showLegacyNote =
    !!legacyNote?.admin_note?.trim() &&
    !notes.some((note) => note.body.trim() === legacyNote.admin_note?.trim());

  return (
    <section className="space-y-3">
      <div>
        <Label htmlFor="admin-booking-note-add">Add note</Label>
        <Textarea
          id="admin-booking-note-add"
          className="mt-1.5"
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={addPending}
          placeholder="Write a new internal note"
        />
        <div className="mt-2 flex justify-end">
          <Button
            type="button"
            size="sm"
            disabled={!canSubmit}
            onClick={() => {
              const text = draft.trim();
              if (!text) return;
              onAddNote(text);
              setDraft("");
            }}
          >
            {addPending ? (
              <span className="inline-flex items-center gap-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Adding...
              </span>
            ) : (
              "Add note"
            )}
          </Button>
        </div>
      </div>
      <div className="rounded-lg border border-border/60 bg-muted/10 p-3">
        {loading ? (
          <p className="text-xs text-muted-foreground">Loading notes…</p>
        ) : notes.length === 0 && !showLegacyNote ? (
          <p className="text-xs text-muted-foreground">No notes yet.</p>
        ) : (
          <ul className="space-y-2">
            {notes.map((note) => (
              <li key={note.id} className="rounded-md border border-border/50 bg-background px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>{note.author_name || "Admin"}</span>
                  <span>{format(new Date(note.created_at), "PPpp")}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{note.body}</p>
              </li>
            ))}
            {showLegacyNote ? (
              <li className="rounded-md border border-border/50 bg-background px-3 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>{legacyNote?.admin_note_updated_by_name ?? "Admin"}</span>
                  <span>
                    {legacyNote?.admin_note_updated_at
                      ? format(new Date(legacyNote.admin_note_updated_at), "PPpp")
                      : "Earlier note"}
                  </span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                  {legacyNote?.admin_note?.trim()}
                </p>
              </li>
            ) : null}
          </ul>
        )}
      </div>
    </section>
  );
}

export default function AdminBookingsPage() {
  const PAGE_LIMIT = 25;
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
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
  const detailIdFromQuery = searchParams.get("detail");
  const activeDetailId = detailId ?? detailIdFromQuery;

  const [confirmBulkPendingOpen, setConfirmBulkPendingOpen] = useState(false);
  const [confirmBulkCompleteOpen, setConfirmBulkCompleteOpen] = useState(false);
  const [paymentProofPreviewUrl, setPaymentProofPreviewUrl] = useState<string | null>(
    null,
  );
  const [detailPanelTab, setDetailPanelTab] = useState<"notes" | "history">("notes");
  const [historyTabLoaded, setHistoryTabLoaded] = useState(false);
  const [pendingDecisionById, setPendingDecisionById] = useState<
    Record<string, "confirmed" | "cancelled">
  >({});
  const [completionDecisionById, setCompletionDecisionById] = useState<
    Record<string, "completed">
  >({});
  const [paymentProofZoom, setPaymentProofZoom] = useState(1);
  const dismissPaymentProofPreview = useCallback(() => {
    setPaymentProofPreviewUrl(null);
    setPaymentProofZoom(1);
  }, []);
  const openAdminBookingDetail = useCallback(
    (id: string) => {
      dismissPaymentProofPreview();
      setDetailPanelTab("notes");
      setHistoryTabLoaded(false);
      setDetailId(id);
    },
    [dismissPaymentProofPreview],
  );

  const {
    data: bookingsPages,
    isLoading,
    isRefetching,
    isFetchingNextPage,
    fetchNextPage,
    refetch: refetchBookings,
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

  const {
    data: detailPayload,
    isError: isDetailError,
    error: detailError,
  } = useQuery({
    queryKey: ["admin-booking-detail", activeDetailId, "with-group"],
    queryFn: async () => {
      const { data } = await courtlyApi.bookings.getWithGroup(activeDetailId!);
      return data;
    },
    enabled: !!activeDetailId,
    staleTime: 15_000,
  });
  const {
    data: bookingNotesPayload,
    isLoading: bookingNotesLoading,
  } = useQuery({
    queryKey: ["admin-booking-notes", activeDetailId],
    queryFn: async () => {
      const { data } = await courtlyApi.adminBookings.listNotes(activeDetailId!);
      return data;
    },
    enabled: !!activeDetailId,
    staleTime: 15_000,
  });
  const missingAdminDetail =
    Boolean(activeDetailId) &&
    !detailPayload &&
    isDetailError &&
    httpStatusOf(detailError) === 404;
  useEffect(() => {
    if (!missingAdminDetail) return;
    const timeoutId = window.setTimeout(() => {
      dismissPaymentProofPreview();
      setDetailId(null);
      if (detailIdFromQuery) {
        router.replace(pathname, { scroll: false });
      }
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [
    detailIdFromQuery,
    dismissPaymentProofPreview,
    missingAdminDetail,
    pathname,
    router,
  ]);
  useEffect(() => {
    if (!activeDetailId) return;
    const timeoutId = window.setTimeout(() => {
      setDetailPanelTab("notes");
      setHistoryTabLoaded(false);
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [activeDetailId]);
  const detailBooking = detailPayload?.booking;
  const detailGroup = detailPayload?.group_segments;

  const detailSegments = useMemo(() => {
    if (!detailBooking) return [];
    if (detailBooking.booking_group_id && (detailGroup?.length ?? 0) > 0) {
      return detailGroup ?? [];
    }
    return [detailBooking];
  }, [detailBooking, detailGroup]);
  const pendingConfirmationSegments = useMemo(
    () => detailSegments.filter((segment) => segment.status === "pending_confirmation"),
    [detailSegments],
  );
  const confirmedSegments = useMemo(
    () => detailSegments.filter((segment) => segment.status === "confirmed"),
    [detailSegments],
  );
  const selectedPendingUpdates = useMemo(
    () =>
      pendingConfirmationSegments.flatMap((segment) => {
        const status = pendingDecisionById[segment.id];
        if (!status) return [];
        return [{ id: segment.id, status }];
      }),
    [pendingConfirmationSegments, pendingDecisionById],
  );
  const selectedCompleteUpdates = useMemo(
    () =>
      confirmedSegments.flatMap((segment) =>
        completionDecisionById[segment.id]
          ? [{ id: segment.id, status: "completed" as const }]
          : [],
      ),
    [confirmedSegments, completionDecisionById],
  );

  const adminBookingNotes = useMemo(() => {
    const texts = new Set<string>();
    for (const s of detailSegments) {
      const t = s.notes?.trim();
      if (t) texts.add(t);
    }
    return [...texts].join("\n\n");
  }, [detailSegments]);
  const latestAdminNoteSegment = useMemo(() => {
    const withUpdatedAt = detailSegments.filter((segment) => segment.admin_note_updated_at);
    if (withUpdatedAt.length === 0) return null;
    return [...withUpdatedAt].sort((left, right) => {
      const leftAt = left.admin_note_updated_at
        ? new Date(left.admin_note_updated_at).getTime()
        : 0;
      const rightAt = right.admin_note_updated_at
        ? new Date(right.admin_note_updated_at).getTime()
        : 0;
      return rightAt - leftAt;
    })[0]!;
  }, [detailSegments]);
  const adminNoteBooking = useMemo(() => {
    if (!detailBooking) return null;
    if (!latestAdminNoteSegment) return detailBooking;
    return {
      ...detailBooking,
      admin_note: latestAdminNoteSegment.admin_note ?? "",
      admin_note_updated_at: latestAdminNoteSegment.admin_note_updated_at ?? null,
      admin_note_updated_by_name: latestAdminNoteSegment.admin_note_updated_by_name ?? null,
      admin_note_updated_by_user_id: latestAdminNoteSegment.admin_note_updated_by_user_id ?? null,
    } satisfies Booking;
  }, [detailBooking, latestAdminNoteSegment]);
  const bookingNotes = bookingNotesPayload?.notes ?? [];

  const adminSessionTotal = useMemo(
    () => detailSegments.reduce((sum, s) => sum + (s.total_cost ?? 0), 0),
    [detailSegments],
  );

  const paymentDetailSegment = useMemo(() => {
    return (
      detailSegments.find((s) => s.payment_proof_url?.trim()) ??
      detailSegments.find((s) => s.payment_submitted_at) ??
      detailSegments[0] ??
      null
    );
  }, [detailSegments]);
  const bookingAuditEvents = useMemo(() => {
    if (!historyTabLoaded) return [];
    const segmentEvents = detailSegments
      .flatMap((segment) => bookingAuditEventsForSegment(segment))
      .filter(
        (event) =>
          !(
            detailBooking?.booking_group_id &&
            detailSegments.length > 1 &&
            (event.title === "Booking created" || event.title === "Payment proof submitted")
          ),
      );

    const groupEvents: BookingAuditEvent[] = [];
    if (detailBooking?.booking_group_id && detailSegments.length > 1) {
      const courtNames = [
        ...new Set(
          detailSegments
            .map((segment) => segment.court_name?.trim())
            .filter((name): name is string => Boolean(name)),
        ),
      ];
      const groupLabel =
        courtNames.length > 0
          ? `${detailSegments.length} slots · ${courtNames.join(", ")}`
          : `${detailSegments.length} slots`;
      const createdAt =
        detailSegments
          .map((segment) => segment.created_date)
          .filter((value): value is string => Boolean(value))
          .sort()
          .at(0) ?? null;
      if (createdAt) {
        groupEvents.push({
          id: `${detailBooking.booking_group_id}-created-group`,
          at: createdAt,
          title: "Booking created",
          detail: groupLabel,
        });
      }
      const submittedAt =
        detailSegments
          .map((segment) => segment.payment_submitted_at)
          .filter((value): value is string => Boolean(value))
          .sort()
          .at(-1) ?? null;
      const submittedCount = detailSegments.filter((segment) => segment.payment_submitted_at).length;
      if (submittedAt && submittedCount > 0) {
        groupEvents.push({
          id: `${detailBooking.booking_group_id}-payment-submitted-group`,
          at: submittedAt,
          title: "Payment proof submitted",
          detail:
            submittedCount === detailSegments.length
              ? groupLabel
              : `${submittedCount} of ${detailSegments.length} slots`,
        });
      }
    }

    return [...segmentEvents, ...groupEvents].sort((left, right) => {
        const leftAt = left.at ? new Date(left.at).getTime() : 0;
        const rightAt = right.at ? new Date(right.at).getTime() : 0;
        if (leftAt !== rightAt) return rightAt - leftAt;
        return left.title.localeCompare(right.title);
      });
  }, [detailBooking, detailSegments, historyTabLoaded]);

  const applyBookingUpdateToCaches = useCallback(
    (updated: Booking) => {
      queryClient.setQueriesData({ queryKey: ["admin-bookings"] }, (old) => {
        if (!old || typeof old !== "object") return old;
        const data = old as {
          pages?: Array<{ items?: Booking[] }>;
          pageParams?: unknown[];
        };
        if (!Array.isArray(data.pages)) return old;
        let changed = false;
        const pages = data.pages.map((page) => {
          if (!Array.isArray(page.items)) return page;
          let pageChanged = false;
          const items = page.items.map((booking) => {
            if (booking.id !== updated.id) return booking;
            pageChanged = true;
            return { ...booking, ...updated };
          });
          if (!pageChanged) return page;
          changed = true;
          return { ...page, items };
        });
        if (!changed) return old;
        return { ...data, pages };
      });

      queryClient.setQueriesData({ queryKey: ["admin-booking-detail"] }, (old) => {
        if (!old || typeof old !== "object") return old;
        const payload = old as {
          booking?: Booking;
          group_segments?: Booking[];
        };
        const nextBooking =
          payload.booking?.id === updated.id
            ? { ...payload.booking, ...updated }
            : payload.booking;
        const nextSegments = Array.isArray(payload.group_segments)
          ? payload.group_segments.map((segment) =>
              segment.id === updated.id ? { ...segment, ...updated } : segment,
            )
          : payload.group_segments;
        if (nextBooking === payload.booking && nextSegments === payload.group_segments) {
          return old;
        }
        return { ...payload, booking: nextBooking, group_segments: nextSegments };
      });
    },
    [queryClient],
  );

  const bulkUpdateStatuses = useMutation({
    mutationFn: async (updates: Array<{ id: string; status: Booking["status"] }>) => {
      const { data } = await courtlyApi.adminBookings.bulkStatus(updates);
      return data.updates;
    },
    onSuccess: (updatedRows) => {
      for (const updated of updatedRows) {
        applyBookingUpdateToCaches(updated);
      }
      void queryClient.invalidateQueries({ queryKey: ["admin-bookings"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-booking-detail"] });
      toast.success("Booking decisions submitted");
      setPendingDecisionById({});
      setCompletionDecisionById({});
      setConfirmBulkPendingOpen(false);
      setConfirmBulkCompleteOpen(false);
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, "Could not submit bulk booking decisions"));
    },
  });

  const addBookingNote = useMutation({
    mutationFn: async (note: string) => {
      if (!detailBooking) throw new Error("No booking selected");
      const { data } = await courtlyApi.adminBookings.addNote(detailBooking.id, note);
      return data.note;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-booking-notes", activeDetailId] });
      toast.success("Note added");
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, "Could not add note"));
    },
  });

  const filteredGroupRows = useMemo((): AdminBookingListGroup[] => {
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

    const rowMatches = (booking: Booking) => {
      const statusMatch =
        statusFilter === "all" || booking.status === statusFilter;
      const trace = bookingPaymentTraceStatus(booking);
      const paymentReviewMatch =
        paymentReview === "all" ||
        (paymentReview === "refund_required" && trace === "refund_required") ||
        (paymentReview === "paid" && trace === "paid");
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
    };

    const matchingKeys = new Set<string>();
    for (const b of bookings) {
      if (rowMatches(b)) matchingKeys.add(adminBookingGroupKey(b));
    }

    const byKey = new Map<string, Booking[]>();
    for (const b of bookings) {
      const k = adminBookingGroupKey(b);
      if (!matchingKeys.has(k)) continue;
      const arr = byKey.get(k) ?? [];
      arr.push(b);
      byKey.set(k, arr);
    }

    const rows: AdminBookingListGroup[] = [];
    for (const [key, rawMembers] of byKey.entries()) {
      const members = [...rawMembers].sort((a, b) =>
        String(b.created_date ?? "").localeCompare(String(a.created_date ?? "")),
      );
      const leader = members[0]!;
      const totalCost = members.reduce((sum, m) => sum + (m.total_cost ?? 0), 0);
      const venueNames = [
        ...new Set(
          members.map((m) => (m.establishment_name ?? "").trim()).filter(Boolean),
        ),
      ];
      const venueLabel =
        venueNames.length === 0
          ? (leader.establishment_name ?? "").trim() || "—"
          : venueNames.length === 1
            ? venueNames[0]!
            : "Multiple venues";
      const statusSet = new Set(members.map((m) => m.status));
      const statusKey =
        statusSet.size === 1 ? [...statusSet][0]! : "__mixed_status__";
      const refundRequired = members.some((m) => m.refund_required === true);
      const dateMin = members.reduce(
        (min, m) => (m.date < min ? m.date : min),
        members[0]!.date,
      );
      const dateMax = members.reduce(
        (max, m) => (m.date > max ? m.date : max),
        members[0]!.date,
      );
      const courtNames = [
        ...new Set(
          members.map((m) => (m.court_name ?? "").trim()).filter(Boolean),
        ),
      ];
      let courtsSummary: string;
      if (courtNames.length === 0) {
        courtsSummary = "Court";
      } else if (courtNames.length === 1) {
        courtsSummary = courtNames[0]!;
      } else if (courtNames.length <= 3) {
        courtsSummary = `${courtNames.length} courts · ${courtNames.join(", ")}`;
      } else {
        courtsSummary = `${members.length} reservations · ${courtNames.length} courts`;
      }

      rows.push({
        key,
        leader,
        members,
        segmentCount: members.length,
        totalCost,
        venueLabel,
        statusKey,
        refundRequired,
        dateMin,
        dateMax,
        courtsSummary,
      });
    }

    rows.sort((a, b) => {
      if (sortBy === "oldest_date") {
        const byDate = a.dateMin.localeCompare(b.dateMin);
        if (byDate !== 0) return byDate;
        return a.leader.start_time.localeCompare(b.leader.start_time);
      }
      if (sortBy === "amount_high") {
        return b.totalCost - a.totalCost;
      }
      if (sortBy === "amount_low") {
        return a.totalCost - b.totalCost;
      }
      const byDate = b.dateMax.localeCompare(a.dateMax);
      if (byDate !== 0) return byDate;
      return b.leader.start_time.localeCompare(a.leader.start_time);
    });
    return rows;
  }, [appliedFilters, bookings, search, sortBy]);

  const appliedBookingFilterChips = useMemo((): AppliedFilterChip[] => {
    const chips: AppliedFilterChip[] = [];
    const f = appliedFilters;

    if (f.status !== "all") {
      chips.push({
        id: "status",
        label: `Status: ${formatBookingStatusLabel(f.status)}`,
        onRemove: () =>
          setAppliedFilters((p) => ({ ...p, status: "all" })),
      });
    }
    if (f.paymentReview === "refund_required") {
      chips.push({
        id: "payment-review",
        label: "Refund",
        onRemove: () =>
          setAppliedFilters((p) => ({ ...p, paymentReview: "all" })),
      });
    } else if (f.paymentReview === "paid") {
      chips.push({
        id: "payment-review",
        label: "Paid / confirmed",
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

  const stats = useMemo(() => {
    const checkoutCount = new Set(bookings.map(adminBookingGroupKey)).size;
    return {
      total: checkoutCount,
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
  }, [bookings]);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 md:px-10">
      <ConfirmDialog
        open={confirmBulkPendingOpen}
        onOpenChange={setConfirmBulkPendingOpen}
        title="Submit slot decisions?"
        description={`This will apply decisions to ${selectedPendingUpdates.length} slot${selectedPendingUpdates.length === 1 ? "" : "s"}.`}
        confirmLabel="Submit decisions"
        isPending={bulkUpdateStatuses.isPending}
        onConfirm={() => {
          if (selectedPendingUpdates.length === 0) return;
          bulkUpdateStatuses.mutate(selectedPendingUpdates);
        }}
      />
      <ConfirmDialog
        open={confirmBulkCompleteOpen}
        onOpenChange={setConfirmBulkCompleteOpen}
        title="Complete selected slots?"
        description={`This will mark ${selectedCompleteUpdates.length} slot${selectedCompleteUpdates.length === 1 ? "" : "s"} as completed.`}
        confirmLabel="Complete selected"
        isPending={bulkUpdateStatuses.isPending}
        onConfirm={() => {
          if (selectedCompleteUpdates.length === 0) return;
          bulkUpdateStatuses.mutate(selectedCompleteUpdates);
        }}
      />
      <Dialog
        open={!!activeDetailId}
        onOpenChange={(open) => {
          if (!open && paymentProofPreviewUrl) {
            dismissPaymentProofPreview();
            return;
          }
          if (!open) {
            dismissPaymentProofPreview();
            setDetailId(null);
            if (detailIdFromQuery) {
              router.replace(pathname, { scroll: false });
            }
          }
        }}
      >
        <DialogContent
          className="max-h-[min(92dvh,44rem)] sm:max-w-5xl"
          onInteractOutside={(e) => {
            if (!paymentProofPreviewUrl) return;
            e.preventDefault();
            dismissPaymentProofPreview();
          }}
          onFocusOutside={(e) => {
            if (!paymentProofPreviewUrl) return;
            e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (!paymentProofPreviewUrl) return;
            e.preventDefault();
            dismissPaymentProofPreview();
          }}
        >
          <DialogTitle className="sr-only">
            {paymentProofPreviewUrl ? "Payment proof" : "Booking details"}
          </DialogTitle>
          {paymentProofPreviewUrl ? (
            <div className="flex max-h-[min(80dvh,36rem)] min-h-0 flex-col gap-4">
              <DialogHeader className="pr-8 text-left">
                <DialogTitle className="font-heading">Payment proof</DialogTitle>
                <DialogDescription>
                  Screenshot submitted by the player.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
                <p className="text-xs text-muted-foreground">
                  Zoom: {Math.round(paymentProofZoom * 100)}%
                </p>
                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 px-2"
                    onClick={() =>
                      setPaymentProofZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))
                    }
                    disabled={paymentProofZoom <= 0.5}
                    aria-label="Zoom out"
                  >
                    -
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 px-2"
                    onClick={() => setPaymentProofZoom(1)}
                    disabled={paymentProofZoom === 1}
                  >
                    Reset
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8 px-2"
                    onClick={() =>
                      setPaymentProofZoom((z) => Math.min(3, Math.round((z + 0.25) * 100) / 100))
                    }
                    disabled={paymentProofZoom >= 3}
                    aria-label="Zoom in"
                  >
                    +
                  </Button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border/70 bg-muted/20 p-2">
                {isEmbedSafePaymentProofUrl(paymentProofPreviewUrl) ? (
                  <div className="inline-block">
                    {/* eslint-disable-next-line @next/next/no-img-element -- data URL or HTTPS proof URL */}
                    <img
                      src={paymentProofPreviewUrl}
                      alt="Payment proof submitted for this booking"
                      className="block h-auto max-h-none max-w-none"
                      style={{
                        width: `${paymentProofZoom * 100}%`,
                      }}
                    />
                  </div>
                ) : (
                  <p className="p-4 text-sm text-muted-foreground">
                    This proof link can&apos;t be previewed here.{" "}
                    <a
                      href={paymentProofPreviewUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="font-medium text-primary underline-offset-2 hover:underline"
                    >
                      Open in new tab
                    </a>
                  </p>
                )}
              </div>
              <DialogFooter className="sm:justify-end">
                <Button type="button" variant="secondary" onClick={dismissPaymentProofPreview}>
                  Back to booking details
                </Button>
              </DialogFooter>
            </div>
          ) : detailBooking ? (
            <div className="space-y-6 text-sm">
              <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] lg:items-start">
                <div className="space-y-6">
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
                      {detailSegments.length > 1 ? (
                        <>
                          <dt className="text-muted-foreground">Checkout</dt>
                          <dd className="text-foreground">
                            {detailSegments.length} reservations in one payment
                          </dd>
                        </>
                      ) : null}
                      <dt className="text-muted-foreground">Player</dt>
                      <dd>{detailBooking.player_name ?? "—"}</dd>
                      <dt className="text-muted-foreground">Email</dt>
                      <dd className="break-all">{detailBooking.player_email ?? "—"}</dd>
                      <dt className="text-muted-foreground">Contact number</dt>
                      <dd className="tabular-nums">
                        {detailBooking.player_mobile_number?.trim() || "—"}
                      </dd>
                      <dt className="text-muted-foreground">Total</dt>
                      <dd className="font-heading font-bold text-primary">
                        {formatPhp(adminSessionTotal)}
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
                    {paymentDetailSegment &&
                    (paymentDetailSegment.payment_submitted_method ||
                      paymentDetailSegment.payment_submitted_at) ? (
                      <div className="mt-3 rounded-lg border border-border/60 bg-muted/20 p-3 text-xs">
                        <p className="font-medium text-foreground">
                          Submitted via{" "}
                          {paymentDetailSegment.payment_submitted_method
                            ? formatStatusLabel(paymentDetailSegment.payment_submitted_method)
                            : "—"}
                        </p>
                        <div className="mt-1 flex items-center justify-between gap-2">
                          <p className="text-muted-foreground">
                            {paymentDetailSegment.payment_submitted_at
                              ? format(new Date(paymentDetailSegment.payment_submitted_at), "PPpp")
                              : "—"}
                          </p>
                          {paymentDetailSegment.payment_proof_url ? (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="shrink-0"
                              onClick={() => {
                                setPaymentProofZoom(1);
                                setPaymentProofPreviewUrl(paymentDetailSegment.payment_proof_url!);
                              }}
                            >
                              View payment proof
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                  </section>
                </div>
                <div className="space-y-6">
                  <section className="space-y-3">
                    <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {detailSegments.length > 1 ? "Items" : "Reservation"}
                    </h4>
                    {pendingConfirmationSegments.length > 0 ? (
                      <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                        <p className="text-xs font-medium text-muted-foreground">
                          Select pending slots to confirm or reject, then submit in bulk.
                        </p>
                      </div>
                    ) : null}
                    {confirmedSegments.length > 0 ? (
                      <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                        <p className="text-xs font-medium text-muted-foreground">
                          Select confirmed slots to complete, then submit in bulk.
                        </p>
                      </div>
                    ) : null}
                    <ul className="space-y-3">
                      {detailSegments.map((segment) => {
                        return (
                          <li
                            key={segment.id}
                            className="rounded-lg border border-border/60 bg-muted/15 p-3"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div className="min-w-0 flex-1 space-y-0.5">
                                <p className="font-medium text-foreground">
                                  {segment.court_name ?? "Court"}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {segment.date
                                    ? format(new Date(segment.date), "MMM d, yyyy")
                                    : "—"}{" "}
                                  · {formatTimeShort(segment.start_time)} –{" "}
                                  {formatTimeShort(segment.end_time)}
                                </p>
                                {segment.notes?.trim() ? (
                                  <p className="pt-1 text-xs text-muted-foreground">
                                    Note: {segment.notes.trim()}
                                  </p>
                                ) : null}
                              </div>
                              <div className="shrink-0 space-y-1 text-right">
                                <div className="flex flex-wrap justify-end gap-1">
                                  <Badge
                                    variant="outline"
                                    className={statusStyles[segment.status] ?? ""}
                                  >
                                    {formatBookingStatusLabel(segment.status)}
                                  </Badge>
                                  {segment.refund_required ? (
                                    <Badge
                                      variant="outline"
                                      className="border-amber-500/30 bg-amber-500/10 text-amber-700"
                                    >
                                      Refund
                                    </Badge>
                                  ) : null}
                                </div>
                                <p className="font-semibold tabular-nums text-foreground">
                                  {formatPhp(segment.total_cost ?? 0)}
                                </p>
                              </div>
                            </div>
                            {segment.status === "pending_confirmation" ? (
                              <div className="mt-3 flex flex-wrap gap-2 border-t border-border/50 pt-3">
                                <Select
                                  value={pendingDecisionById[segment.id] ?? ""}
                                  onValueChange={(value) =>
                                    setPendingDecisionById((current) => ({
                                      ...current,
                                      [segment.id]: value as "confirmed" | "cancelled",
                                    }))
                                  }
                                >
                                  <SelectTrigger className="h-8 w-[220px]">
                                    <SelectValue placeholder="Select decision" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="confirmed">Confirm payment</SelectItem>
                                    <SelectItem value="cancelled">Reject payment</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            ) : null}
                            {segment.status === "confirmed" ? (
                              <div className="mt-3 flex flex-wrap gap-2 border-t border-border/50 pt-3">
                                <Select
                                  value={completionDecisionById[segment.id] ?? ""}
                                  onValueChange={(value) =>
                                    setCompletionDecisionById((current) => {
                                      const next = { ...current };
                                      if (value === "completed") {
                                        next[segment.id] = "completed";
                                      } else {
                                        delete next[segment.id];
                                      }
                                      return next;
                                    })
                                  }
                                >
                                  <SelectTrigger className="h-8 w-[220px]">
                                    <SelectValue placeholder="Select action" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="completed">Complete slot</SelectItem>
                                    <SelectItem value="skip">No action</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                    {pendingConfirmationSegments.length > 0 ? (
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          size="sm"
                          disabled={selectedPendingUpdates.length === 0 || bulkUpdateStatuses.isPending}
                          onClick={() => {
                            if (selectedPendingUpdates.length === 0) {
                              toast.error("Select at least one pending slot decision.");
                              return;
                            }
                            setConfirmBulkPendingOpen(true);
                          }}
                        >
                          {bulkUpdateStatuses.isPending ? "Submitting..." : "Submit"}
                        </Button>
                      </div>
                    ) : null}
                    {confirmedSegments.length > 0 ? (
                      <div className="flex justify-end">
                        <Button
                          type="button"
                          size="sm"
                          disabled={selectedCompleteUpdates.length === 0 || bulkUpdateStatuses.isPending}
                          onClick={() => {
                            if (selectedCompleteUpdates.length === 0) {
                              toast.error("Select at least one confirmed slot to complete.");
                              return;
                            }
                            setConfirmBulkCompleteOpen(true);
                          }}
                        >
                          {bulkUpdateStatuses.isPending ? "Submitting..." : "Submit completion"}
                        </Button>
                      </div>
                    ) : null}
                  </section>
                </div>
              </div>
              <Tabs
                value={detailPanelTab}
                onValueChange={(value) => {
                  const next = value as "notes" | "history";
                  setDetailPanelTab(next);
                  if (next === "history") setHistoryTabLoaded(true);
                }}
                className="space-y-3"
              >
                <TabsList className="grid h-9 w-full grid-cols-2">
                  <TabsTrigger value="notes">Notes</TabsTrigger>
                  <TabsTrigger value="history">History</TabsTrigger>
                </TabsList>
                <TabsContent value="notes" className="mt-0">
                  <BookingNotesPanel
                    notes={bookingNotes}
                    legacyNote={adminNoteBooking ?? detailBooking}
                    onAddNote={(note) => addBookingNote.mutate(note)}
                    addPending={addBookingNote.isPending}
                    loading={bookingNotesLoading}
                  />
                </TabsContent>
                <TabsContent value="history" className="mt-0">
                  <section className="rounded-lg border border-border/60 bg-muted/10 p-3">
                    {!historyTabLoaded ? (
                      <p className="text-xs text-muted-foreground">
                        Open the History tab to load booking timeline.
                      </p>
                    ) : bookingAuditEvents.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No booking audit events yet.</p>
                    ) : (
                      <ul className="space-y-2.5">
                        {bookingAuditEvents.map((event) => (
                          <li
                            key={event.id}
                            className="relative overflow-hidden rounded-lg border border-border/50 bg-muted/20 px-3 py-3 text-sm"
                          >
                            <span
                              aria-hidden
                              className={cn(
                                "absolute inset-y-0 left-0 w-1",
                                bookingAuditAccentClass(event.title),
                              )}
                            />
                            <div className="flex flex-col gap-1.5 sm:flex-row sm:items-start sm:justify-between">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "w-fit text-[10px] uppercase tracking-wide",
                                  bookingAuditBadgeClass(event.title),
                                )}
                              >
                                {event.title}
                              </Badge>
                              <span className="inline-flex flex-wrap items-center justify-end gap-1 text-xs text-muted-foreground sm:max-w-[18rem]">
                                <Calendar className="h-3 w-3" />
                                <span>
                                  {event.at ? format(new Date(event.at), "PPpp") : "Time not tracked"}
                                </span>
                                {event.actor ? (
                                  <>
                                    <span aria-hidden>·</span>
                                    <span>By {event.actor}</span>
                                  </>
                                ) : null}
                              </span>
                            </div>
                            <p className="mt-2 whitespace-pre-wrap wrap-break-word text-sm leading-relaxed text-foreground/85">
                              {event.detail}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </TabsContent>
              </Tabs>
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
            ? "One row per player checkout; bulk bookings group courts and dates together."
            : "One row per player checkout on courts you manage."
        }
      >
        <Button
          type="button"
          variant="outline"
          onClick={() => void refetchBookings()}
          disabled={isLoading || isRefetching}
        >
          {isRefetching ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Refreshing...
            </span>
          ) : (
            "Refresh"
          )}
        </Button>
      </PageHeader>

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-5">
        {[
          {
            label: "Checkouts",
            value: stats.total,
            color: "text-foreground",
          },
          { label: "Confirmed", value: stats.confirmed, color: "text-primary" },
          {
            label: "Cancelled",
            value: stats.cancelled,
            color: "text-destructive",
          },
          {
            label: "Refund",
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
                  <SelectItem value="pending_confirmation">
                    Waiting for venue confirmation
                  </SelectItem>
                  <SelectItem value="confirmed">Confirmed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="admin-booking-filter-payment-review">Payment</Label>
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
                  <SelectValue placeholder="All" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="refund_required">Refund</SelectItem>
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
      ) : filteredGroupRows.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground">
          No bookings found.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredGroupRows.map((group) => (
            <Card
              key={group.key}
              className="cursor-pointer rounded-lg border border-border/60 bg-card transition-colors hover:border-border hover:bg-muted/10"
              onClick={() => openAdminBookingDetail(group.leader.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openAdminBookingDetail(group.leader.id);
                }
              }}
            >
              <CardContent className="p-4 sm:p-5">
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="font-heading text-base font-semibold leading-snug text-foreground">
                        {group.courtsSummary}
                      </p>
                      {group.venueLabel ? (
                        <p className="text-sm text-muted-foreground">{group.venueLabel}</p>
                      ) : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-heading text-lg font-bold tabular-nums text-foreground">
                        {formatPhp(group.totalCost)}
                      </p>
                      <p className="text-xs text-muted-foreground">View details</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {group.segmentCount > 1 ? (
                      <Badge variant="secondary" className="px-2 py-0 text-[10px] font-medium">
                        {group.segmentCount} items
                      </Badge>
                    ) : null}
                    {group.leader.booking_number ? (
                      <Badge variant="outline" className="px-2 py-0 font-mono text-[10px]">
                        {group.leader.booking_number}
                      </Badge>
                    ) : null}
                    <Badge
                      variant="outline"
                      className={`px-2 py-0 text-[10px] ${
                        statusStyles[
                          group.statusKey === "__mixed_status__"
                            ? "__mixed_status__"
                            : group.statusKey
                        ] ?? ""
                      }`}
                    >
                      {group.statusKey === "__mixed_status__"
                        ? "Mixed statuses"
                        : formatBookingStatusLabel(group.statusKey)}
                    </Badge>
                    {group.refundRequired ? (
                      <Badge
                        variant="outline"
                        className="border-amber-500/30 bg-amber-500/10 px-2 py-0 text-[10px] text-amber-800 dark:text-amber-200"
                      >
                        Refund
                      </Badge>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span className="font-medium text-foreground">
                      {group.leader.player_name ?? "—"}
                    </span>
                    <span className="text-muted-foreground">{group.leader.player_email}</span>
                    <span className="inline-flex items-center gap-1 text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                      {group.dateMin === group.dateMax
                        ? format(new Date(group.dateMin), "MMM d, yyyy")
                        : `${format(new Date(group.dateMin), "MMM d, yyyy")} – ${format(new Date(group.dateMax), "MMM d, yyyy")}`}
                    </span>
                    {group.leader.notes?.trim() ? (
                      <span
                        className="max-w-full truncate text-xs text-muted-foreground"
                        title={group.leader.notes.trim()}
                      >
                        {group.leader.notes.trim()}
                      </span>
                    ) : null}
                  </div>
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

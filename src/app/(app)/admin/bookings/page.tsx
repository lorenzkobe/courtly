"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  Calendar,
  Clock,
  ExternalLink,
  MapPin,
  Search,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import PageHeader from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
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
import { courtlyApi } from "@/lib/api/courtly-client";
import { formatPhp } from "@/lib/format-currency";
import { formatTimeShort } from "@/lib/booking-range";
import { useAuth } from "@/lib/auth/auth-context";
import { isSuperadmin } from "@/lib/auth/management";
import { formatAmenityLabel } from "@/lib/format-amenity";
import type { Booking } from "@/lib/types/courtly";
import { formatStatusLabel } from "@/lib/utils";

function mutationErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error && "response" in error) {
    const response = (error as { response?: { data?: { error?: string } } }).response;
    const msg = response?.data?.error;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return fallback;
}

const statusStyles: Record<string, string> = {
  confirmed: "bg-primary/10 text-primary border-primary/20",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
  completed: "bg-muted text-muted-foreground border-border",
};

export default function AdminBookingsPage() {
  const { user } = useAuth();
  const globalAdmin = isSuperadmin(user);
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [adminNoteDraft, setAdminNoteDraft] = useState("");
  const currentUserId = user?.id ?? "";

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["admin-bookings", globalAdmin ? "all" : "managed"],
    queryFn: async () => {
      const { data } = await courtlyApi.bookings.list({ manageable: true });
      return data;
    },
  });

  const { data: detailBooking } = useQuery({
    queryKey: ["admin-booking-detail", detailId],
    queryFn: async () => {
      const { data } = await courtlyApi.bookings.get(detailId!);
      return data;
    },
    enabled: !!detailId,
  });

  const { data: detailCourt } = useQuery({
    queryKey: ["admin-booking-court", detailBooking?.court_id],
    queryFn: async () => {
      const { data } = await courtlyApi.courts.get(detailBooking!.court_id);
      return data;
    },
    enabled: !!detailBooking?.court_id,
  });

  const { data: detailGroup = [] } = useQuery({
    queryKey: [
      "admin-booking-group",
      detailBooking?.booking_group_id,
      detailId,
    ],
    queryFn: async () => {
      const { data } = await courtlyApi.bookings.list({
        manageable: true,
        booking_group_id: detailBooking!.booking_group_id!,
      });
      return data.sort((a, b) => a.start_time.localeCompare(b.start_time));
    },
    enabled: !!detailBooking?.booking_group_id,
  });

  const detailSegments = useMemo(() => {
    if (!detailBooking) return [];
    if (detailBooking.booking_group_id && detailGroup.length > 0) {
      return detailGroup;
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

  const hasMapPin =
    detailCourt &&
    detailCourt.map_latitude != null &&
    detailCourt.map_longitude != null &&
    Number.isFinite(detailCourt.map_latitude) &&
    Number.isFinite(detailCourt.map_longitude);
  const mapLat = detailCourt?.map_latitude ?? 0;
  const mapLon = detailCourt?.map_longitude ?? 0;
  const mapBboxPad = 0.018;
  const mapEmbedSrc =
    hasMapPin && detailCourt
      ? `https://www.openstreetmap.org/export/embed.html?bbox=${mapLon - mapBboxPad},${mapLat - mapBboxPad},${mapLon + mapBboxPad},${mapLat + mapBboxPad}&layer=mapnik`
      : null;
  const mapOpenHref = detailCourt
    ? hasMapPin
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${mapLat},${mapLon}`)}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(detailCourt.location)}`
    : "#";
  const directionsHref = detailCourt
    ? hasMapPin
      ? `https://www.google.com/maps/dir/?api=1&destination=${mapLat},${mapLon}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(detailCourt.location)}`
    : "#";

  const updateStatus = useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: string;
    }) => {
      await courtlyApi.bookings.update(id, {
        status: status as "confirmed" | "cancelled" | "completed",
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-bookings"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-booking-detail"] });
      void queryClient.invalidateQueries({ queryKey: ["admin-booking-group"] });
      void queryClient.invalidateQueries({ queryKey: ["my-bookings"] });
      toast.success("Booking updated");
    },
    onMutate: async ({ id, status }) => {
      queryClient.setQueriesData(
        { queryKey: ["admin-bookings"] },
        (old: Booking[] | undefined) =>
          old?.map((b) => (b.id === id ? { ...b, status: status as typeof b.status } : b)),
      );
    },
    onError: (error) => {
      toast.error(mutationErrorMessage(error, "Could not update booking"));
    },
  });

  const saveAdminNote = useMutation({
    mutationFn: async () => {
      if (!detailBooking) throw new Error("No booking selected");
      await courtlyApi.bookings.setAdminNote(detailBooking.id, {
        admin_note: adminNoteDraft,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-booking-detail", detailId] });
      void queryClient.invalidateQueries({ queryKey: ["admin-bookings"] });
      toast.success("Note saved");
    },
    onError: (error) => {
      toast.error(mutationErrorMessage(error, "Could not save note"));
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
      setAdminNoteDraft("");
      void queryClient.invalidateQueries({ queryKey: ["admin-booking-detail", detailId] });
      void queryClient.invalidateQueries({ queryKey: ["admin-bookings"] });
      toast.success("Note deleted");
    },
    onError: (error) => {
      toast.error(mutationErrorMessage(error, "Could not delete note"));
    },
  });

  const filtered = bookings.filter((b) => {
    const statusMatch = statusFilter === "all" || b.status === statusFilter;
    const q = search.toLowerCase();
    const searchMatch =
      !search ||
      b.player_name?.toLowerCase().includes(q) ||
      b.player_email?.toLowerCase().includes(q) ||
      b.court_name?.toLowerCase().includes(q);
    return statusMatch && searchMatch;
  });

  const stats = {
    total: bookings.length,
    confirmed: bookings.filter((b) => b.status === "confirmed").length,
    cancelled: bookings.filter((b) => b.status === "cancelled").length,
    revenue: bookings
      .filter((b) => b.status !== "cancelled")
      .reduce((sum, b) => sum + (b.total_cost || 0), 0),
  };

  useEffect(() => {
    setAdminNoteDraft(detailBooking?.admin_note ?? "");
  }, [detailBooking?.id, detailBooking?.admin_note, currentUserId]);

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 md:px-10">
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
                  <dt className="text-muted-foreground">Court</dt>
                  <dd className="font-medium">{detailBooking.court_name ?? "—"}</dd>
                  <dt className="text-muted-foreground">Player</dt>
                  <dd>{detailBooking.player_name ?? "—"}</dd>
                  <dt className="text-muted-foreground">Email</dt>
                  <dd className="break-all">{detailBooking.player_email ?? "—"}</dd>
                  <dt className="text-muted-foreground">Date</dt>
                  <dd>
                    {detailBooking.date
                      ? format(new Date(detailBooking.date), "MMM d, yyyy")
                      : "—"}
                  </dd>
                  <dt className="text-muted-foreground">Reserved times</dt>
                  <dd>
                    <ul className="space-y-2">
                      {detailSegments.map((s) => (
                        <li
                          key={s.id}
                          className="flex flex-wrap items-center gap-2 text-foreground"
                        >
                          <span>
                            {formatTimeShort(s.start_time)} –{" "}
                            {formatTimeShort(s.end_time)}
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-xs ${statusStyles[s.status] ?? ""}`}
                          >
                            {formatStatusLabel(s.status)}
                          </Badge>
                          <span className="text-muted-foreground">
                            {formatPhp(s.total_cost ?? 0)}
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
                    <Badge variant="outline" className={statusStyles[detailBooking.status] ?? ""}>
                      {formatStatusLabel(detailBooking.status)}
                    </Badge>
                  </dd>
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
              </section>
              <section className="border-t border-border/60 pt-4">
                <Label htmlFor="admin-booking-note">Admin note</Label>
                <Textarea
                  id="admin-booking-note"
                  className="mt-1.5"
                  rows={3}
                  value={adminNoteDraft}
                  onChange={(e) => setAdminNoteDraft(e.target.value)}
                  placeholder="Add internal note/comment for this booking"
                />
                {detailBooking.admin_note_updated_at ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Last updated by{" "}
                    {detailBooking.admin_note_updated_by_name ?? "Admin"} on{" "}
                    {format(new Date(detailBooking.admin_note_updated_at), "PPpp")}
                  </p>
                ) : null}
                <div className="mt-2 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => saveAdminNote.mutate()}
                    disabled={saveAdminNote.isPending}
                  >
                    Save note
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => clearAdminNote.mutate()}
                    disabled={clearAdminNote.isPending}
                  >
                    Delete note
                  </Button>
                </div>
              </section>
              {detailCourt ? (
                <section className="border-t border-border/60 pt-4">
                  <h3 className="mb-2 font-heading font-semibold text-foreground">
                    Venue & directions
                  </h3>
                  <p className="font-medium text-foreground">{detailCourt.name}</p>
                  <p className="mt-1 flex items-start gap-2 text-muted-foreground">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {detailCourt.location}
                  </p>
                  {detailCourt.amenities?.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {detailCourt.amenities.map((a, i) => (
                        <Badge key={`${i}-${a}`} variant="outline" className="font-normal">
                          {formatAmenityLabel(a)}
                        </Badge>
                      ))}
                    </div>
                  ) : null}
                  {mapEmbedSrc ? (
                    <div className="mt-3 overflow-hidden rounded-2xl border border-border">
                      <iframe
                        title={`Map — ${detailCourt.name}`}
                        src={mapEmbedSrc}
                        className="aspect-video w-full max-h-48 border-0"
                        loading="lazy"
                        referrerPolicy="no-referrer-when-downgrade"
                      />
                    </div>
                  ) : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" asChild>
                      <a href={mapOpenHref} target="_blank" rel="noopener noreferrer">
                        <MapPin className="mr-1.5 h-3.5 w-3.5" />
                        Open in Map
                        <ExternalLink className="ml-1.5 h-3 w-3 opacity-70" />
                      </a>
                    </Button>
                    <Button variant="outline" size="sm" asChild>
                      <a href={directionsHref} target="_blank" rel="noopener noreferrer">
                        Directions
                        <ExternalLink className="ml-1.5 h-3 w-3 opacity-70" />
                      </a>
                    </Button>
                  </div>
                </section>
              ) : null}
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

      <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: "Total Bookings", value: stats.total, color: "text-foreground" },
          { label: "Confirmed", value: stats.confirmed, color: "text-primary" },
          {
            label: "Cancelled",
            value: stats.cancelled,
            color: "text-destructive",
          },
          {
            label: "Revenue",
            value: formatPhp(stats.revenue),
            color: "text-chart-3",
          },
        ].map((s) => (
          <Card key={s.label} className="border-border/50">
            <CardContent className="p-5">
              <p className="mb-1 text-sm text-muted-foreground">{s.label}</p>
              <p className={`font-heading text-2xl font-bold ${s.color}`}>
                {s.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, court..."
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="confirmed">Confirmed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
          </SelectContent>
        </Select>
      </div>

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
          {filtered.map((b) => (
            <Card
              key={b.id}
              className="border-border/50 transition-shadow hover:shadow-sm"
            >
              <CardContent className="p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex-1">
                    <div className="mb-1.5 flex items-center gap-2">
                      <span className="font-heading font-bold text-foreground">
                        {b.court_name || "Court"}
                      </span>
                      <Badge
                        variant="outline"
                        className={statusStyles[b.status] ?? ""}
                      >
                        {formatStatusLabel(b.status)}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">
                        {b.player_name}
                      </span>
                      <span>{b.player_email}</span>
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />{" "}
                        {b.date && format(new Date(b.date), "MMM d, yyyy")}
                      </div>
                      <div className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />{" "}
                        {formatTimeShort(b.start_time)} –{" "}
                        {formatTimeShort(b.end_time)}
                      </div>
                      {b.notes?.trim() ? (
                        <span
                          className="max-w-full truncate text-xs text-muted-foreground"
                          title={b.notes.trim()}
                        >
                          {b.notes.trim()}
                        </span>
                      ) : null}
                      <div className="font-semibold text-foreground tabular-nums">
                        {b.total_cost != null ? formatPhp(b.total_cost) : "—"}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      className="text-xs"
                      onClick={() => setDetailId(b.id)}
                    >
                      Details
                    </Button>
                    {b.status === "confirmed" ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs"
                          onClick={() =>
                            updateStatus.mutate({
                              id: b.id,
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
                          onClick={() =>
                            updateStatus.mutate({
                              id: b.id,
                              status: "cancelled",
                            })
                          }
                        >
                          <X className="mr-1 h-3.5 w-3.5" /> Cancel
                        </Button>
                      </>
                    ) : null}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { ArrowLeft, CalendarIcon, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
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
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { courtlyApi } from "@/lib/api/courtly-client";
import type { Court, Venue } from "@/lib/types/courtly";
import { formatAmenityLabel } from "@/lib/format-amenity";
import { cn, formatStatusLabel } from "@/lib/utils";

const defaultForm = {
  name: "",
};

const defaultClosureForm = {
  date: format(addDays(new Date(), 1), "yyyy-MM-dd"),
  reason: "owner_use",
  note: "",
};

const defaultVenueForm = {
  name: "",
  location: "",
  contact_phone: "",
  sport: "pickleball" as Venue["sport"],
  hourly_rate: "",
  opens_at: "07:00",
  closes_at: "22:00",
  status: "active" as Venue["status"],
  amenities: [] as string[],
  customAmenityDraft: "",
  image_url: "",
  hourly_rate_windows: [] as Array<{ start: string; end: string; rate: string }>,
};

const amenityOptions = [
  "lights",
  "restrooms",
  "parking",
  "locker_room",
  "pro_shop",
  "water_fountain",
  "seating",
];

function normAmenity(s: string) {
  return s.trim().toLowerCase();
}

function mutationErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error && "response" in error) {
    const response = (error as { response?: { data?: { error?: string } } }).response;
    const msg = response?.data?.error;
    if (typeof msg === "string" && msg.trim()) return msg;
  }
  return fallback;
}

export default function AdminVenueCourtsPage() {
  const params = useParams<{ venueId: string }>();
  const venueId = params.venueId;
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Court | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [venueOpen, setVenueOpen] = useState(false);
  const [venueForm, setVenueForm] = useState(defaultVenueForm);
  const [closureOpen, setClosureOpen] = useState(false);
  const [closureForm, setClosureForm] = useState(defaultClosureForm);
  const [selectedClosureCourtIds, setSelectedClosureCourtIds] = useState<string[]>([]);
  const [selectedClosureTimes, setSelectedClosureTimes] = useState<string[]>([]);
  const [closureDateOpen, setClosureDateOpen] = useState(false);
  const [confirmDeleteCourtId, setConfirmDeleteCourtId] = useState<string | null>(null);

  const { data: courts = [], isLoading } = useQuery({
    queryKey: ["admin-venues"],
    queryFn: async () => {
      const { data } = await courtlyApi.courts.list({ manageable: true });
      return data;
    },
  });

  const venueCourts = useMemo(
    () => courts.filter((c) => c.venue_id === venueId),
    [courts, venueId],
  );

  const { data: venueDetail } = useQuery({
    queryKey: ["venue-detail", venueId],
    queryFn: async () => {
      const { data } = await courtlyApi.venues.get(venueId);
      return data;
    },
    enabled: !!venueId,
  });
  const venue = venueDetail?.venue;
  const venueName = venue?.name ?? venueCourts[0]?.establishment_name ?? "Venue";

  const upsert = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        venue_id: venueId,
      };
      if (editing) {
        await courtlyApi.courts.update(editing.id, payload);
      } else {
        await courtlyApi.courts.create(payload);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-venues"] });
      void queryClient.invalidateQueries({ queryKey: ["courts"] });
      toast.success(editing ? "Court updated" : "Court created");
      setOpen(false);
      setEditing(null);
      setForm(defaultForm);
    },
    onError: (e: Error) => {
      toast.error(e.message || "Could not save the court.");
    },
  });

  const saveVenue = useMutation({
    mutationFn: async () => {
      await courtlyApi.venues.update(venueId, {
        name: venueForm.name.trim(),
        location: venueForm.location.trim(),
        contact_phone: venueForm.contact_phone.trim(),
        sport: "pickleball",
        hourly_rate: Number.parseFloat(venueForm.hourly_rate) || 0,
        opens_at: venueForm.opens_at,
        closes_at: venueForm.closes_at,
        status: venueForm.status,
        amenities: [...new Set(venueForm.amenities.map((a) => a.trim()).filter(Boolean))],
        image_url: venueForm.image_url.trim(),
        hourly_rate_windows: venueForm.hourly_rate_windows
          .filter((w) => w.start.trim() && w.end.trim() && w.rate.trim())
          .map((w) => ({
            start: w.start.trim(),
            end: w.end.trim(),
            hourly_rate: Number.parseFloat(w.rate) || 0,
          })),
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["venue-detail", venueId] });
      void queryClient.invalidateQueries({ queryKey: ["admin-venues"] });
      void queryClient.invalidateQueries({ queryKey: ["courts"] });
      toast.success("Venue updated");
      setVenueOpen(false);
    },
    onError: (e: Error) => {
      toast.error(e.message || "Could not save venue");
    },
  });

  const deleteCourt = useMutation({
    mutationFn: async (id: string) => {
      await courtlyApi.courts.remove(id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-venues"] });
      void queryClient.invalidateQueries({ queryKey: ["courts"] });
      toast.success("Court deleted");
    },
    onError: (error) => {
      toast.error(mutationErrorMessage(error, "Could not delete court"));
    },
  });

  const applyClosure = useMutation({
    mutationFn: async () => {
      const date = closureForm.date.trim();
      const reason = closureForm.reason.trim();
      const note = closureForm.note.trim();

      if (!date || !reason) {
        throw new Error("Date and reason are required.");
      }
      if (selectedClosureCourtIds.length === 0) {
        throw new Error("Select at least one court.");
      }
      if (selectedClosureTimes.length === 0) {
        throw new Error("Select at least one time slot.");
      }

      const sorted = [...selectedClosureTimes].sort((a, b) => a.localeCompare(b));
      const contiguousRanges: Array<{ start_time: string; end_time: string }> = [];
      let rangeStart = sorted[0]!;
      let previous = sorted[0]!;
      for (let i = 1; i <= sorted.length; i++) {
        const current = sorted[i];
        const prevHour = Number.parseInt(previous.split(":")[0] ?? "0", 10);
        const expectedNext = `${String(prevHour + 1).padStart(2, "0")}:00`;
        if (!current || current !== expectedNext) {
          contiguousRanges.push({
            start_time: rangeStart,
            end_time: `${String(prevHour + 1).padStart(2, "0")}:00`,
          });
          rangeStart = current ?? rangeStart;
        }
        previous = current ?? previous;
      }

      for (const courtId of selectedClosureCourtIds) {
        for (const range of contiguousRanges) {
          await courtlyApi.courtClosures.create(courtId, {
            date,
            start_time: range.start_time,
            end_time: range.end_time,
            reason,
            note: note || undefined,
          });
        }
      }
    },
    onSuccess: () => {
      toast.success("Unavailability applied to selected courts");
      setClosureOpen(false);
      setSelectedClosureCourtIds([]);
      setSelectedClosureTimes([]);
      setClosureForm(defaultClosureForm);
      void queryClient.invalidateQueries({ queryKey: ["court-closures"] });
    },
    onError: (e: Error) => {
      toast.error(e.message || "Could not apply unavailability");
    },
  });

  const openEdit = (court: Court) => {
    setEditing(court);
    setForm({
      name: court.name || "",
    });
    setOpen(true);
  };

  const openCreate = () => {
    setEditing(null);
    setForm(defaultForm);
    setOpen(true);
  };

  const openVenueEdit = () => {
    if (!venue) return;
    setVenueForm({
      name: venue.name,
      location: venue.location,
      contact_phone: venue.contact_phone ?? "",
      sport: "pickleball",
      hourly_rate: String(venue.hourly_rate),
      opens_at: venue.opens_at,
      closes_at: venue.closes_at,
      status: venue.status,
      amenities: [...venue.amenities],
      customAmenityDraft: "",
      image_url: venue.image_url,
      hourly_rate_windows: (venue.hourly_rate_windows ?? []).map((w) => ({
        start: w.start,
        end: w.end,
        rate: String(w.hourly_rate),
      })),
    });
    setVenueOpen(true);
  };

  const closureTimeSlots = useMemo(() => {
    const open = venue?.opens_at ?? "07:00";
    const close = venue?.closes_at ?? "22:00";
    const oh = Number.parseInt(open.split(":")[0] ?? "7", 10);
    const ch = Number.parseInt(close.split(":")[0] ?? "22", 10);
    const start = Number.isFinite(oh) ? oh : 7;
    const end = Number.isFinite(ch) ? ch : 22;
    const out: string[] = [];
    for (let h = start; h < end; h++) {
      out.push(`${String(h).padStart(2, "0")}:00`);
    }
    return out;
  }, [venue?.opens_at, venue?.closes_at]);

  const toggleAmenity = (amenity: string) => {
    setVenueForm((prev) => ({
      ...prev,
      amenities: prev.amenities.includes(amenity)
        ? prev.amenities.filter((a) => a !== amenity)
        : [...prev.amenities, amenity],
    }));
  };

  const addCustomAmenity = () => {
    const next = venueForm.customAmenityDraft.trim();
    if (!next) return;
    const exists = venueForm.amenities.some((a) => normAmenity(a) === normAmenity(next));
    if (!exists) {
      setVenueForm((prev) => ({
        ...prev,
        amenities: [...prev.amenities, next],
        customAmenityDraft: "",
      }));
      return;
    }
    setVenueForm((prev) => ({ ...prev, customAmenityDraft: "" }));
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 md:px-10">
      <ConfirmDialog
        open={!!confirmDeleteCourtId}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteCourtId(null);
        }}
        title="Delete court?"
        description="This court will be removed from the venue."
        confirmLabel="Delete court"
        isPending={deleteCourt.isPending}
        onConfirm={() => {
          if (!confirmDeleteCourtId) return;
          deleteCourt.mutate(confirmDeleteCourtId);
          setConfirmDeleteCourtId(null);
        }}
      />
      <Button variant="ghost" className="mb-4 -ml-2" asChild>
        <Link href="/admin/venues">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to venues
        </Link>
      </Button>

      <PageHeader
        title={venueName}
        subtitle="Manage courts for this venue"
      >
        <Button variant="outline" onClick={() => setClosureOpen(true)}>
          Set unavailability
        </Button>
        <Button variant="outline" onClick={openVenueEdit}>
          Edit venue
        </Button>
        <Button className="font-heading font-semibold" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> Add Court
        </Button>
      </PageHeader>

      {venue ? (
        <Card className="mb-6 border-border/50">
          <CardContent className="grid gap-3 p-5 text-sm sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground">Location</p>
              <p className="font-medium text-foreground">{venue.location}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Contact</p>
              <p className="font-medium text-foreground">{venue.contact_phone || "-"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Sport</p>
              <p className="font-medium text-foreground">{formatStatusLabel(venue.sport)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Hourly rate</p>
              <p className="font-medium text-foreground">PHP {venue.hourly_rate}/hr</p>
            </div>
            <div>
              <p className="text-muted-foreground">Open hours</p>
              <p className="font-medium text-foreground">
                {venue.opens_at} - {venue.closes_at}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Status</p>
              <p className="font-medium text-foreground">
                {venue.status === "active" ? "Active" : "Inactive"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Amenities</p>
              {venue.amenities.length ? (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {venue.amenities.map((a) => (
                    <Badge key={a} variant="outline" className="font-normal">
                      {formatAmenityLabel(a)}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="font-medium text-foreground">-</p>
              )}
            </div>
            <div className="sm:col-span-2">
              <p className="text-muted-foreground">Rates by time range</p>
              {(venue.hourly_rate_windows?.length ?? 0) > 0 ? (
                <ul className="mt-1 space-y-1 text-foreground">
                  {venue.hourly_rate_windows!.map((w) => (
                    <li key={`${w.start}-${w.end}-${w.hourly_rate}`}>
                      {w.start} - {w.end}: PHP {w.hourly_rate}/hr
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="font-medium text-foreground">None</p>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {isLoading ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {venueCourts.map((court) => (
            <Card
              key={court.id}
              className="cursor-pointer overflow-hidden border-border/50 transition-shadow hover:shadow-md"
              onClick={() => openEdit(court)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openEdit(court);
                }
              }}
            >
              <CardContent className="p-5">
                <div className="mb-2 flex items-start justify-between">
                  <h3 className="font-heading font-bold text-foreground">
                    {court.name}
                  </h3>
                </div>
                <div className="shrink-0 text-xs text-muted-foreground">Click to edit</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {editing ? "Edit Court" : "Add New Court"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Court name *</Label>
                <Input
                  className="mt-1.5"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
            </div>
            {editing ? (
              <Button
                className="w-full border-destructive/20 text-destructive hover:bg-destructive/5 hover:text-destructive"
                type="button"
                variant="outline"
                onClick={() => setConfirmDeleteCourtId(editing.id)}
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                Delete Court
              </Button>
            ) : null}
            <Button
              className="w-full font-heading font-semibold"
              type="button"
              onClick={() => {
                if (!form.name.trim()) {
                  toast.error("Court name is required.");
                  return;
                }
                upsert.mutate();
              }}
              disabled={upsert.isPending}
            >
              {upsert.isPending
                ? "Saving..."
                : editing
                  ? "Save Changes"
                  : "Create Court"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={venueOpen} onOpenChange={setVenueOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">Edit venue</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Venue name *</Label>
              <Input
                className="mt-1.5"
                value={venueForm.name}
                onChange={(e) => setVenueForm({ ...venueForm, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Location *</Label>
              <Input
                className="mt-1.5"
                value={venueForm.location}
                onChange={(e) => setVenueForm({ ...venueForm, location: e.target.value })}
              />
            </div>
            <div>
              <Label>Contact number *</Label>
              <Input
                className="mt-1.5"
                value={venueForm.contact_phone}
                onChange={(e) => setVenueForm({ ...venueForm, contact_phone: e.target.value })}
                placeholder="+63 9XX XXX XXXX or landline"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Sport</Label>
                <Select value="pickleball" disabled>
                  <SelectTrigger className="mt-1.5 bg-muted/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pickleball">Pickleball</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Hourly rate *</Label>
                <Input
                  className="mt-1.5"
                  type="number"
                  value={venueForm.hourly_rate}
                  onChange={(e) => setVenueForm({ ...venueForm, hourly_rate: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Opens *</Label>
                <Input
                  className="mt-1.5"
                  value={venueForm.opens_at}
                  onChange={(e) => setVenueForm({ ...venueForm, opens_at: e.target.value })}
                />
              </div>
              <div>
                <Label>Closes *</Label>
                <Input
                  className="mt-1.5"
                  value={venueForm.closes_at}
                  onChange={(e) => setVenueForm({ ...venueForm, closes_at: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label>Availability</Label>
              <Select
                value={venueForm.status}
                onValueChange={(v) => setVenueForm({ ...venueForm, status: v as Venue["status"] })}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="closed">Inactive</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                Inactive venues are unavailable for user bookings.
              </p>
            </div>
            <div>
              <Label className="mb-2 block">Amenities</Label>
              <div className="mb-3 flex flex-wrap gap-2">
                {amenityOptions.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => toggleAmenity(a)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                      venueForm.amenities.includes(a)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    {formatAmenityLabel(a)}
                  </button>
                ))}
              </div>
              {venueForm.amenities.filter((a) => !amenityOptions.includes(a)).length > 0 ? (
                <div className="mb-3 flex flex-wrap gap-2">
                  {venueForm.amenities
                    .filter((a) => !amenityOptions.includes(a))
                    .map((a) => (
                      <Badge
                        key={a}
                        variant="outline"
                        className="cursor-pointer"
                        onClick={() =>
                          setVenueForm((prev) => ({
                            ...prev,
                            amenities: prev.amenities.filter((x) => x !== a),
                          }))
                        }
                      >
                        {formatAmenityLabel(a)} x
                      </Badge>
                    ))}
                </div>
              ) : null}
              <div className="flex gap-2">
                <Input
                  value={venueForm.customAmenityDraft}
                  onChange={(e) =>
                    setVenueForm({ ...venueForm, customAmenityDraft: e.target.value })
                  }
                  placeholder="Add custom amenity"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomAmenity();
                    }
                  }}
                />
                <Button type="button" variant="secondary" onClick={addCustomAmenity}>
                  Add
                </Button>
              </div>
            </div>
            <div className="space-y-2 rounded-lg border border-border/60 p-3">
              <div className="flex items-center justify-between">
                <Label>Rates by time range</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setVenueForm((prev) => ({
                      ...prev,
                      hourly_rate_windows: [
                        ...prev.hourly_rate_windows,
                        { start: "17:00", end: "22:00", rate: "" },
                      ],
                    }))
                  }
                >
                  Add range
                </Button>
              </div>
              {venueForm.hourly_rate_windows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No extra time ranges configured.
                </p>
              ) : (
                <div className="space-y-2">
                  {venueForm.hourly_rate_windows.map((row, i) => (
                    <div key={i} className="grid grid-cols-4 gap-2">
                      <Input
                        value={row.start}
                        onChange={(e) =>
                          setVenueForm((prev) => {
                            const next = [...prev.hourly_rate_windows];
                            next[i] = { ...next[i]!, start: e.target.value };
                            return { ...prev, hourly_rate_windows: next };
                          })
                        }
                        placeholder="Start"
                      />
                      <Input
                        value={row.end}
                        onChange={(e) =>
                          setVenueForm((prev) => {
                            const next = [...prev.hourly_rate_windows];
                            next[i] = { ...next[i]!, end: e.target.value };
                            return { ...prev, hourly_rate_windows: next };
                          })
                        }
                        placeholder="End"
                      />
                      <Input
                        type="number"
                        value={row.rate}
                        onChange={(e) =>
                          setVenueForm((prev) => {
                            const next = [...prev.hourly_rate_windows];
                            next[i] = { ...next[i]!, rate: e.target.value };
                            return { ...prev, hourly_rate_windows: next };
                          })
                        }
                        placeholder="Rate"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() =>
                          setVenueForm((prev) => ({
                            ...prev,
                            hourly_rate_windows: prev.hourly_rate_windows.filter(
                              (_, idx) => idx !== i,
                            ),
                          }))
                        }
                      >
                        Remove
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Label>Image URL *</Label>
              <Input
                className="mt-1.5"
                value={venueForm.image_url}
                onChange={(e) => setVenueForm({ ...venueForm, image_url: e.target.value })}
              />
            </div>
            <Button
              className="w-full font-heading font-semibold"
              type="button"
              onClick={() => saveVenue.mutate()}
              disabled={saveVenue.isPending}
            >
              {saveVenue.isPending ? "Saving..." : "Save Venue"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={closureOpen} onOpenChange={setClosureOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">
              Set court/s unavailability
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Date *</Label>
              <Popover open={closureDateOpen} onOpenChange={setClosureDateOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "mt-1.5 h-11 w-full justify-start gap-2.5 rounded-xl border-border/80 bg-background px-3 text-left text-sm font-normal shadow-sm transition-[box-shadow,background-color] hover:bg-muted/50 hover:shadow-md",
                      !closureForm.date && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                    <span className="truncate">
                      {closureForm.date
                        ? format(new Date(`${closureForm.date}T12:00:00`), "MMMM d, yyyy")
                        : "Select date"}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="z-120 w-auto overflow-hidden border-border/80 p-0 shadow-xl"
                  align="start"
                >
                  <Calendar
                    mode="single"
                    selected={new Date(`${closureForm.date}T12:00:00`)}
                    onSelect={(d) => {
                      if (!d) return;
                      setClosureForm((prev) => ({
                        ...prev,
                        date: format(d, "yyyy-MM-dd"),
                      }));
                      setClosureDateOpen(false);
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Label>Time slots *</Label>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    className="shrink-0"
                    disabled={closureTimeSlots.length === 0}
                    onClick={() => setSelectedClosureTimes([...closureTimeSlots])}
                  >
                    Select all hours
                  </Button>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Toggle one or more hours to mark unavailable (same as closing the whole venue for that day
                  when all courts and all hours are selected).
                </p>
                <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {closureTimeSlots.map((time) => {
                    const selected = selectedClosureTimes.includes(time);
                    return (
                      <Button
                        key={time}
                        type="button"
                        variant={selected ? "default" : "outline"}
                        size="sm"
                        onClick={() =>
                          setSelectedClosureTimes((prev) =>
                            prev.includes(time)
                              ? prev.filter((t) => t !== time)
                              : [...prev, time],
                          )
                        }
                      >
                        {time}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>
            <div>
              <Label>Reason *</Label>
              <Select
                value={closureForm.reason}
                onValueChange={(v) =>
                  setClosureForm((prev) => ({ ...prev, reason: v }))
                }
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner_use">Owner use</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="special_event">Special event</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Courts *</Label>
              <div className="mt-1.5 flex flex-wrap gap-2 rounded-md border border-border/60 p-3">
                {venueCourts.map((court) => {
                  const selected = selectedClosureCourtIds.includes(court.id);
                  return (
                    <Button
                      key={court.id}
                      type="button"
                      size="sm"
                      variant={selected ? "default" : "outline"}
                      onClick={() =>
                        setSelectedClosureCourtIds((prev) =>
                          prev.includes(court.id)
                            ? prev.filter((id) => id !== court.id)
                            : [...prev, court.id],
                        )
                      }
                    >
                      {court.name}
                    </Button>
                  );
                })}
              </div>
            </div>
            <div>
              <Label>Note (optional)</Label>
              <Textarea
                className="mt-1.5"
                value={closureForm.note}
                onChange={(e) =>
                  setClosureForm((prev) => ({ ...prev, note: e.target.value }))
                }
                placeholder="Internal note"
              />
            </div>
            <Button
              className="w-full font-heading font-semibold"
              type="button"
              onClick={() => applyClosure.mutate()}
              disabled={applyClosure.isPending}
            >
              {applyClosure.isPending ? "Applying..." : "Apply to selected courts"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

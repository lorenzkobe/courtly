"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import {
  CalendarOff,
  Clock,
  MapPin,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { VenueTimeInput } from "@/components/admin/VenueTimeInput";
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
import { courtlyApi } from "@/lib/api/courtly-client";
import { formatCourtRateSummary } from "@/lib/court-pricing";
import { formatAmenityLabel } from "@/lib/format-amenity";
import { useAuth } from "@/lib/auth/auth-context";
import { isSuperadmin } from "@/lib/auth/management";
import type { Court, CourtClosure } from "@/lib/types/courtly";
import { useAdminCustomAmenities } from "@/lib/stores/admin-custom-amenities";
import { formatStatusLabel } from "@/lib/utils";

type RateRow = { start: string; end: string; rate: string };

const defaultForm = {
  name: "",
  location: "",
  sport: "pickleball" as Court["sport"],
  type: "indoor" as Court["type"],
  surface: "sport_court" as Court["surface"],
  hourly_rate: "",
  hourly_rate_windows: [] as RateRow[],
  image_url: "",
  status: "active" as Court["status"],
  available_hours: { open: "07:00", close: "22:00" },
  amenities: [] as string[],
  customAmenityDraft: "",
  court_account_id: "" as string,
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

function isPresetAmenity(raw: string) {
  return amenityOptions.includes(raw);
}

function normAmenity(s: string) {
  return s.trim().toLowerCase();
}

const TIME_HH_MM = /^\d{2}:\d{2}$/;

function validateCourtForm(
  form: typeof defaultForm,
  opts: { globalAdmin: boolean; courtAccountCount: number },
): string | null {
  if (!form.name.trim()) return "Enter a court name.";
  if (!form.location.trim()) return "Enter a location.";

  if (
    opts.globalAdmin &&
    opts.courtAccountCount > 0 &&
    !form.court_account_id.trim()
  ) {
    return "Select a court account.";
  }

  const baseRate = Number.parseFloat(form.hourly_rate);
  if (
    !form.hourly_rate.trim() ||
    !Number.isFinite(baseRate) ||
    baseRate <= 0
  ) {
    return "Enter a default hourly rate greater than zero.";
  }

  for (let i = 0; i < form.hourly_rate_windows.length; i++) {
    const w = form.hourly_rate_windows[i]!;
    if (!w.start?.trim() || !TIME_HH_MM.test(w.start)) {
      return `Time range ${i + 1}: enter a valid start time.`;
    }
    if (!w.end?.trim() || !TIME_HH_MM.test(w.end)) {
      return `Time range ${i + 1}: enter a valid end time.`;
    }
    const wr = Number.parseFloat(w.rate);
    if (!w.rate.trim() || !Number.isFinite(wr) || wr <= 0) {
      return `Time range ${i + 1}: enter a rate greater than zero.`;
    }
  }

  const { open, close } = form.available_hours;
  if (!open?.trim() || !TIME_HH_MM.test(open)) {
    return "Enter when the venue opens.";
  }
  if (!close?.trim() || !TIME_HH_MM.test(close)) {
    return "Enter when the venue closes.";
  }
  if (open === close) {
    return "Opening and closing times must be different.";
  }

  if (!form.image_url.trim()) return "Enter an image URL.";
  try {
    const u = new URL(form.image_url.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return "Image URL must start with http:// or https://.";
    }
  } catch {
    return "Enter a valid image URL.";
  }

  if (form.amenities.length === 0) {
    return "Select at least one amenity.";
  }

  if (form.customAmenityDraft.trim()) {
    return "Add the custom amenity or clear that field before saving.";
  }

  return null;
}

function submitCourtForm(
  form: typeof defaultForm,
  opts: { globalAdmin: boolean; courtAccountCount: number },
  mutate: () => void,
) {
  const err = validateCourtForm(form, opts);
  if (err) {
    toast.error(err);
    return;
  }
  mutate();
}

/** Stable fallback for Zustand selectors — inline `[]` breaks useSyncExternalStore (infinite loop). */
const EMPTY_SAVED_AMENITIES: string[] = [];

export default function AdminCourtsPage() {
  const { user } = useAuth();
  const globalAdmin = isSuperadmin(user);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Court | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [blackoutsCourt, setBlackoutsCourt] = useState<Court | null>(null);
  const defaultClosureForm = (): Pick<
    CourtClosure,
    "date" | "start_time" | "end_time" | "reason" | "note"
  > => ({
    date: format(addDays(new Date(), 1), "yyyy-MM-dd"),
    start_time: "09:00",
    end_time: "10:00",
    reason: "maintenance",
    note: "",
  });
  const [closureForm, setClosureForm] = useState(defaultClosureForm);
  const [editingClosureId, setEditingClosureId] = useState<string | null>(null);

  const accountEmail = user?.email ?? "";
  const savedCustomAmenities = useAdminCustomAmenities((s) =>
    accountEmail
      ? (s.byEmail[accountEmail] ?? EMPTY_SAVED_AMENITIES)
      : EMPTY_SAVED_AMENITIES,
  );
  const customAmenityPills = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of savedCustomAmenities) {
      map.set(normAmenity(s), s);
    }
    for (const a of form.amenities) {
      if (isPresetAmenity(a)) continue;
      const k = normAmenity(a);
      if (!map.has(k)) map.set(k, a);
    }
    return [...map.values()].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }, [savedCustomAmenities, form.amenities]);

  const { data: courts = [], isLoading } = useQuery({
    queryKey: ["admin-courts", globalAdmin ? "all" : "managed"],
    queryFn: async () => {
      const { data } = await courtlyApi.courts.list({ manageable: true });
      return data;
    },
  });

  const { data: courtAccounts = [] } = useQuery({
    queryKey: ["court-accounts"],
    queryFn: async () => {
      const { data } = await courtlyApi.courtAccounts.list();
      return data;
    },
    enabled: globalAdmin,
  });

  const { data: closuresList = [] } = useQuery({
    queryKey: ["admin-court-closures", blackoutsCourt?.id],
    queryFn: async () => {
      const { data } = await courtlyApi.courtClosures.list(blackoutsCourt!.id);
      return data;
    },
    enabled: !!blackoutsCourt?.id,
  });

  const saveClosureMut = useMutation({
    mutationFn: async () => {
      if (!blackoutsCourt) return;
      const payload = {
        date: closureForm.date.trim(),
        start_time: closureForm.start_time.trim(),
        end_time: closureForm.end_time.trim(),
        reason: closureForm.reason.trim(),
        note: closureForm.note?.trim() || undefined,
      };
      if (editingClosureId) {
        await courtlyApi.courtClosures.update(
          blackoutsCourt.id,
          editingClosureId,
          payload,
        );
      } else {
        await courtlyApi.courtClosures.create(blackoutsCourt.id, payload);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["admin-court-closures", blackoutsCourt?.id],
      });
      void queryClient.invalidateQueries({ queryKey: ["court-closures"] });
      toast.success(editingClosureId ? "Block updated" : "Block added");
      setEditingClosureId(null);
      setClosureForm(defaultClosureForm());
    },
    onError: () => toast.error("Could not save this block"),
  });

  const deleteClosureMut = useMutation({
    mutationFn: async (closureId: string) => {
      if (!blackoutsCourt) return;
      await courtlyApi.courtClosures.remove(blackoutsCourt.id, closureId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["admin-court-closures", blackoutsCourt?.id],
      });
      void queryClient.invalidateQueries({ queryKey: ["court-closures"] });
      toast.success("Block removed");
      setEditingClosureId(null);
      setClosureForm(defaultClosureForm());
    },
  });

  const buildPayload = () => {
    const hourly_rate_windows = form.hourly_rate_windows
      .filter((w) => w.start && w.end && w.rate.trim())
      .map((w) => ({
        start: w.start,
        end: w.end,
        hourly_rate: Number.parseFloat(w.rate) || 0,
      }));
    const base = {
      name: form.name,
      location: form.location,
      sport: "pickleball" as Court["sport"],
      type: form.type,
      surface: form.surface,
      hourly_rate: Number.parseFloat(form.hourly_rate) || 0,
      hourly_rate_windows,
      image_url: form.image_url,
      status: form.status,
      available_hours: form.available_hours,
      amenities: form.amenities,
    };
    if (globalAdmin) {
      return {
        ...base,
        court_account_id: form.court_account_id.trim()
          ? form.court_account_id.trim()
          : null,
      };
    }
    return base;
  };

  const upsert = useMutation({
    mutationFn: async () => {
      const payload = buildPayload();
      if (editing) {
        await courtlyApi.courts.update(editing.id, payload);
      } else {
        await courtlyApi.courts.create(payload);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-courts"] });
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

  const deleteCourt = useMutation({
    mutationFn: async (id: string) => {
      await courtlyApi.courts.remove(id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-courts"] });
      void queryClient.invalidateQueries({ queryKey: ["courts"] });
      toast.success("Court deleted");
    },
  });

  const openEdit = (court: Court) => {
    setEditing(court);
    if (accountEmail) {
      useAdminCustomAmenities
        .getState()
        .mergeCourtAmenitiesForEmail(
          accountEmail,
          court.amenities ?? [],
          isPresetAmenity,
        );
    }
    setForm({
      name: court.name || "",
      location: court.location || "",
      sport: "pickleball",
      type: court.type || "indoor",
      surface: court.surface || "sport_court",
      hourly_rate: String(court.hourly_rate ?? ""),
      hourly_rate_windows: (court.hourly_rate_windows ?? []).map((w) => ({
        start: w.start,
        end: w.end,
        rate: String(w.hourly_rate),
      })),
      image_url: court.image_url || "",
      status: court.status || "active",
      available_hours: court.available_hours || { open: "07:00", close: "22:00" },
      amenities: [...(court.amenities || [])],
      customAmenityDraft: "",
      court_account_id: court.court_account_id ?? "",
    });
    setOpen(true);
  };

  const openCreate = () => {
    setEditing(null);
    setForm(defaultForm);
    setOpen(true);
  };

  const toggleAmenity = (a: string) => {
    setForm((f) => ({
      ...f,
      amenities: f.amenities.includes(a)
        ? f.amenities.filter((x) => x !== a)
        : [...f.amenities, a],
    }));
  };

  const toggleCustomAmenityOnCourt = (canonical: string) => {
    const k = normAmenity(canonical);
    setForm((f) => {
      const has = f.amenities.some((a) => normAmenity(a) === k);
      if (has) {
        return {
          ...f,
          amenities: f.amenities.filter((a) => normAmenity(a) !== k),
        };
      }
      return {
        ...f,
        amenities: [...f.amenities, canonical],
      };
    });
  };

  const removeCustomFromAccountAndCourt = (canonical: string) => {
    if (accountEmail) {
      useAdminCustomAmenities.getState().removeSavedForEmail(accountEmail, canonical);
    }
    const k = normAmenity(canonical);
    setForm((f) => ({
      ...f,
      amenities: f.amenities.filter((a) => normAmenity(a) !== k),
    }));
  };

  const addCustomAmenity = () => {
    const t = form.customAmenityDraft.trim();
    if (!t) return;
    if (!accountEmail) {
      toast.error("Sign in to save custom amenities to your account.");
      return;
    }
    if (amenityOptions.some((p) => normAmenity(p) === normAmenity(t))) {
      toast.info("That matches a preset — use the preset button above.");
      return;
    }
    useAdminCustomAmenities.getState().addUniqueForEmail(accountEmail, t);
    const saved = useAdminCustomAmenities
      .getState()
      .getSavedForEmail(accountEmail);
    const canonical =
      saved.find((s) => normAmenity(s) === normAmenity(t)) ?? t;
    setForm((f) => {
      if (f.amenities.some((a) => normAmenity(a) === normAmenity(t))) {
        return { ...f, customAmenityDraft: "" };
      }
      return {
        ...f,
        amenities: [...f.amenities, canonical],
        customAmenityDraft: "",
      };
    });
  };

  const statusColors: Record<string, string> = {
    active: "bg-primary/10 text-primary",
    maintenance: "bg-chart-3/15 text-chart-3",
    closed: "bg-destructive/10 text-destructive",
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 md:px-10">
      <PageHeader
        title={globalAdmin ? "Manage courts" : "My courts"}
        subtitle={
          globalAdmin
            ? "Add, edit, or assign courts across the platform"
            : "Courts assigned to your account and their availability"
        }
      >
        <Button className="font-heading font-semibold" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> Add Court
        </Button>
      </PageHeader>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {courts.map((court) => (
            <Card
              key={court.id}
              className="overflow-hidden border-border/50 transition-shadow hover:shadow-md"
            >
              {court.image_url ? (
                <div className="h-36 overflow-hidden">
                  <img
                    src={court.image_url}
                    alt={court.name}
                    className="h-full w-full object-cover"
                    onError={(e) => {
                      e.currentTarget.parentElement?.remove();
                    }}
                  />
                </div>
              ) : null}
              <CardContent className="p-5">
                <div className="mb-2 flex items-start justify-between">
                  <h3 className="font-heading font-bold text-foreground">
                    {court.name}
                  </h3>
                  <Badge
                    variant="outline"
                    className={statusColors[court.status] ?? ""}
                  >
                    {formatStatusLabel(court.status)}
                  </Badge>
                </div>
                <div className="mb-4 space-y-1 text-sm text-muted-foreground">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-3.5 w-3.5" /> {court.location}
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5" />{" "}
                    {court.available_hours?.open} – {court.available_hours?.close}
                  </div>
                  <div className="font-semibold text-foreground tabular-nums">
                    {formatCourtRateSummary(court)}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-w-0 flex-1"
                    onClick={() => openEdit(court)}
                  >
                    <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="min-w-0 flex-1"
                    onClick={() => {
                      setBlackoutsCourt(court);
                      setEditingClosureId(null);
                      setClosureForm(defaultClosureForm());
                    }}
                  >
                    <CalendarOff className="mr-1 h-3.5 w-3.5" /> Blackouts
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-destructive/20 text-destructive hover:bg-destructive/5 hover:text-destructive"
                    onClick={() => deleteCourt.mutate(court.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {editing ? "Edit Court" : "Add New Court"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Court Name *</Label>
                <Input
                  className="mt-1.5"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Court 1 - Main"
                />
              </div>
              <div className="col-span-2">
                <Label>Location *</Label>
                <Input
                  className="mt-1.5"
                  value={form.location}
                  onChange={(e) =>
                    setForm({ ...form, location: e.target.value })
                  }
                  placeholder="Address or venue name"
                />
              </div>
              {globalAdmin ? (
                <div className="col-span-2">
                  <Label>
                    Court account
                    {courtAccounts.length > 0 ? " *" : ""}
                  </Label>
                  <p className="mb-1.5 text-xs text-muted-foreground">
                    Links this court to a venue operator account for reporting and
                    payouts.
                  </p>
                  <Select
                    value={form.court_account_id || "__none__"}
                    onValueChange={(v) =>
                      setForm({
                        ...form,
                        court_account_id: v === "__none__" ? "" : v,
                      })
                    }
                  >
                    <SelectTrigger className="mt-0.5">
                      <SelectValue placeholder="Select account" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">None</SelectItem>
                      {courtAccounts.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
              <div className="col-span-2">
                <Label>Sport</Label>
                <p className="mb-1.5 text-xs text-muted-foreground">
                  Only pickleball is available when creating or editing courts
                  for now.
                </p>
                <Select value="pickleball" disabled>
                  <SelectTrigger className="mt-0.5 bg-muted/50">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pickleball">Pickleball</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <fieldset className="col-span-2 space-y-3 rounded-xl border border-border/60 bg-muted/10 p-4">
                <legend className="px-1 font-heading text-sm font-semibold text-foreground">
                  Court type
                </legend>
                <p className="text-xs text-muted-foreground">
                  Environment and playing surface for this court.
                </p>
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Environment *</Label>
                    <Select
                      value={form.type}
                      onValueChange={(v) =>
                        setForm({ ...form, type: v as Court["type"] })
                      }
                    >
                      <SelectTrigger className="mt-1.5">
                        <SelectValue placeholder="Indoor or outdoor" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="indoor">Indoor</SelectItem>
                        <SelectItem value="outdoor">Outdoor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Playing surface *</Label>
                    <Select
                      value={form.surface}
                      onValueChange={(v) =>
                        setForm({ ...form, surface: v as Court["surface"] })
                      }
                    >
                      <SelectTrigger className="mt-1.5">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="concrete">Concrete</SelectItem>
                        <SelectItem value="asphalt">Asphalt</SelectItem>
                        <SelectItem value="wood">Wood</SelectItem>
                        <SelectItem value="sport_court">Sport Court</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </fieldset>
              <div className="col-span-2">
                <Label>Default hourly rate (₱) *</Label>
                <p className="mb-1.5 text-xs text-muted-foreground">
                  Used outside any time ranges you add below.
                </p>
                <Input
                  type="number"
                  value={form.hourly_rate}
                  onChange={(e) =>
                    setForm({ ...form, hourly_rate: e.target.value })
                  }
                  placeholder="45"
                />
              </div>
              <div className="col-span-2 space-y-2 rounded-xl border border-border/60 bg-muted/20 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <Label className="text-foreground">Rates by time range</Label>
                    <p className="text-xs text-muted-foreground">
                      Whole hours from start up to end (e.g. evening premium).
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setForm((f) => ({
                        ...f,
                        hourly_rate_windows: [
                          ...f.hourly_rate_windows,
                          { start: "17:00", end: "22:00", rate: "" },
                        ],
                      }))
                    }
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" /> Add range
                  </Button>
                </div>
                {form.hourly_rate_windows.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No extra ranges — only the default rate applies.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {form.hourly_rate_windows.map((row, i) => (
                      <li
                        key={i}
                        className="space-y-3 rounded-lg border border-border/50 bg-card p-3"
                      >
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div>
                            <Label className="text-xs">From</Label>
                            <VenueTimeInput
                              className="mt-1"
                              value={row.start}
                              onChange={(v) =>
                                setForm((f) => {
                                  const next = [...f.hourly_rate_windows];
                                  next[i] = { ...next[i]!, start: v };
                                  return { ...f, hourly_rate_windows: next };
                                })
                              }
                            />
                          </div>
                          <div>
                            <Label className="text-xs">To</Label>
                            <VenueTimeInput
                              className="mt-1"
                              value={row.end}
                              onChange={(v) =>
                                setForm((f) => {
                                  const next = [...f.hourly_rate_windows];
                                  next[i] = { ...next[i]!, end: v };
                                  return { ...f, hourly_rate_windows: next };
                                })
                              }
                            />
                          </div>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:gap-3">
                          <div className="min-w-0 flex-1">
                            <Label className="text-xs">Rate (₱ / hour)</Label>
                            <Input
                              type="number"
                              className="mt-1 h-10 w-full min-w-0"
                              value={row.rate}
                              onChange={(e) =>
                                setForm((f) => {
                                  const next = [...f.hourly_rate_windows];
                                  next[i] = { ...next[i]!, rate: e.target.value };
                                  return { ...f, hourly_rate_windows: next };
                                })
                              }
                              placeholder="60"
                            />
                          </div>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-10 w-10 shrink-0 self-end text-destructive hover:bg-destructive/10 hover:text-destructive"
                            aria-label="Remove range"
                            onClick={() =>
                              setForm((f) => ({
                                ...f,
                                hourly_rate_windows: f.hourly_rate_windows.filter(
                                  (_, j) => j !== i,
                                ),
                              }))
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <Label>Status *</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) =>
                    setForm({ ...form, status: v as Court["status"] })
                  }
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="venue-open">Opens *</Label>
                  <VenueTimeInput
                    id="venue-open"
                    className="mt-1.5"
                    value={form.available_hours.open}
                    onChange={(v) =>
                      setForm({
                        ...form,
                        available_hours: { ...form.available_hours, open: v },
                      })
                    }
                  />
                </div>
                <div>
                  <Label htmlFor="venue-close">Closes *</Label>
                  <VenueTimeInput
                    id="venue-close"
                    className="mt-1.5"
                    value={form.available_hours.close}
                    onChange={(v) =>
                      setForm({
                        ...form,
                        available_hours: { ...form.available_hours, close: v },
                      })
                    }
                  />
                </div>
              </div>
              <div className="col-span-2">
                <Label>Image URL *</Label>
                <Input
                  className="mt-1.5"
                  value={form.image_url}
                  onChange={(e) =>
                    setForm({ ...form, image_url: e.target.value })
                  }
                  placeholder="https://..."
                />
              </div>
            </div>
            <div>
              <Label className="mb-2 block">Amenities *</Label>
              <p className="mb-2 text-xs text-muted-foreground">
                Tap presets to toggle. Custom labels are saved to your account for
                reuse; delete removes them from your list and this court.
              </p>
              <div className="mb-3 flex flex-wrap gap-2">
                {amenityOptions.map((a) => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => toggleAmenity(a)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                      form.amenities.includes(a)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    {formatAmenityLabel(a)}
                  </button>
                ))}
              </div>
              {customAmenityPills.length > 0 ? (
                <div className="mb-3 flex flex-wrap gap-2">
                  {customAmenityPills.map((canonical) => {
                    const selected = form.amenities.some(
                      (x) => normAmenity(x) === normAmenity(canonical),
                    );
                    return (
                      <div
                        key={normAmenity(canonical)}
                        className="inline-flex overflow-hidden rounded-lg border border-border bg-background text-xs font-medium shadow-sm"
                      >
                        <button
                          type="button"
                          onClick={() => toggleCustomAmenityOnCourt(canonical)}
                          className={`px-3 py-1.5 transition-colors ${
                            selected
                              ? "bg-primary text-primary-foreground"
                              : "text-muted-foreground hover:bg-muted/80"
                          }`}
                        >
                          {formatAmenityLabel(canonical)}
                        </button>
                        <button
                          type="button"
                          className="border-l border-border bg-muted/40 px-2 py-1.5 text-destructive hover:bg-destructive/10"
                          aria-label={`Remove ${canonical} from your saved amenities`}
                          onClick={() => removeCustomFromAccountAndCourt(canonical)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              ) : null}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  value={form.customAmenityDraft}
                  onChange={(e) =>
                    setForm({ ...form, customAmenityDraft: e.target.value })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomAmenity();
                    }
                  }}
                  placeholder="Add custom amenity (saved to your account)"
                  className="flex-1"
                />
                <Button type="button" variant="secondary" onClick={addCustomAmenity}>
                  Add
                </Button>
              </div>
            </div>
            <Button
              className="w-full font-heading font-semibold"
              type="button"
              onClick={() =>
                submitCourtForm(form, {
                  globalAdmin,
                  courtAccountCount: courtAccounts.length,
                }, () => upsert.mutate())
              }
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

      <Dialog
        open={!!blackoutsCourt}
        onOpenChange={(o) => {
          if (!o) {
            setBlackoutsCourt(null);
            setEditingClosureId(null);
            setClosureForm(defaultClosureForm());
          }
        }}
      >
        <DialogContent className="max-h-[min(90dvh,36rem)] max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">Court blackouts</DialogTitle>
            <DialogDescription>
              Block specific dates and hours for maintenance, events, or other
              closures. Players cannot book those hours.
            </DialogDescription>
          </DialogHeader>
          {blackoutsCourt ? (
            <div className="space-y-4">
              <p className="text-sm font-medium text-foreground">
                {blackoutsCourt.name}
              </p>
              <div className="max-h-40 space-y-2 overflow-y-auto rounded-lg border border-border/60 p-2">
                {closuresList.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No blocks yet.</p>
                ) : (
                  closuresList.map((c) => (
                    <div
                      key={c.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-2 text-xs"
                    >
                      <div className="min-w-0">
                        <span className="font-medium">{c.date}</span>{" "}
                        <span className="text-muted-foreground">
                          {c.start_time}–{c.end_time}
                        </span>
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          {formatStatusLabel(c.reason)}
                        </Badge>
                        {c.note ? (
                          <p className="mt-1 text-muted-foreground">{c.note}</p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingClosureId(c.id);
                            setClosureForm({
                              date: c.date,
                              start_time: c.start_time,
                              end_time: c.end_time,
                              reason: c.reason,
                              note: c.note ?? "",
                            });
                          }}
                        >
                          Edit
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          disabled={deleteClosureMut.isPending}
                          onClick={() => deleteClosureMut.mutate(c.id)}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="space-y-3 border-t border-border/60 pt-4">
                <h4 className="text-sm font-semibold text-foreground">
                  {editingClosureId ? "Edit block" : "Add block"}
                </h4>
                <div>
                  <Label>Date</Label>
                  <Input
                    type="date"
                    className="mt-1.5"
                    value={closureForm.date}
                    onChange={(e) =>
                      setClosureForm((f) => ({ ...f, date: e.target.value }))
                    }
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>From</Label>
                    <VenueTimeInput
                      className="mt-1.5"
                      value={closureForm.start_time}
                      onChange={(v) =>
                        setClosureForm((f) => ({ ...f, start_time: v }))
                      }
                    />
                  </div>
                  <div>
                    <Label>To</Label>
                    <VenueTimeInput
                      className="mt-1.5"
                      value={closureForm.end_time}
                      onChange={(v) =>
                        setClosureForm((f) => ({ ...f, end_time: v }))
                      }
                    />
                  </div>
                </div>
                <div>
                  <Label>Reason</Label>
                  <Select
                    value={closureForm.reason}
                    onValueChange={(v) =>
                      setClosureForm((f) => ({ ...f, reason: v }))
                    }
                  >
                    <SelectTrigger className="mt-1.5">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="maintenance">Maintenance</SelectItem>
                      <SelectItem value="special_event">
                        Special / private event
                      </SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Note (optional)</Label>
                  <Input
                    className="mt-1.5"
                    value={closureForm.note ?? ""}
                    onChange={(e) =>
                      setClosureForm((f) => ({ ...f, note: e.target.value }))
                    }
                    placeholder="Internal note"
                  />
                </div>
                <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
                  {editingClosureId ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setEditingClosureId(null);
                        setClosureForm(defaultClosureForm());
                      }}
                    >
                      Cancel edit
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    className="font-heading font-semibold"
                    disabled={saveClosureMut.isPending}
                    onClick={() => {
                      if (!closureForm.date.trim() || !closureForm.reason.trim()) {
                        toast.error("Date and reason are required.");
                        return;
                      }
                      saveClosureMut.mutate();
                    }}
                  >
                    {saveClosureMut.isPending
                      ? "Saving…"
                      : editingClosureId
                        ? "Save block"
                        : "Add block"}
                  </Button>
                </DialogFooter>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

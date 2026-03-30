"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { Building2, Plus, Trash2 } from "lucide-react";
import { VenueMapPinPicker } from "@/components/admin/VenueMapPinPicker";
import { VenueTimeInput } from "@/components/admin/VenueTimeInput";
import Link from "next/link";
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
import { queryKeys } from "@/lib/query/query-keys";
import { formatAmenityLabel } from "@/lib/format-amenity";
import { validateSocialUrl } from "@/lib/social-url";
import type { ManagedUser, Venue } from "@/lib/types/courtly";
import { validatePriceRangeFormRows } from "@/lib/venue-price-ranges";
import { formatStatusLabel } from "@/lib/utils";

type PriceRangeRow = { start: string; end: string; rate: string };

const emptyForm = {
  name: "",
  location: "",
  contact_phone: "",
  facebook_url: "",
  instagram_url: "",
  sport: "pickleball" as Venue["sport"],
  amenities: [] as string[],
  customAmenityDraft: "",
  image_url: "",
  initial_admin_user_id: "" as string,
  hourly_rate_windows: [] as PriceRangeRow[],
  map_latitude: null as number | null,
  map_longitude: null as number | null,
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

function adminDirectoryLabel(u: ManagedUser) {
  const fromParts = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  const name = fromParts || u.full_name;
  return u.email ? `${name} (${u.email})` : name;
}

export default function SuperadminVenuesPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Venue | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [confirmRemoveVenueId, setConfirmRemoveVenueId] = useState<string | null>(null);

  const { data: directory, isLoading } = useQuery({
    queryKey: queryKeys.superadmin.directory(),
    queryFn: async () => {
      const { data } = await courtlyApi.superadmin.directory();
      return data;
    },
  });
  const venues = directory?.venues ?? [];
  const managedUsers = directory?.managed_users ?? [];

  const adminOptions = managedUsers.filter(
    (managedUser) => managedUser.role === "admin",
  );

  const priceRangeFormValidation = useMemo(
    () => validatePriceRangeFormRows(form.hourly_rate_windows),
    [form.hourly_rate_windows],
  );
  const facebookUrlError = useMemo(
    () => validateSocialUrl(form.facebook_url, "facebook"),
    [form.facebook_url],
  );
  const instagramUrlError = useMemo(
    () => validateSocialUrl(form.instagram_url, "instagram"),
    [form.instagram_url],
  );

  const saveAccount = useMutation({
    mutationFn: async () => {
      const parsed = validatePriceRangeFormRows(form.hourly_rate_windows);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      const hasMapPin =
        form.map_latitude != null &&
        form.map_longitude != null &&
        Number.isFinite(form.map_latitude) &&
        Number.isFinite(form.map_longitude);
      const mapBody = hasMapPin
        ? { map_latitude: form.map_latitude!, map_longitude: form.map_longitude! }
        : editing
          ? { map_latitude: null, map_longitude: null }
          : {};
      const body = {
        name: form.name.trim(),
        location: form.location.trim(),
        contact_phone: form.contact_phone.trim(),
        facebook_url: form.facebook_url.trim(),
        instagram_url: form.instagram_url.trim(),
        sport: form.sport,
        hourly_rate_windows: parsed.windows,
        amenities: [
          ...new Set(form.amenities.map((amenity) => amenity.trim()).filter(Boolean)),
        ],
        image_url: form.image_url.trim(),
        initial_admin_user_id: form.initial_admin_user_id.trim() || undefined,
        ...mapBody,
      };
      if (editing) {
        await courtlyApi.venues.update(editing.id, body);
      } else {
        await courtlyApi.venues.create(body);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.superadmin.directory() });
      toast.success(editing ? "Venue updated" : "Venue created");
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyForm);
    },
    onError: (e: unknown) => {
      toast.error(
        e instanceof Error && e.message ? e.message : "Could not save venue",
      );
    },
  });

  const removeAccount = useMutation({
    mutationFn: async (id: string) => {
      await courtlyApi.venues.remove(id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.superadmin.directory() });
      toast.success("Venue removed");
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyForm);
    },
    onError: (err: unknown) => {
      const msg = isAxiosError(err)
        ? (err.response?.data as { error?: string })?.error
        : undefined;
      toast.error(msg ?? "Could not remove account");
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...emptyForm,
      hourly_rate_windows: [{ start: "07:00", end: "22:00", rate: "" }],
    });
    setDialogOpen(true);
  };

  const openEdit = (a: Venue) => {
    const assignedAdminId =
      managedUsers.find(
        (u) =>
          u.role === "admin" &&
          ((u as ManagedUser & { venue_ids?: string[] }).venue_ids ?? []).includes(a.id),
      )?.id ?? "";
    setEditing(a);
    setForm({
      name: a.name,
      location: a.location,
      contact_phone: a.contact_phone ?? "",
      facebook_url: a.facebook_url ?? "",
      instagram_url: a.instagram_url ?? "",
      sport: a.sport,
      amenities: [...(a.amenities ?? [])],
      customAmenityDraft: "",
      image_url: a.image_url ?? "",
      initial_admin_user_id: assignedAdminId,
      map_latitude:
        a.map_latitude != null && Number.isFinite(a.map_latitude)
          ? a.map_latitude
          : null,
      map_longitude:
        a.map_longitude != null && Number.isFinite(a.map_longitude)
          ? a.map_longitude
          : null,
      hourly_rate_windows:
        (a.hourly_rate_windows ?? []).length > 0
          ? (a.hourly_rate_windows ?? []).map((w) => ({
              start: w.start,
              end: w.end,
              rate: String(w.hourly_rate),
            }))
          : [{ start: "07:00", end: "22:00", rate: "" }],
    });
    setDialogOpen(true);
  };

  const statusVariant =
    (s: Venue["status"]) =>
      s === "active"
        ? "bg-primary/10 text-primary"
        : "bg-destructive/10 text-destructive";

  const toggleAmenity = (amenity: string) => {
    setForm((prev) => ({
      ...prev,
      amenities: prev.amenities.includes(amenity)
        ? prev.amenities.filter((item) => item !== amenity)
        : [...prev.amenities, amenity],
    }));
  };

  const addCustomAmenity = () => {
    const next = form.customAmenityDraft.trim();
    if (!next) return;
    const exists = form.amenities.some(
      (item) => normAmenity(item) === normAmenity(next),
    );
    if (!exists) {
      setForm((prev) => ({
        ...prev,
        amenities: [...prev.amenities, next],
        customAmenityDraft: "",
      }));
      return;
    }
    setForm((prev) => ({ ...prev, customAmenityDraft: "" }));
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 md:px-10">
      <ConfirmDialog
        open={!!confirmRemoveVenueId}
        onOpenChange={(open) => {
          if (!open) setConfirmRemoveVenueId(null);
        }}
        title="Delete venue?"
        description="This removes the venue and related assignments."
        confirmLabel="Delete venue"
        isPending={removeAccount.isPending}
        onConfirm={() => {
          if (!confirmRemoveVenueId) return;
          removeAccount.mutate(confirmRemoveVenueId);
          setConfirmRemoveVenueId(null);
        }}
      />
      <PageHeader
        title="Venues"
        subtitle="Manage venues. A venue can have multiple admins and multiple courts."
      >
        <Button className="font-heading font-semibold" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> New venue
        </Button>
      </PageHeader>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : venues.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <Building2 className="h-10 w-10 text-muted-foreground" />
            <p className="max-w-md text-sm text-muted-foreground">
              No venues yet. Create one and assign an admin owner.
            </p>
            <Button onClick={openCreate}>Create venue</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {venues.map((venue) => (
            <Card
              key={venue.id}
              className="cursor-pointer border-border/60 transition-shadow hover:shadow-sm"
              onClick={() => openEdit(venue)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openEdit(venue);
                }
              }}
            >
              <CardContent className="flex min-h-24 items-center justify-between gap-3 p-5">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-heading font-bold text-foreground">
                      {venue.name}
                    </h3>
                    <Badge
                      variant="outline"
                      className={statusVariant(venue.status)}
                    >
                      {formatStatusLabel(venue.status)}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{venue.location}</p>
                </div>
                <div className="shrink-0 text-xs text-muted-foreground">Click to edit</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {editing ? "Edit venue" : "New venue"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Venue name *</Label>
              <Input
                className="mt-1.5"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. BGC Makati Sports Center"
              />
            </div>
            <div>
              <Label>Location *</Label>
              <Input
                className="mt-1.5"
                value={form.location}
                onChange={(e) =>
                  setForm({ ...form, location: e.target.value })
                }
              />
            </div>
            <div>
              <VenueMapPinPicker
                key={editing?.id ?? "new-venue"}
                showPlaceSearch={!editing}
                value={
                  form.map_latitude != null &&
                  form.map_longitude != null &&
                  Number.isFinite(form.map_latitude) &&
                  Number.isFinite(form.map_longitude)
                    ? { lat: form.map_latitude, lng: form.map_longitude }
                    : null
                }
                onChange={(next) =>
                  setForm((prev) => ({
                    ...prev,
                    map_latitude: next?.lat ?? null,
                    map_longitude: next?.lng ?? null,
                  }))
                }
              />
            </div>
            <div>
              <Label>Contact number *</Label>
              <Input
                className="mt-1.5"
                value={form.contact_phone}
                onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                placeholder="+63 9XX XXX XXXX or landline"
              />
            </div>
            <div>
              <Label>Facebook page link</Label>
              <Input
                className="mt-1.5"
                value={form.facebook_url}
                onChange={(e) => setForm({ ...form, facebook_url: e.target.value })}
                placeholder="https://facebook.com/your-page"
              />
              {facebookUrlError ? (
                <p className="mt-1 text-xs text-destructive">{facebookUrlError}</p>
              ) : null}
            </div>
            <div>
              <Label>Instagram page link</Label>
              <Input
                className="mt-1.5"
                value={form.instagram_url}
                onChange={(e) => setForm({ ...form, instagram_url: e.target.value })}
                placeholder="https://instagram.com/your-page"
              />
              {instagramUrlError ? (
                <p className="mt-1 text-xs text-destructive">{instagramUrlError}</p>
              ) : null}
            </div>
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
            <div className="space-y-3 rounded-xl border border-border/60 bg-muted/10 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <Label>Price ranges *</Label>
                  <p className="mt-1 max-w-prose text-xs text-muted-foreground">
                    Ranges must not overlap (each hour belongs to at most one range).
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 self-start"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      hourly_rate_windows: [
                        ...prev.hourly_rate_windows,
                        { start: "07:00", end: "22:00", rate: "" },
                      ],
                    }))
                  }
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add
                </Button>
              </div>
              {form.hourly_rate_windows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Add at least one time range and rate.
                </p>
              ) : (
                <div className="space-y-4">
                  {form.hourly_rate_windows.map((row, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-border/50 bg-background p-4 shadow-sm"
                    >
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-end">
                        <div className="min-w-0 space-y-1.5">
                          <Label
                            className="text-xs text-muted-foreground"
                            htmlFor={`superadmin-range-start-${i}`}
                          >
                            Start
                          </Label>
                          <VenueTimeInput
                            id={`superadmin-range-start-${i}`}
                            value={row.start}
                            onChange={(value) =>
                              setForm((prev) => {
                                const next = [...prev.hourly_rate_windows];
                                next[i] = { ...next[i]!, start: value };
                                return { ...prev, hourly_rate_windows: next };
                              })
                            }
                          />
                        </div>
                        <div className="min-w-0 space-y-1.5">
                          <Label
                            className="text-xs text-muted-foreground"
                            htmlFor={`superadmin-range-end-${i}`}
                          >
                            End
                          </Label>
                          <VenueTimeInput
                            id={`superadmin-range-end-${i}`}
                            value={row.end}
                            onChange={(value) =>
                              setForm((prev) => {
                                const next = [...prev.hourly_rate_windows];
                                next[i] = { ...next[i]!, end: value };
                                return { ...prev, hourly_rate_windows: next };
                              })
                            }
                          />
                        </div>
                        <div className="min-w-0 space-y-1.5 sm:col-span-2">
                          <Label
                            className="text-xs text-muted-foreground"
                            htmlFor={`superadmin-range-rate-${i}`}
                          >
                            Rate (PHP / hr)
                          </Label>
                          <Input
                            id={`superadmin-range-rate-${i}`}
                            type="number"
                            inputMode="decimal"
                            className="h-11 w-full"
                            value={row.rate}
                            onChange={(e) =>
                              setForm((prev) => {
                                const next = [...prev.hourly_rate_windows];
                                next[i] = { ...next[i]!, rate: e.target.value };
                                return { ...prev, hourly_rate_windows: next };
                              })
                            }
                            placeholder="e.g. 450"
                          />
                        </div>
                        <div className="flex justify-end sm:col-span-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            aria-label="Remove range"
                            onClick={() =>
                              setForm((prev) => ({
                                ...prev,
                                hourly_rate_windows: prev.hourly_rate_windows.filter(
                                  (_, idx) => idx !== i,
                                ),
                              }))
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Label className="mb-2 block">Amenities</Label>
              <div className="mb-3 flex flex-wrap gap-2">
                {amenityOptions.map((amenity) => (
                  <button
                    key={amenity}
                    type="button"
                    onClick={() => toggleAmenity(amenity)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                      form.amenities.includes(amenity)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    {formatAmenityLabel(amenity)}
                  </button>
                ))}
              </div>
              {form.amenities.filter((item) => !amenityOptions.includes(item)).length >
              0 ? (
                <div className="mb-3 flex flex-wrap gap-2">
                  {form.amenities
                    .filter((item) => !amenityOptions.includes(item))
                    .map((customAmenity) => (
                      <Badge
                        key={customAmenity}
                        variant="outline"
                        className="cursor-pointer"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            amenities: prev.amenities.filter(
                              (amenity) => amenity !== customAmenity,
                            ),
                          }))
                        }
                      >
                        {formatAmenityLabel(customAmenity)} x
                      </Badge>
                    ))}
                </div>
              ) : null}
              <div className="flex gap-2">
                <Input
                  value={form.customAmenityDraft}
                  onChange={(e) => setForm({ ...form, customAmenityDraft: e.target.value })}
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
            <div>
              <Label>Image URL *</Label>
              <Input
                className="mt-1.5"
                value={form.image_url}
                onChange={(e) => setForm({ ...form, image_url: e.target.value })}
              />
            </div>
            <div>
              <Label>Venue admin *</Label>
              <p className="mb-1.5 text-xs text-muted-foreground">
                {editing
                  ? "Optional on edit: change which court admin is linked to this venue, or clear the selection."
                  : "Choose an existing court admin. Create accounts (and invite them) from Users first."}
              </p>
              <Select
                value={form.initial_admin_user_id || "__none__"}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    initial_admin_user_id: v === "__none__" ? "" : v,
                  })
                }
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Select admin" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    {editing ? "No linked admin" : "Select admin"}
                  </SelectItem>
                  {adminOptions.map((adminUser) => (
                    <SelectItem key={adminUser.id} value={adminUser.id}>
                      {adminDirectoryLabel(adminUser)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {adminOptions.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  No court admins yet.{" "}
                  <Link
                    href="/superadmin/users"
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    Add a user
                  </Link>{" "}
                  with role Court admin first.
                </p>
              ) : null}
            </div>
          </div>
          {!priceRangeFormValidation.ok ? (
            <p
              className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100"
              role="alert"
            >
              {priceRangeFormValidation.error}
            </p>
          ) : null}
          <DialogFooter className="gap-2 sm:gap-0">
            {editing ? (
              <Button
                type="button"
                variant="outline"
                className="border-destructive/25 text-destructive hover:bg-destructive/5"
                onClick={() => setConfirmRemoveVenueId(editing.id)}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Delete
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="font-heading font-semibold"
              disabled={
                saveAccount.isPending ||
                !form.name.trim() ||
                !form.location.trim() ||
                !form.contact_phone.trim() ||
                !form.image_url.trim() ||
                !priceRangeFormValidation.ok ||
                Boolean(facebookUrlError) ||
                Boolean(instagramUrlError) ||
                (!editing && !form.initial_admin_user_id.trim())
              }
              onClick={() => saveAccount.mutate()}
            >
              {saveAccount.isPending ? "Saving…" : editing ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

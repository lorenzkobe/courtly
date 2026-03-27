"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { Building2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
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
import { formatAmenityLabel } from "@/lib/format-amenity";
import type { ManagedUser, Venue } from "@/lib/types/courtly";
import { formatStatusLabel } from "@/lib/utils";

const emptyForm = {
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
  initial_admin_mode: "existing" as "existing" | "new",
  initial_admin_user_id: "" as string,
  initial_admin_new_name: "",
  initial_admin_new_email: "",
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

export default function SuperadminVenuesPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Venue | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [confirmRemoveVenueId, setConfirmRemoveVenueId] = useState<string | null>(null);

  const { data: venues = [], isLoading } = useQuery({
    queryKey: ["venues"],
    queryFn: async () => {
      const { data } = await courtlyApi.venues.list();
      return data;
    },
  });

  const { data: managedUsers = [] } = useQuery({
    queryKey: ["managed-users"],
    queryFn: async () => {
      const { data } = await courtlyApi.managedUsers.list();
      return data;
    },
  });

  const adminOptions = managedUsers.filter((u) => u.role === "admin");

  const saveAccount = useMutation({
    mutationFn: async () => {
      const body = {
        name: form.name.trim(),
        location: form.location.trim(),
        contact_phone: form.contact_phone.trim(),
        sport: form.sport,
        hourly_rate: Number.parseFloat(form.hourly_rate) || 0,
        opens_at: form.opens_at,
        closes_at: form.closes_at,
        status: form.status,
        amenities: [...new Set(form.amenities.map((a) => a.trim()).filter(Boolean))],
        image_url: form.image_url.trim(),
        initial_admin_user_id:
          form.initial_admin_mode === "existing" && form.initial_admin_user_id.trim()
            ? form.initial_admin_user_id
            : undefined,
        initial_admin_new:
          form.initial_admin_mode === "new"
            ? {
                full_name: form.initial_admin_new_name.trim(),
                email: form.initial_admin_new_email.trim(),
              }
            : undefined,
      };
      if (editing) {
        await courtlyApi.venues.update(editing.id, body);
      } else {
        await courtlyApi.venues.create(body);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["venues"] });
      void queryClient.invalidateQueries({ queryKey: ["managed-users"] });
      toast.success(editing ? "Venue updated" : "Venue created");
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyForm);
    },
    onError: () => {
      toast.error("Could not save venue");
    },
  });

  const removeAccount = useMutation({
    mutationFn: async (id: string) => {
      await courtlyApi.venues.remove(id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["venues"] });
      void queryClient.invalidateQueries({ queryKey: ["managed-users"] });
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
    setForm(emptyForm);
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
      sport: a.sport,
      hourly_rate: String(a.hourly_rate),
      opens_at: a.opens_at,
      closes_at: a.closes_at,
      status: a.status,
      amenities: [...(a.amenities ?? [])],
      customAmenityDraft: "",
      image_url: a.image_url ?? "",
      initial_admin_mode: "existing",
      initial_admin_user_id: assignedAdminId,
      initial_admin_new_name: "",
      initial_admin_new_email: "",
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
        ? prev.amenities.filter((a) => a !== amenity)
        : [...prev.amenities, amenity],
    }));
  };

  const addCustomAmenity = () => {
    const next = form.customAmenityDraft.trim();
    if (!next) return;
    const exists = form.amenities.some((a) => normAmenity(a) === normAmenity(next));
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
          {venues.map((a) => (
            <Card
              key={a.id}
              className="cursor-pointer border-border/60 transition-shadow hover:shadow-sm"
              onClick={() => openEdit(a)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openEdit(a);
                }
              }}
            >
              <CardContent className="flex min-h-24 items-center justify-between gap-3 p-5">
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-heading font-bold text-foreground">
                      {a.name}
                    </h3>
                    <Badge
                      variant="outline"
                      className={statusVariant(a.status)}
                    >
                      {formatStatusLabel(a.status)}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground">{a.location}</p>
                </div>
                <div className="shrink-0 text-xs text-muted-foreground">Click to edit</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-md">
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
              <Label>Contact number *</Label>
              <Input
                className="mt-1.5"
                value={form.contact_phone}
                onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                placeholder="+63 9XX XXX XXXX or landline"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Hourly rate *</Label>
                <Input
                  className="mt-1.5"
                  type="number"
                  value={form.hourly_rate}
                  onChange={(e) => setForm({ ...form, hourly_rate: e.target.value })}
                />
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
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Opens *</Label>
                <Input
                  className="mt-1.5"
                  value={form.opens_at}
                  onChange={(e) => setForm({ ...form, opens_at: e.target.value })}
                  placeholder="07:00"
                />
              </div>
              <div>
                <Label>Closes *</Label>
                <Input
                  className="mt-1.5"
                  value={form.closes_at}
                  onChange={(e) => setForm({ ...form, closes_at: e.target.value })}
                  placeholder="22:00"
                />
              </div>
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    status: v as Venue["status"],
                  })
                }
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
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
                      form.amenities.includes(a)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    {formatAmenityLabel(a)}
                  </button>
                ))}
              </div>
              {form.amenities.filter((a) => !amenityOptions.includes(a)).length > 0 ? (
                <div className="mb-3 flex flex-wrap gap-2">
                  {form.amenities
                    .filter((a) => !amenityOptions.includes(a))
                    .map((a) => (
                      <Badge
                        key={a}
                        variant="outline"
                        className="cursor-pointer"
                        onClick={() =>
                          setForm((prev) => ({
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
              <Label>Initial venue admin *</Label>
              <p className="mb-1.5 text-xs text-muted-foreground">
                {editing
                  ? "Optional on edit. Link an existing admin or create a new admin user to add assignment."
                  : "Required on creation. You can link an existing admin or create a new admin user."}
              </p>
              <Select
                value={form.initial_admin_mode}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    initial_admin_mode: v as "existing" | "new",
                  })
                }
              >
                <SelectTrigger className="mt-0.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="existing">Link existing admin</SelectItem>
                  <SelectItem value="new">Create new admin</SelectItem>
                </SelectContent>
              </Select>

              {form.initial_admin_mode === "existing" ? (
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
                    <SelectItem value="__none__">Select admin</SelectItem>
                    {adminOptions.map((u) => (
                      <SelectItem key={u.id} value={u.id}>
                        {u.full_name} ({u.email})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <div className="mt-2 space-y-2">
                  <Input
                    value={form.initial_admin_new_name}
                    onChange={(e) =>
                      setForm({ ...form, initial_admin_new_name: e.target.value })
                    }
                    placeholder="New admin full name"
                  />
                  <Input
                    type="email"
                    value={form.initial_admin_new_email}
                    onChange={(e) =>
                      setForm({ ...form, initial_admin_new_email: e.target.value })
                    }
                    placeholder="new-admin@example.com"
                  />
                </div>
              )}
            </div>
          </div>
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
                !form.hourly_rate.trim() ||
                (!editing &&
                  form.initial_admin_mode === "existing" &&
                  !form.initial_admin_user_id.trim()) ||
                (!editing &&
                  form.initial_admin_mode === "new" &&
                  (!form.initial_admin_new_name.trim() ||
                    !form.initial_admin_new_email.trim()))
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

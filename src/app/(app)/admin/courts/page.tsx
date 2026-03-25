"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Clock,
  DollarSign,
  MapPin,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { useState } from "react";
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
import { courtlyApi } from "@/lib/api/courtly-client";
import { useAuth } from "@/lib/auth/auth-context";
import { isSuperadmin } from "@/lib/auth/management";
import type { Court } from "@/lib/types/courtly";

const defaultForm = {
  name: "",
  location: "",
  type: "indoor" as Court["type"],
  surface: "sport_court" as Court["surface"],
  hourly_rate: "",
  image_url: "",
  status: "active" as Court["status"],
  available_hours: { open: "07:00", close: "22:00" },
  amenities: [] as string[],
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

export default function AdminCourtsPage() {
  const { user } = useAuth();
  const globalAdmin = isSuperadmin(user);
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Court | null>(null);
  const [form, setForm] = useState(defaultForm);

  const { data: courts = [], isLoading } = useQuery({
    queryKey: ["admin-courts", globalAdmin ? "all" : "managed"],
    queryFn: async () => {
      const { data } = await courtlyApi.courts.list({ manageable: true });
      return data;
    },
  });

  const upsert = useMutation({
    mutationFn: async () => {
      const payload = {
        ...form,
        hourly_rate: Number.parseFloat(form.hourly_rate) || 0,
      };
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
    setForm({
      name: court.name || "",
      location: court.location || "",
      type: court.type || "indoor",
      surface: court.surface || "sport_court",
      hourly_rate: String(court.hourly_rate ?? ""),
      image_url: court.image_url || "",
      status: court.status || "active",
      available_hours: court.available_hours || { open: "07:00", close: "22:00" },
      amenities: court.amenities || [],
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
                    {court.status}
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
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-3.5 w-3.5" />{" "}
                    <span className="font-semibold text-foreground">
                      ${court.hourly_rate}/hr
                    </span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => openEdit(court)}
                  >
                    <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
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
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
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
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Court 1 - Main"
                />
              </div>
              <div className="col-span-2">
                <Label>Location *</Label>
                <Input
                  value={form.location}
                  onChange={(e) =>
                    setForm({ ...form, location: e.target.value })
                  }
                  placeholder="Address or venue name"
                />
              </div>
              <div>
                <Label>Type</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) =>
                    setForm({ ...form, type: v as Court["type"] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="indoor">Indoor</SelectItem>
                    <SelectItem value="outdoor">Outdoor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Surface</Label>
                <Select
                  value={form.surface}
                  onValueChange={(v) =>
                    setForm({ ...form, surface: v as Court["surface"] })
                  }
                >
                  <SelectTrigger>
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
              <div>
                <Label>Hourly Rate ($)</Label>
                <Input
                  type="number"
                  value={form.hourly_rate}
                  onChange={(e) =>
                    setForm({ ...form, hourly_rate: e.target.value })
                  }
                  placeholder="25"
                />
              </div>
              <div>
                <Label>Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(v) =>
                    setForm({ ...form, status: v as Court["status"] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="maintenance">Maintenance</SelectItem>
                    <SelectItem value="closed">Closed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Opens At</Label>
                <Input
                  type="time"
                  value={form.available_hours.open}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      available_hours: {
                        ...form.available_hours,
                        open: e.target.value,
                      },
                    })
                  }
                />
              </div>
              <div>
                <Label>Closes At</Label>
                <Input
                  type="time"
                  value={form.available_hours.close}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      available_hours: {
                        ...form.available_hours,
                        close: e.target.value,
                      },
                    })
                  }
                />
              </div>
              <div className="col-span-2">
                <Label>Image URL</Label>
                <Input
                  value={form.image_url}
                  onChange={(e) =>
                    setForm({ ...form, image_url: e.target.value })
                  }
                  placeholder="https://..."
                />
              </div>
            </div>
            <div>
              <Label className="mb-2 block">Amenities</Label>
              <div className="flex flex-wrap gap-2">
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
                    {a.replace("_", " ")}
                  </button>
                ))}
              </div>
            </div>
            <Button
              className="w-full font-heading font-semibold"
              onClick={() => upsert.mutate()}
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
    </div>
  );
}

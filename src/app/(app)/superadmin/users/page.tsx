"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { Plus, Trash2 } from "lucide-react";
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
import type { ManagedUser } from "@/lib/types/courtly";
import { formatStatusLabel } from "@/lib/utils";

const emptyForm = {
  email: "",
  full_name: "",
  role: "user" as ManagedUser["role"],
  is_active: true,
  venue_ids: [] as string[],
};

function roleBadgeClass(role: ManagedUser["role"]) {
  switch (role) {
    case "superadmin":
      return "bg-primary/15 text-primary";
    case "admin":
      return "bg-chart-2/15 text-chart-2";
    default:
      return "bg-muted text-muted-foreground";
  }
}

type UserSort =
  | "name_asc"
  | "name_desc"
  | "email_asc"
  | "email_desc"
  | "created_desc"
  | "created_asc";

export default function SuperadminUsersPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [confirmRemoveUserId, setConfirmRemoveUserId] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<"all" | ManagedUser["role"]>(
    "all",
  );
  const [sortBy, setSortBy] = useState<UserSort>("name_asc");

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["managed-users"],
    queryFn: async () => {
      const { data } = await courtlyApi.managedUsers.list();
      return data;
    },
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ["venues"],
    queryFn: async () => {
      const { data } = await courtlyApi.venues.list();
      return data;
    },
  });

  const visibleUsers = useMemo(() => {
    let list = [...users];
    if (roleFilter !== "all") {
      list = list.filter((u) => u.role === roleFilter);
    }
    list.sort((a, b) => {
      switch (sortBy) {
        case "name_desc":
          return b.full_name.localeCompare(a.full_name, undefined, {
            sensitivity: "base",
          });
        case "email_asc":
          return a.email.localeCompare(b.email, undefined, {
            sensitivity: "base",
          });
        case "email_desc":
          return b.email.localeCompare(a.email, undefined, {
            sensitivity: "base",
          });
        case "created_desc":
          return b.created_at.localeCompare(a.created_at);
        case "created_asc":
          return a.created_at.localeCompare(b.created_at);
        default:
          return a.full_name.localeCompare(b.full_name, undefined, {
            sensitivity: "base",
          });
      }
    });
    return list;
  }, [users, roleFilter, sortBy]);

  const saveUser = useMutation({
    mutationFn: async () => {
      const body = {
        email: form.email.trim().toLowerCase(),
        full_name: form.full_name.trim(),
        role: form.role,
        is_active: form.is_active,
        venue_ids: form.role === "admin" ? form.venue_ids : [],
      };
      if (editing) {
        await courtlyApi.managedUsers.update(editing.id, body);
      } else {
        await courtlyApi.managedUsers.create(body);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["managed-users"] });
      toast.success(editing ? "User updated" : "User created");
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyForm);
    },
    onError: (err: unknown) => {
      const msg = isAxiosError(err)
        ? (err.response?.data as { error?: string })?.error
        : undefined;
      toast.error(msg ?? "Could not save user");
    },
  });

  const removeUser = useMutation({
    mutationFn: async (id: string) => {
      await courtlyApi.managedUsers.remove(id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["managed-users"] });
      toast.success("User removed");
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyForm);
    },
    onError: (err: unknown) => {
      const msg = isAxiosError(err)
        ? (err.response?.data as { error?: string })?.error
        : undefined;
      toast.error(msg ?? "Could not remove user");
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (u: ManagedUser) => {
    setEditing(u);
    setForm({
      email: u.email,
      full_name: u.full_name,
      role: u.role,
      is_active: u.is_active !== false,
      venue_ids: ((u as ManagedUser & { venue_ids?: string[] }).venue_ids ?? []).filter(
        Boolean,
      ),
    });
    setDialogOpen(true);
  };

  const venueLabels = (ids: string[]) => {
    if (!ids.length) return "—";
    return ids
      .map((id) => accounts.find((a) => a.id === id)?.name ?? id)
      .join(", ");
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 md:px-10">
      <ConfirmDialog
        open={!!confirmRemoveUserId}
        onOpenChange={(open) => {
          if (!open) setConfirmRemoveUserId(null);
        }}
        title="Delete user?"
        description="This user account will be removed."
        confirmLabel="Delete user"
        isPending={removeUser.isPending}
        onConfirm={() => {
          if (!confirmRemoveUserId) return;
          removeUser.mutate(confirmRemoveUserId);
          setConfirmRemoveUserId(null);
        }}
      />
      <PageHeader
        title="Users"
        subtitle="Directory of players, admins, and platform staff. Admins can be assigned to multiple venues."
      >
        <Button className="font-heading font-semibold" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> Add user
        </Button>
      </PageHeader>

      {!isLoading && users.length > 0 ? (
        <div className="mb-6 flex flex-col gap-4 rounded-xl border border-border/60 bg-muted/10 p-4 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="min-w-40 flex-1">
            <Label className="text-xs text-muted-foreground">Account type</Label>
            <Select
              value={roleFilter}
              onValueChange={(v) =>
                setRoleFilter(v as "all" | ManagedUser["role"])
              }
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                <SelectItem value="user">Player</SelectItem>
                <SelectItem value="admin">Court admin</SelectItem>
                <SelectItem value="superadmin">Superadmin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-48 flex-1">
            <Label className="text-xs text-muted-foreground">Sort by</Label>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as UserSort)}>
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name_asc">Name (A–Z)</SelectItem>
                <SelectItem value="name_desc">Name (Z–A)</SelectItem>
                <SelectItem value="email_asc">Email (A–Z)</SelectItem>
                <SelectItem value="email_desc">Email (Z–A)</SelectItem>
                <SelectItem value="created_desc">Newest first</SelectItem>
                <SelectItem value="created_asc">Oldest first</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : users.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No users in the directory yet. Add a user to get started.
          </CardContent>
        </Card>
      ) : visibleUsers.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No users match the current filters.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {visibleUsers.map((u) => (
            <Card
              key={u.id}
              className="cursor-pointer border-border/60 transition-shadow hover:shadow-sm"
              onClick={() => openEdit(u)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openEdit(u);
                }
              }}
            >
              <CardContent className="flex min-h-24 items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-heading font-semibold text-foreground">
                      {u.full_name}
                    </span>
                    <Badge
                      variant="outline"
                      className={roleBadgeClass(u.role)}
                    >
                      {formatStatusLabel(u.role)}
                    </Badge>
                    {u.is_active === false ? (
                      <Badge variant="outline" className="bg-destructive/10 text-destructive">
                        Inactive
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground">{u.email}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Venues:{" "}
                    <span className="font-medium text-foreground">
                      {u.role === "admin"
                        ? venueLabels(
                            ((u as ManagedUser & { venue_ids?: string[] }).venue_ids ?? []).filter(
                              Boolean,
                            ),
                          )
                        : "—"}
                    </span>
                  </p>
                </div>
                <div className="shrink-0 text-xs text-muted-foreground">Click to edit</div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {editing ? "Edit user" : "New user"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Email *</Label>
              <Input
                className="mt-1.5"
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                disabled={!!editing}
              />
            </div>
            <div>
              <Label>Full name *</Label>
              <Input
                className="mt-1.5"
                value={form.full_name}
                onChange={(e) =>
                  setForm({ ...form, full_name: e.target.value })
                }
              />
            </div>
            <div>
              <Label>Role</Label>
              <Select
                value={form.role}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    role: v as ManagedUser["role"],
                    venue_ids: v === "admin" ? form.venue_ids : [],
                  })
                }
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Player</SelectItem>
                  <SelectItem value="admin">Court admin</SelectItem>
                  <SelectItem value="superadmin">Superadmin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={form.is_active ? "active" : "inactive"}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    is_active: v === "active",
                  })
                }
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                Inactive users cannot log in.
              </p>
            </div>
            {form.role === "admin" ? (
              <div>
                <Label>Venue assignments</Label>
                <div className="mt-1.5 space-y-2 rounded-md border border-border/60 p-3">
                  {accounts.map((a) => {
                    const checked = form.venue_ids.includes(a.id);
                    return (
                      <label key={a.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              venue_ids: e.target.checked
                                ? [...prev.venue_ids, a.id]
                                : prev.venue_ids.filter((id) => id !== a.id),
                            }))
                          }
                        />
                        <span>{a.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            {editing ? (
              <Button
                type="button"
                variant="outline"
                className="border-destructive/25 text-destructive hover:bg-destructive/5"
                onClick={() => setConfirmRemoveUserId(editing.id)}
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
                saveUser.isPending ||
                !form.email.trim() ||
                !form.full_name.trim()
              }
              onClick={() => saveUser.mutate()}
            >
              {saveUser.isPending ? "Saving…" : editing ? "Save" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

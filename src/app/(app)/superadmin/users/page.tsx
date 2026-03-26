"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
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
  court_account_id: "" as string,
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
    queryKey: ["court-accounts"],
    queryFn: async () => {
      const { data } = await courtlyApi.courtAccounts.list();
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
        court_account_id:
          form.role === "admin" && form.court_account_id.trim()
            ? form.court_account_id
            : null,
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
      court_account_id: u.court_account_id ?? "",
    });
    setDialogOpen(true);
  };

  const accountLabel = (id: string | null) => {
    if (!id) return "—";
    return accounts.find((a) => a.id === id)?.name ?? id;
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 md:px-10">
      <PageHeader
        title="User accounts"
        subtitle="Directory of players, court admins, and platform staff. Court admins can be linked to a court account."
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
            <Card key={u.id} className="border-border/60">
              <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
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
                  </div>
                  <p className="text-sm text-muted-foreground">{u.email}</p>
                  {u.role === "admin" ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Court account:{" "}
                      <span className="font-medium text-foreground">
                        {accountLabel(u.court_account_id)}
                      </span>
                    </p>
                  ) : null}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEdit(u)}
                  >
                    <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-destructive/25 text-destructive hover:bg-destructive/5"
                    onClick={() => removeUser.mutate(u.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
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
                    court_account_id:
                      v === "admin" ? form.court_account_id : "",
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
            {form.role === "admin" ? (
              <div>
                <Label>Court account</Label>
                <Select
                  value={form.court_account_id || "__none__"}
                  onValueChange={(v) =>
                    setForm({
                      ...form,
                      court_account_id: v === "__none__" ? "" : v,
                    })
                  }
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Select account" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">None</SelectItem>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
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

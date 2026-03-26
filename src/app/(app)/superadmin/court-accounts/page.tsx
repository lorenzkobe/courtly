"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { Building2, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
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
import { Textarea } from "@/components/ui/textarea";
import { courtlyApi } from "@/lib/api/courtly-client";
import type { CourtAccount } from "@/lib/types/courtly";
import { formatStatusLabel } from "@/lib/utils";

const emptyForm = {
  name: "",
  contact_email: "",
  status: "active" as CourtAccount["status"],
  initial_admin_mode: "existing" as "existing" | "new",
  initial_admin_user_id: "" as string,
  initial_admin_new_name: "",
  initial_admin_new_email: "",
  notes: "",
};

type CourtAccountSort =
  | "name_asc"
  | "name_desc"
  | "created_desc"
  | "created_asc"
  | "email_asc";

export default function SuperadminCourtAccountsPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<CourtAccount | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [statusFilter, setStatusFilter] = useState<"all" | CourtAccount["status"]>(
    "all",
  );
  const [sortBy, setSortBy] = useState<CourtAccountSort>("name_asc");

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["court-accounts"],
    queryFn: async () => {
      const { data } = await courtlyApi.courtAccounts.list();
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

  const visibleAccounts = useMemo(() => {
    let list = [...accounts];
    if (statusFilter !== "all") {
      list = list.filter((a) => a.status === statusFilter);
    }
    list.sort((a, b) => {
      switch (sortBy) {
        case "name_desc":
          return b.name.localeCompare(a.name, undefined, { sensitivity: "base" });
        case "created_desc":
          return b.created_at.localeCompare(a.created_at);
        case "created_asc":
          return a.created_at.localeCompare(b.created_at);
        case "email_asc":
          return a.contact_email.localeCompare(b.contact_email, undefined, {
            sensitivity: "base",
          });
        default:
          return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      }
    });
    return list;
  }, [accounts, statusFilter, sortBy]);

  const saveAccount = useMutation({
    mutationFn: async () => {
      const body = {
        name: form.name.trim(),
        contact_email: form.contact_email.trim(),
        status: form.status,
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
        primary_admin_user_id:
          form.initial_admin_mode === "existing" && form.initial_admin_user_id.trim()
            ? form.initial_admin_user_id
            : null,
        notes: form.notes.trim() || undefined,
      };
      if (editing) {
        await courtlyApi.courtAccounts.update(editing.id, body);
      } else {
        await courtlyApi.courtAccounts.create(body);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["court-accounts"] });
      toast.success(editing ? "Account updated" : "Court account created");
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyForm);
    },
    onError: () => {
      toast.error("Could not save court account");
    },
  });

  const removeAccount = useMutation({
    mutationFn: async (id: string) => {
      await courtlyApi.courtAccounts.remove(id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["court-accounts"] });
      toast.success("Court account removed");
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

  const openEdit = (a: CourtAccount) => {
    setEditing(a);
    setForm({
      name: a.name,
      contact_email: a.contact_email,
      status: a.status,
      initial_admin_mode: "existing",
      initial_admin_user_id: a.primary_admin_user_id ?? "",
      initial_admin_new_name: "",
      initial_admin_new_email: "",
      notes: a.notes ?? "",
    });
    setDialogOpen(true);
  };

  const statusVariant =
    (s: CourtAccount["status"]) =>
      s === "active"
        ? "bg-primary/10 text-primary"
        : "bg-destructive/10 text-destructive";

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 md:px-10">
      <PageHeader
        title="Court accounts"
        subtitle="Establishments (building/business). Each establishment can have multiple court admins and multiple courts."
      >
        <Button className="font-heading font-semibold" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> New establishment
        </Button>
      </PageHeader>

      {!isLoading && accounts.length > 0 ? (
        <div className="mb-6 flex flex-col gap-4 rounded-xl border border-border/60 bg-muted/10 p-4 sm:flex-row sm:flex-wrap sm:items-end">
          <div className="min-w-40 flex-1">
            <Label className="text-xs text-muted-foreground">Account status</Label>
            <Select
              value={statusFilter}
              onValueChange={(v) =>
                setStatusFilter(v as "all" | CourtAccount["status"])
              }
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-48 flex-1">
            <Label className="text-xs text-muted-foreground">Sort by</Label>
            <Select
              value={sortBy}
              onValueChange={(v) => setSortBy(v as CourtAccountSort)}
            >
              <SelectTrigger className="mt-1.5">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name_asc">Name (A–Z)</SelectItem>
                <SelectItem value="name_desc">Name (Z–A)</SelectItem>
                <SelectItem value="created_desc">Newest first</SelectItem>
                <SelectItem value="created_asc">Oldest first</SelectItem>
                <SelectItem value="email_asc">Contact email (A–Z)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      ) : accounts.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
            <Building2 className="h-10 w-10 text-muted-foreground" />
            <p className="max-w-md text-sm text-muted-foreground">
              No court accounts yet. Create one to onboard a venue; you can then
              attach courts and admin users to it.
            </p>
            <Button onClick={openCreate}>Create court account</Button>
          </CardContent>
        </Card>
      ) : visibleAccounts.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No accounts match the current filters.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {visibleAccounts.map((a) => (
            <Card key={a.id} className="border-border/60">
              <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
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
                  <p className="text-sm text-muted-foreground">{a.contact_email}</p>
                  {a.primary_admin_user_id ? (
                    <p className="text-xs text-muted-foreground">
                      Primary admin:{" "}
                      <span className="font-medium text-foreground">
                        {managedUsers.find((u) => u.id === a.primary_admin_user_id)
                          ?.email ?? a.primary_admin_user_id}
                      </span>
                    </p>
                  ) : (
                    <p className="text-xs text-muted-foreground">
                      No primary admin assigned
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button variant="outline" size="sm" asChild>
                    <Link href={`/superadmin/court-accounts/${a.id}`}>
                      View details
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => openEdit(a)}
                  >
                    <Pencil className="mr-1 h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-destructive/25 text-destructive hover:bg-destructive/5"
                    onClick={() => removeAccount.mutate(a.id)}
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
        <DialogContent className="max-h-[90vh] max-w-md">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {editing ? "Edit court account" : "New court account"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Establishment name *</Label>
              <Input
                className="mt-1.5"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. BGC Makati Sports Center"
              />
            </div>
            <div>
              <Label>Contact email *</Label>
              <Input
                className="mt-1.5"
                type="email"
                value={form.contact_email}
                onChange={(e) =>
                  setForm({ ...form, contact_email: e.target.value })
                }
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    status: v as CourtAccount["status"],
                  })
                }
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Initial establishment admin *</Label>
              <p className="mb-1.5 text-xs text-muted-foreground">
                Required on creation. You can link an existing admin or create a new
                admin user.
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
            <div>
              <Label>Notes</Label>
              <Textarea
                className="mt-1.5 min-h-[80px]"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Internal notes"
              />
            </div>
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
                saveAccount.isPending ||
                !form.name.trim() ||
                !form.contact_email.trim() ||
                (form.initial_admin_mode === "existing" &&
                  !form.initial_admin_user_id.trim()) ||
                (form.initial_admin_mode === "new" &&
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

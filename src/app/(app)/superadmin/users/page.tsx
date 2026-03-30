"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { format } from "date-fns";
import { CalendarIcon, Copy, Plus, Send, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import PageHeader from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
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
import { queryKeys } from "@/lib/query/query-keys";
import type { ManagedUser } from "@/lib/types/courtly";
import { cn, formatStatusLabel } from "@/lib/utils";
import {
  EMAIL_REGEX,
  isValidBirthdateIso,
  isValidPersonName,
  PH_MOBILE_REGEX,
} from "@/lib/validation/person-fields";

const emptyForm = {
  email: "",
  firstName: "",
  lastName: "",
  birthdate: "",
  mobileNumber: "",
  role: "user" as ManagedUser["role"],
  is_active: true,
  venue_ids: [] as string[],
};

function parseIsoToLocalDate(iso: string): Date | undefined {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return undefined;
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

function splitLegacyFullName(full: string) {
  const trimmed = full.trim();
  if (!trimmed) return { firstName: "", lastName: "" };
  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0]!, lastName: "" };
  return { firstName: parts[0]!, lastName: parts.slice(1).join(" ") };
}

function userDisplayName(u: ManagedUser) {
  const fromParts = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  return fromParts || u.full_name;
}

function isInvitePending(u: ManagedUser) {
  return u.email_confirmed_at == null || u.email_confirmed_at === "";
}

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
  const [birthdateOpen, setBirthdateOpen] = useState(false);
  const [inviteLinkDialog, setInviteLinkDialog] = useState<{
    link: string;
    message: string;
  } | null>(null);
  const [roleFilter, setRoleFilter] = useState<"all" | ManagedUser["role"]>(
    "all",
  );
  const [sortBy, setSortBy] = useState<UserSort>("name_asc");

  const {
    data: directory,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.superadmin.directory(),
    queryFn: async () => {
      const { data } = await courtlyApi.superadmin.directory();
      return data;
    },
  });
  const users = useMemo(
    () => directory?.managed_users ?? [],
    [directory?.managed_users],
  );

  const listErrorMessage = isAxiosError(error)
    ? (error.response?.data as { error?: string; detail?: string })?.error ??
      error.message
    : error instanceof Error
      ? error.message
      : "Could not load users.";

  const accounts = directory?.venues ?? [];

  const visibleUsers = useMemo(() => {
    let list = [...users];
    if (roleFilter !== "all") {
      list = list.filter((managedUser) => managedUser.role === roleFilter);
    }
    list.sort((a, b) => {
      const nameA = userDisplayName(a);
      const nameB = userDisplayName(b);
      switch (sortBy) {
        case "name_desc":
          return nameB.localeCompare(nameA, undefined, {
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
          return nameA.localeCompare(nameB, undefined, {
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
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        birthdate: form.birthdate,
        mobileNumber: form.mobileNumber.trim(),
        role: form.role,
        is_active: form.is_active,
        venue_ids: form.role === "admin" ? form.venue_ids : [],
      };
      if (editing) {
        await courtlyApi.managedUsers.update(editing.id, body);
        return { mode: "edit" as const };
      }
      await courtlyApi.managedUsers.create(body);
      return { mode: "create" as const };
    },
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.superadmin.directory() });
      if (result.mode === "create") {
        toast.success(
          "Invitation sent. The user will get an email with a link to set their password.",
        );
      } else {
        toast.success("User updated");
      }
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

  const resendInvite = useMutation({
    mutationFn: async (userId: string) => {
      const { data } = await courtlyApi.managedUsers.resendInvite(userId);
      return data;
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.superadmin.directory() });
      if (data.emailed) {
        toast.success(data.message ?? "Invitation sent.");
        return;
      }
      if (data.action_link) {
        setInviteLinkDialog({
          link: data.action_link,
          message: data.message ?? "Copy the link and send it to the user.",
        });
        return;
      }
      toast.success("Done.");
    },
    onError: (err: unknown) => {
      const msg = isAxiosError(err)
        ? (err.response?.data as { error?: string })?.error
        : undefined;
      toast.error(msg ?? "Could not resend invitation");
    },
  });

  const removeUser = useMutation({
    mutationFn: async (id: string) => {
      await courtlyApi.managedUsers.remove(id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.superadmin.directory() });
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
    const legacy = splitLegacyFullName(u.full_name);
    setEditing(u);
    setForm({
      email: u.email,
      firstName: (u.first_name ?? legacy.firstName).trim(),
      lastName: (u.last_name ?? legacy.lastName).trim(),
      birthdate: u.birthdate
        ? String(u.birthdate).slice(0, 10)
        : "",
      mobileNumber: (u.mobile_number ?? "").trim(),
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
      .map(
        (id) => accounts.find((venue) => venue.id === id)?.name ?? id,
      )
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
      ) : isError ? (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="space-y-3 py-8 text-center text-sm">
            <p className="font-medium text-destructive">Could not load users</p>
            <p className="text-muted-foreground">{listErrorMessage}</p>
            <Button type="button" variant="outline" onClick={() => void refetch()}>
              Try again
            </Button>
          </CardContent>
        </Card>
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
          {visibleUsers.map((user) => (
            <Card
              key={user.id}
              className="cursor-pointer border-border/60 transition-shadow hover:shadow-sm"
              onClick={() => openEdit(user)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openEdit(user);
                }
              }}
            >
              <CardContent className="flex min-h-24 items-center justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-heading font-semibold text-foreground">
                      {userDisplayName(user)}
                    </span>
                    <Badge
                      variant="outline"
                      className={roleBadgeClass(user.role)}
                    >
                      {formatStatusLabel(user.role)}
                    </Badge>
                    {user.is_active === false ? (
                      <Badge variant="outline" className="bg-destructive/10 text-destructive">
                        Inactive
                      </Badge>
                    ) : null}
                    {isInvitePending(user) ? (
                      <Badge variant="outline" className="border-amber-500/40 text-amber-800 dark:text-amber-200">
                        Invite pending
                      </Badge>
                    ) : null}
                  </div>
                  <p className="text-sm text-muted-foreground">{user.email}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Venues:{" "}
                    <span className="font-medium text-foreground">
                      {user.role === "admin"
                        ? venueLabels(
                            (
                              (user as ManagedUser & { venue_ids?: string[] })
                                .venue_ids ?? []
                            ).filter(Boolean),
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
        <DialogContent
          className="max-h-[90vh] max-w-md"
          contentClassName="min-w-0"
        >
          <DialogHeader>
            <DialogTitle className="font-heading">
              {editing ? "Edit user" : "New user"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Email *</Label>
              <div className="mt-1.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-2">
                <Input
                  className="min-w-0 flex-1"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  disabled={!!editing}
                />
                {editing && isInvitePending(editing) ? (
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full shrink-0 whitespace-nowrap sm:w-auto"
                    disabled={resendInvite.isPending}
                    onClick={() => resendInvite.mutate(editing.id)}
                  >
                    <Send className="mr-1.5 h-3.5 w-3.5 shrink-0" />
                    {resendInvite.isPending ? "Sending…" : "Resend invitation"}
                  </Button>
                ) : null}
              </div>
            </div>
            {!editing ? (
              <p className="text-xs text-muted-foreground">
                We will email them a Supabase invitation link so they can choose their own password.
              </p>
            ) : null}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>First name *</Label>
                <Input
                  className="mt-1.5"
                  autoComplete="given-name"
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                />
              </div>
              <div>
                <Label>Last name *</Label>
                <Input
                  className="mt-1.5"
                  autoComplete="family-name"
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="user-birthdate">Birthdate *</Label>
              <Popover open={birthdateOpen} onOpenChange={setBirthdateOpen}>
                <PopoverTrigger asChild>
                  <Button
                    id="user-birthdate"
                    type="button"
                    variant="outline"
                    className={cn(
                      "mt-1.5 h-11 w-full justify-start gap-2.5 rounded-2xl border-border/80 bg-card text-left text-sm font-normal shadow-sm transition-[box-shadow,background-color] hover:bg-muted/50 hover:shadow-md",
                      !form.birthdate && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                    <span className="truncate">
                      {parseIsoToLocalDate(form.birthdate)
                        ? format(parseIsoToLocalDate(form.birthdate)!, "MMMM d, yyyy")
                        : "Select birthdate"}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="z-120 w-auto overflow-hidden rounded-2xl border-border/80 bg-card p-0 shadow-xl"
                  align="start"
                >
                  <Calendar
                    birthdatePicker
                    mode="single"
                    selected={parseIsoToLocalDate(form.birthdate)}
                    onSelect={(d) => {
                      if (!d || d > new Date()) return;
                      setForm({ ...form, birthdate: format(d, "yyyy-MM-dd") });
                      setBirthdateOpen(false);
                    }}
                    disabled={(date) => date > new Date()}
                    className="w-full min-w-0"
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label>Mobile number (PH) *</Label>
              <Input
                className="mt-1.5"
                type="tel"
                autoComplete="tel"
                placeholder="09171234567 or +639171234567"
                value={form.mobileNumber}
                onChange={(e) => setForm({ ...form, mobileNumber: e.target.value })}
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
                  {accounts.map((venue) => {
                    const checked = form.venue_ids.includes(venue.id);
                    return (
                      <label key={venue.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) =>
                            setForm((prev) => ({
                              ...prev,
                              venue_ids: e.target.checked
                                ? [...prev.venue_ids, venue.id]
                                : prev.venue_ids.filter((id) => id !== venue.id),
                            }))
                          }
                        />
                        <span>{venue.name}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>
          <div
            role="group"
            aria-label="User form actions"
            className="mt-2 flex w-full min-w-0 flex-wrap items-center justify-end gap-2 border-t border-border/60 pt-4"
          >
            {editing ? (
              <Button
                type="button"
                variant="outline"
                className="border-destructive/25 text-destructive hover:bg-destructive/5"
                onClick={() => setConfirmRemoveUserId(editing.id)}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5 shrink-0" />
                Delete
              </Button>
            ) : null}
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="font-heading font-semibold"
              disabled={
                saveUser.isPending ||
                !form.email.trim() ||
                !EMAIL_REGEX.test(form.email.trim().toLowerCase()) ||
                !isValidPersonName(form.firstName) ||
                !isValidPersonName(form.lastName) ||
                !isValidBirthdateIso(form.birthdate) ||
                !PH_MOBILE_REGEX.test(form.mobileNumber.trim())
              }
              onClick={() => saveUser.mutate()}
            >
              {saveUser.isPending ? "Saving…" : editing ? "Save" : "Create"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!inviteLinkDialog}
        onOpenChange={(open) => {
          if (!open) setInviteLinkDialog(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">Invitation link</DialogTitle>
          </DialogHeader>
          {inviteLinkDialog ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{inviteLinkDialog.message}</p>
              <Input readOnly value={inviteLinkDialog.link} className="font-mono text-xs" />
              <Button
                type="button"
                className="w-full"
                variant="secondary"
                onClick={async () => {
                  await navigator.clipboard.writeText(inviteLinkDialog.link);
                  toast.success("Link copied");
                }}
              >
                <Copy className="mr-2 h-4 w-4" />
                Copy link
              </Button>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

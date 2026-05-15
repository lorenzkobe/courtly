"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { format } from "date-fns";
import {
  CalendarIcon,
  Copy,
  History,
  ListFilter,
  Plus,
  Search,
  Send,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  DialogDescription,
  DialogFooter,
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
import { apiErrorMessage } from "@/lib/api/api-error-message";
import { courtlyApi } from "@/lib/api/courtly-client";
import { queryKeys } from "@/lib/query/query-keys";
import type { ManagedUser, SuperadminDirectoryPagedResponse } from "@/lib/types/courtly";
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

function humanizeAuditFieldKey(key: string) {
  return key.replace(/_/g, " ");
}

function summarizeAuditFields(
  changed: Record<string, { before: unknown; after: unknown }>,
) {
  const keys = Object.keys(changed);
  if (keys.length === 0) return "Account updated";
  return keys.map(humanizeAuditFieldKey).join(", ");
}

type UserSort =
  | "name_asc"
  | "name_desc"
  | "email_asc"
  | "email_desc"
  | "created_desc"
  | "created_asc";

type StatusFilter = "all" | "active" | "inactive" | "invite_pending";

type UserFilters = {
  role: "all" | ManagedUser["role"];
  status: StatusFilter;
};

function defaultUserFilters(): UserFilters {
  return { role: "all", status: "all" };
}

type AppliedFilterChip = {
  id: string;
  label: string;
  onRemove: () => void;
};

const ROLE_LABELS: Record<ManagedUser["role"], string> = {
  user: "Player",
  admin: "Court admin",
  superadmin: "Superadmin",
};

const STATUS_LABELS: Record<Exclude<StatusFilter, "all">, string> = {
  active: "Active",
  inactive: "Inactive",
  invite_pending: "Invite pending",
};

export default function SuperadminUsersPage() {
  const PAGE_LIMIT = 20;
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
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [appliedFilters, setAppliedFilters] = useState<UserFilters>(() =>
    defaultUserFilters(),
  );
  const [draftFilters, setDraftFilters] = useState<UserFilters>(() =>
    defaultUserFilters(),
  );
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [sortBy, setSortBy] = useState<UserSort>("name_asc");
  const [accountHistoryOpen, setAccountHistoryOpen] = useState(false);
  const [accountHistoryUserId, setAccountHistoryUserId] = useState<string | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(handle);
  }, [search]);

  const queryParams = useMemo(
    () => ({
      q: debouncedSearch || undefined,
      role: appliedFilters.role !== "all" ? appliedFilters.role : undefined,
      status:
        appliedFilters.status !== "all" ? appliedFilters.status : undefined,
      sort: sortBy,
    }),
    [debouncedSearch, appliedFilters, sortBy],
  );

  const {
    data: directoryPages,
    isLoading,
    isError,
    error,
    refetch,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: queryKeys.superadmin.directoryPaged(PAGE_LIMIT, {
      q: queryParams.q,
      role: queryParams.role,
      status: queryParams.status,
      sort: queryParams.sort,
    }),
    queryFn: async ({ pageParam }) => {
      const { data } = await courtlyApi.superadmin.directory({
        limit: PAGE_LIMIT,
        users_cursor: pageParam.users_cursor,
        venues_cursor: pageParam.venues_cursor,
        q: queryParams.q,
        role: queryParams.role,
        status: queryParams.status,
        sort: queryParams.sort,
      });
      return data;
    },
    initialPageParam: {
      users_cursor: null as string | null,
      venues_cursor: null as string | null,
    },
    getNextPageParam: (lastPage) => ({
      users_cursor: lastPage.managed_users.next_cursor,
      venues_cursor: lastPage.venues.next_cursor,
    }),
  });
  const users = useMemo(
    () => (directoryPages?.pages ?? []).flatMap((page) => page.managed_users.items),
    [directoryPages?.pages],
  );

  const listErrorMessage = apiErrorMessage(error, "Could not load users.");

  const accounts = useMemo(
    () => (directoryPages?.pages ?? []).flatMap((page) => page.venues.items),
    [directoryPages?.pages],
  );
  const hasMoreUsers =
    directoryPages?.pages?.[directoryPages.pages.length - 1]?.managed_users.has_more ??
    false;

  const visibleUsers = users;
  const hasActiveSearchOrFilters =
    Boolean(debouncedSearch) ||
    appliedFilters.role !== "all" ||
    appliedFilters.status !== "all";

  const openFilterDialog = useCallback(() => {
    if (!filterDialogOpen) {
      setDraftFilters({ ...appliedFilters });
    }
    setFilterDialogOpen(true);
  }, [appliedFilters, filterDialogOpen]);

  const applyFilterDraft = useCallback(() => {
    setAppliedFilters({ ...draftFilters });
    setFilterDialogOpen(false);
  }, [draftFilters]);

  const resetFilterDraft = useCallback(() => {
    setDraftFilters(defaultUserFilters());
  }, []);

  const clearAllFilters = useCallback(() => {
    const empty = defaultUserFilters();
    setAppliedFilters(empty);
    if (filterDialogOpen) setDraftFilters(empty);
  }, [filterDialogOpen]);

  const appliedFilterChips = useMemo((): AppliedFilterChip[] => {
    const chips: AppliedFilterChip[] = [];
    if (appliedFilters.role !== "all") {
      chips.push({
        id: "role",
        label: `Role: ${ROLE_LABELS[appliedFilters.role]}`,
        onRemove: () => setAppliedFilters((prev) => ({ ...prev, role: "all" })),
      });
    }
    if (appliedFilters.status !== "all") {
      chips.push({
        id: "status",
        label: `Status: ${STATUS_LABELS[appliedFilters.status]}`,
        onRemove: () =>
          setAppliedFilters((prev) => ({ ...prev, status: "all" })),
      });
    }
    return chips;
  }, [appliedFilters]);

  const activeFilterCount = appliedFilterChips.length;

  const { data: accountHistoryData, isLoading: accountHistoryLoading } = useQuery({
    queryKey: ["managed-user-audits", accountHistoryUserId],
    queryFn: async () => {
      const { data } = await courtlyApi.managedUsers.audits(accountHistoryUserId!, {
        limit: 100,
      });
      return data;
    },
    enabled: Boolean(accountHistoryOpen && accountHistoryUserId),
  });

  const accountHistoryChronological = useMemo(() => {
    const items = accountHistoryData?.items ?? [];
    return [...items].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
  }, [accountHistoryData?.items]);

  const accountHistorySubject = useMemo(
    () => users.find((u) => u.id === accountHistoryUserId) ?? null,
    [users, accountHistoryUserId],
  );

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
        const { data: updated } = await courtlyApi.managedUsers.update(editing.id, body);
        return { mode: "edit" as const, updated, editedId: editing.id };
      }
      await courtlyApi.managedUsers.create(body);
      return { mode: "create" as const };
    },
    onSuccess: (result) => {
      if (result.mode === "edit") {
        const updated = result.updated as ManagedUser & { venue_ids?: string[] };
        queryClient.setQueryData<InfiniteData<SuperadminDirectoryPagedResponse>>(
          queryKeys.superadmin.directoryPaged(PAGE_LIMIT),
          (old) => {
            if (!old) return old;
            return {
              ...old,
              pages: old.pages.map((page) => ({
                ...page,
                managed_users: {
                  ...page.managed_users,
                  items: page.managed_users.items.map((u) =>
                    u.id === updated.id ? { ...u, ...updated } : u,
                  ),
                },
              })),
            };
          },
        );
      }
      if (result.mode === "create") {
        void queryClient.invalidateQueries({ queryKey: ["superadmin", "directory", "paged"] });
      }
      if (result.mode === "edit") {
        void queryClient.invalidateQueries({ queryKey: ["managed-user-audits", result.editedId] });
      }
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
      toast.error(apiErrorMessage(err, "Could not save user"));
    },
  });

  const resendInvite = useMutation({
    mutationFn: async (userId: string) => {
      const { data } = await courtlyApi.managedUsers.resendInvite(userId);
      return data;
    },
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: ["superadmin", "directory", "paged"] });
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
      toast.error(apiErrorMessage(err, "Could not resend invitation"));
    },
  });

  const removeUser = useMutation({
    mutationFn: async (id: string) => {
      await courtlyApi.managedUsers.remove(id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["superadmin", "directory", "paged"] });
      toast.success("User removed");
      setDialogOpen(false);
      setEditing(null);
      setForm(emptyForm);
    },
    onError: (err: unknown) => {
      toast.error(apiErrorMessage(err, "Could not remove user"));
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

      {!isLoading && (users.length > 0 || hasActiveSearchOrFilters) ? (
        <div className="mb-6 flex flex-col gap-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name or email..."
                className="pl-9"
              />
            </div>
            <div className="flex shrink-0 items-center justify-end gap-2">
              <Select
                value={sortBy}
                onValueChange={(v) => setSortBy(v as UserSort)}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Sort by" />
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
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="relative shrink-0"
                aria-label="Open user filters"
                onClick={openFilterDialog}
              >
                <ListFilter className="h-4 w-4" />
                {activeFilterCount > 0 ? (
                  <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-primary-foreground">
                    {activeFilterCount}
                  </span>
                ) : null}
              </Button>
            </div>
          </div>

          <div
            className={cn(
              "flex min-w-0 flex-wrap items-center gap-2",
              appliedFilterChips.length > 0 &&
                "rounded-lg border border-border/60 bg-muted/20 p-2",
            )}
          >
            {appliedFilterChips.map((chip) => (
              <Badge
                key={chip.id}
                variant="secondary"
                className="h-7 shrink-0 gap-0.5 rounded-full pr-0.5 pl-2.5 font-normal"
              >
                <span className="max-w-[220px] truncate sm:max-w-[320px]">
                  {chip.label}
                </span>
                <button
                  type="button"
                  onClick={chip.onRemove}
                  className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label={`Remove filter ${chip.label}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {activeFilterCount > 0 ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={clearAllFilters}
              >
                Clear filters
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      <Dialog open={filterDialogOpen} onOpenChange={setFilterDialogOpen}>
        <DialogContent className="max-h-[min(92dvh,36rem)] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">Filters</DialogTitle>
            <DialogDescription>
              Narrow the directory by role or account status. Apply to update
              the list; filter chips can be removed individually.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label htmlFor="user-filter-role">Account type</Label>
              <Select
                value={draftFilters.role}
                onValueChange={(v) =>
                  setDraftFilters((d) => ({
                    ...d,
                    role: v as UserFilters["role"],
                  }))
                }
              >
                <SelectTrigger id="user-filter-role" className="mt-1.5">
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
            <div>
              <Label htmlFor="user-filter-status">Status</Label>
              <Select
                value={draftFilters.status}
                onValueChange={(v) =>
                  setDraftFilters((d) => ({
                    ...d,
                    status: v as StatusFilter,
                  }))
                }
              >
                <SelectTrigger id="user-filter-status" className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="invite_pending">Invite pending</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="flex-row flex-wrap gap-2 sm:justify-between">
            <Button
              type="button"
              variant="ghost"
              className="text-muted-foreground"
              onClick={resetFilterDraft}
            >
              Reset
            </Button>
            <Button
              type="button"
              className="font-heading"
              onClick={applyFilterDraft}
            >
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            {hasActiveSearchOrFilters
              ? "No users match the current filters."
              : "No users in the directory yet. Add a user to get started."}
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
          {hasMoreUsers ? (
            <div className="flex justify-center pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={isFetchingNextPage}
                onClick={() => void fetchNextPage()}
              >
                {isFetchingNextPage ? "Loading..." : "Load more"}
              </Button>
            </div>
          ) : null}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-md" contentClassName="min-w-0">
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
              {editing ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3 w-full gap-1.5 sm:w-auto"
                  onClick={() => {
                    setAccountHistoryUserId(editing.id);
                    setAccountHistoryOpen(true);
                  }}
                >
                  <History className="h-4 w-4" aria-hidden />
                  Account history
                </Button>
              ) : null}
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
        open={accountHistoryOpen}
        onOpenChange={(open) => {
          setAccountHistoryOpen(open);
          if (!open) setAccountHistoryUserId(null);
        }}
      >
        <DialogContent className="flex max-h-[85vh] max-w-lg flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b border-border/60 px-6 py-4 text-left">
            <DialogTitle className="font-heading">Account history</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {accountHistorySubject ? (
                <>
                  {userDisplayName(accountHistorySubject)} · {accountHistorySubject.email}
                </>
              ) : accountHistoryUserId ? (
                <>
                  User ID:{" "}
                  <span className="font-mono text-xs">{accountHistoryUserId}</span>
                </>
              ) : (
                "Profile and access changes by superadmins, oldest first."
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
            {accountHistoryLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full rounded-lg" />
                <Skeleton className="h-16 w-full rounded-lg" />
              </div>
            ) : accountHistoryChronological.length === 0 ? (
              <p className="text-sm text-muted-foreground">No audit entries yet.</p>
            ) : (
              <ol className="space-y-3">
                {accountHistoryChronological.map((row) => (
                  <li
                    key={row.id}
                    className="rounded-lg border border-border/60 bg-muted/10 p-3"
                  >
                    <p className="text-xs text-muted-foreground">
                      <time dateTime={row.created_at}>
                        {format(new Date(row.created_at), "MMM d, yyyy · h:mm a")}
                      </time>
                    </p>
                    <p className="mt-1 text-sm font-medium text-foreground">
                      {summarizeAuditFields(row.changed_fields)}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      By <span className="font-mono">{row.actor_user_id}</span>
                    </p>
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-medium text-primary">
                        Field diff (JSON)
                      </summary>
                      <pre className="mt-2 max-h-40 overflow-auto rounded-md border border-border/60 bg-muted/40 p-2 font-mono text-[10px] leading-relaxed">
                        {JSON.stringify(row.changed_fields, null, 2)}
                      </pre>
                    </details>
                  </li>
                ))}
              </ol>
            )}
          </div>
          <div className="border-t border-border/60 px-6 py-3">
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              onClick={() => {
                setAccountHistoryOpen(false);
                setAccountHistoryUserId(null);
              }}
            >
              Close
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

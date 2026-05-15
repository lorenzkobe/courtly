"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Send, Users } from "lucide-react";
import { toast } from "sonner";
import AdminAcceptanceTable from "@/components/admin/AdminAcceptanceTable";
import TermsEditor from "@/components/admin/TermsEditor";
import TermsHistoryDialog from "@/components/admin/TermsHistoryDialog";
import TermsHtmlView from "@/components/admin/TermsHtmlView";
import PageHeader from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiErrorMessage } from "@/lib/api/api-error-message";
import { courtlyApi } from "@/lib/api/courtly-client";
import { queryKeys } from "@/lib/query/query-keys";

export default function SuperadminTermsPage() {
  const queryClient = useQueryClient();
  const [localEdit, setLocalEdit] = useState<string | null>(null);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [confirmPublishAllOpen, setConfirmPublishAllOpen] = useState(false);
  const [selectDialogOpen, setSelectDialogOpen] = useState(false);
  const [confirmPublishSelectedOpen, setConfirmPublishSelectedOpen] = useState(false);
  const [selectedAdminIds, setSelectedAdminIds] = useState<Set<string>>(
    () => new Set(),
  );

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.terms.superadmin(),
    queryFn: async () => {
      const { data: payload } = await courtlyApi.superadminTerms.get();
      return payload;
    },
    staleTime: 30_000,
  });

  // Shares the cache key with <AdminAcceptanceTable />; one network call.
  const { data: acceptanceData } = useQuery({
    queryKey: queryKeys.terms.acceptances(),
    queryFn: async () => {
      const { data: payload } = await courtlyApi.superadminTerms.acceptances();
      return payload;
    },
    staleTime: 30_000,
  });

  const serverDraftHtml = data?.draft?.content_html ?? "";
  const draftHtml = localEdit ?? serverDraftHtml;
  const hydrated = !!data;

  const publishedVersion = data?.published?.version ?? null;
  const publishedHtml = data?.published?.content_html ?? "";
  const nextVersion =
    (acceptanceData?.latest_version ?? publishedVersion ?? 0) + 1;

  const dirty = useMemo(() => {
    if (!hydrated) return false;
    return serverDraftHtml !== draftHtml;
  }, [draftHtml, serverDraftHtml, hydrated]);

  const publishableChange = useMemo(() => {
    if (!hydrated) return false;
    return draftHtml.trim() !== publishedHtml.trim();
  }, [draftHtml, publishedHtml, hydrated]);

  const adminOptions = useMemo(
    () =>
      (acceptanceData?.rows ?? []).map((row) => ({
        id: row.admin_id,
        name: row.full_name || row.email || row.admin_id,
        email: row.email,
        status: row.status,
        applicable_version: row.applicable_version,
      })),
    [acceptanceData],
  );

  const saveDraft = useMutation({
    mutationFn: async () => {
      const { data: payload } = await courtlyApi.superadminTerms.saveDraft(draftHtml);
      return payload;
    },
    onSuccess: (payload) => {
      queryClient.setQueryData(queryKeys.terms.superadmin(), (prev: typeof data) =>
        prev ? { ...prev, draft: payload.draft } : prev,
      );
      setLocalEdit(null);
      toast.success("Draft saved.");
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, "Could not save draft."));
    },
  });

  const publish = useMutation({
    mutationFn: async (input: { targetAdminIds: string[] | null }) => {
      if (dirty) {
        await courtlyApi.superadminTerms.saveDraft(draftHtml);
      }
      const { data: payload } = await courtlyApi.superadminTerms.publish(
        input.targetAdminIds && input.targetAdminIds.length > 0
          ? { target_admin_ids: input.targetAdminIds }
          : undefined,
      );
      return payload;
    },
    onSuccess: (_payload, input) => {
      setConfirmPublishAllOpen(false);
      setConfirmPublishSelectedOpen(false);
      setSelectDialogOpen(false);
      setSelectedAdminIds(new Set());
      setLocalEdit(null);
      const message =
        input.targetAdminIds && input.targetAdminIds.length > 0
          ? `Published to ${input.targetAdminIds.length} admin${input.targetAdminIds.length === 1 ? "" : "s"}.`
          : "Published to all admins.";
      toast.success(message);
      void queryClient.invalidateQueries({ queryKey: queryKeys.terms.superadmin() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.terms.acceptances() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.terms.history() });
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, "Could not publish Terms & Conditions."));
    },
  });

  const toggleAdminSelection = (adminId: string) => {
    setSelectedAdminIds((prev) => {
      const next = new Set(prev);
      if (next.has(adminId)) next.delete(adminId);
      else next.add(adminId);
      return next;
    });
  };

  const openSelectDialog = () => {
    setSelectedAdminIds(new Set());
    setSelectDialogOpen(true);
  };

  const selectedList = Array.from(selectedAdminIds);

  return (
    <div className="mx-auto max-w-5xl px-6 py-8 md:px-10">
      <PageHeader
        title="Terms & Conditions"
        subtitle="Author the agreement venue admins must accept before using the platform. Save drafts privately; publish to push to admins."
      >
        <TermsHistoryDialog />
      </PageHeader>

      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="text-foreground">Latest published:</span>
          {publishedVersion != null ? (
            <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
              v{publishedVersion}
            </Badge>
          ) : (
            <Badge variant="outline">None yet</Badge>
          )}
        </div>
        <span className="hidden text-muted-foreground/50 sm:inline">·</span>
        <span>
          Next publish will be{" "}
          <strong className="font-medium text-foreground">v{nextVersion}</strong>.
        </span>
        {dirty ? (
          <>
            <span className="hidden text-muted-foreground/50 sm:inline">·</span>
            <span className="text-amber-700">Unsaved changes in draft.</span>
          </>
        ) : null}
      </div>

      <Tabs value={mode} onValueChange={(value) => setMode(value as "edit" | "preview")}>
        <TabsList className="mb-3">
          <TabsTrigger value="edit">Edit</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>
        <TabsContent value="edit">
          {isLoading || !hydrated ? (
            <div className="min-h-[320px] rounded-lg border border-input bg-muted/40" />
          ) : (
            <TermsEditor value={draftHtml} onChange={(html) => setLocalEdit(html)} />
          )}
        </TabsContent>
        <TabsContent value="preview">
          <div className="min-h-[320px] rounded-lg border border-border bg-card p-6">
            <TermsHtmlView
              html={draftHtml}
              emptyMessage="Nothing to preview yet. Switch to Edit and start typing."
            />
          </div>
        </TabsContent>
      </Tabs>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="outline"
          onClick={() => saveDraft.mutate()}
          disabled={!hydrated || saveDraft.isPending || !dirty}
        >
          {saveDraft.isPending ? "Saving…" : "Save draft"}
        </Button>
        <Button
          variant="outline"
          onClick={openSelectDialog}
          disabled={!hydrated || publish.isPending || !publishableChange}
        >
          <Users className="mr-2 h-4 w-4" />
          Publish to selected admins…
        </Button>
        <Button
          onClick={() => setConfirmPublishAllOpen(true)}
          disabled={!hydrated || publish.isPending || !publishableChange}
        >
          <Send className="mr-2 h-4 w-4" />
          Publish to all
        </Button>
      </div>

      <div className="mt-10">
        <AdminAcceptanceTable />
      </div>

      <Dialog
        open={confirmPublishAllOpen}
        onOpenChange={(open) => {
          if (!open && !publish.isPending) setConfirmPublishAllOpen(false);
        }}
      >
        <DialogContent linkDescription>
          <DialogHeader>
            <DialogTitle>Publish v{nextVersion} to all admins?</DialogTitle>
            <DialogDescription>
              Every active admin — including those who already accepted earlier versions — will
              need to re-accept these Terms & Conditions before they can use the app. Admins who
              decline will be locked out until you reset their response.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmPublishAllOpen(false)}
              disabled={publish.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => publish.mutate({ targetAdminIds: null })}
              disabled={publish.isPending}
            >
              {publish.isPending ? "Publishing…" : `Publish v${nextVersion} to all`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={selectDialogOpen}
        onOpenChange={(open) => {
          if (!open && !publish.isPending) setSelectDialogOpen(false);
        }}
      >
        <DialogContent linkDescription>
          <DialogHeader>
            <DialogTitle>Publish v{nextVersion} to selected admins</DialogTitle>
            <DialogDescription>
              Only the admins you select will be prompted to re-accept. Everyone else keeps using
              whatever they already accepted.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-border bg-card p-2">
            {adminOptions.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">
                No active admins to choose from.
              </p>
            ) : (
              adminOptions.map((admin) => {
                const checked = selectedAdminIds.has(admin.id);
                return (
                  <label
                    key={admin.id}
                    className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleAdminSelection(admin.id)}
                      className="h-4 w-4 rounded border-input"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{admin.name}</p>
                      {admin.email ? (
                        <p className="truncate text-xs text-muted-foreground">{admin.email}</p>
                      ) : null}
                    </div>
                    {admin.applicable_version != null ? (
                      <Badge variant="outline" className="font-mono text-[10px]">
                        v{admin.applicable_version}
                      </Badge>
                    ) : null}
                  </label>
                );
              })
            )}
          </div>

          <DialogFooter className="sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground">
              {selectedList.length} selected
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => setSelectDialogOpen(false)}
                disabled={publish.isPending}
              >
                Cancel
              </Button>
              <Button
                onClick={() => setConfirmPublishSelectedOpen(true)}
                disabled={publish.isPending || selectedList.length === 0}
              >
                Continue…
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={confirmPublishSelectedOpen}
        onOpenChange={(open) => {
          if (!open && !publish.isPending) setConfirmPublishSelectedOpen(false);
        }}
      >
        <DialogContent linkDescription>
          <DialogHeader>
            <DialogTitle>
              Publish v{nextVersion} to {selectedList.length} admin
              {selectedList.length === 1 ? "" : "s"}?
            </DialogTitle>
            <DialogDescription>
              The selected admins will be prompted to re-accept these Terms & Conditions before
              they can use the app. Admins not selected keep their previously accepted version
              unchanged. Admins who decline will be locked out until you reset their response.
            </DialogDescription>
          </DialogHeader>

          {selectedList.length > 0 ? (
            <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
              <ul className="space-y-1">
                {adminOptions
                  .filter((admin) => selectedAdminIds.has(admin.id))
                  .map((admin) => (
                    <li key={admin.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{admin.name}</span>
                      {admin.email ? (
                        <span className="truncate text-xs text-muted-foreground">
                          {admin.email}
                        </span>
                      ) : null}
                    </li>
                  ))}
              </ul>
            </div>
          ) : null}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmPublishSelectedOpen(false)}
              disabled={publish.isPending}
            >
              Back
            </Button>
            <Button
              onClick={() => publish.mutate({ targetAdminIds: selectedList })}
              disabled={publish.isPending}
            >
              {publish.isPending
                ? "Publishing…"
                : `Publish v${nextVersion} to ${selectedList.length} admin${selectedList.length === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

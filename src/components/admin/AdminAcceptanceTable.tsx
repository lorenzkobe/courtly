"use client";

import { format } from "date-fns";
import { RefreshCw, RotateCcw } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { apiErrorMessage } from "@/lib/api/api-error-message";
import { courtlyApi } from "@/lib/api/courtly-client";
import { queryKeys } from "@/lib/query/query-keys";

type AcceptanceStatus = "accepted" | "rejected" | "pending";

function statusBadge(status: AcceptanceStatus, hasApplicable: boolean) {
  if (!hasApplicable) {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        Not targeted
      </Badge>
    );
  }
  if (status === "accepted") {
    return (
      <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
        Accepted
      </Badge>
    );
  }
  if (status === "rejected") {
    return (
      <Badge className="bg-red-100 text-red-700 hover:bg-red-100">Declined</Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Pending
    </Badge>
  );
}

export default function AdminAcceptanceTable() {
  const queryClient = useQueryClient();
  const [resetTarget, setResetTarget] = useState<
    | { adminId: string; name: string; version: number | null }
    | null
  >(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: queryKeys.terms.acceptances(),
    queryFn: async () => {
      const { data: payload } = await courtlyApi.superadminTerms.acceptances();
      return payload;
    },
    staleTime: 30_000,
  });

  const resetMutation = useMutation({
    mutationFn: async (adminId: string) => {
      await courtlyApi.superadminTerms.resetAcceptance(adminId);
    },
    onSuccess: () => {
      toast.success("Response cleared. The admin will see the gate again on next login.");
      void queryClient.invalidateQueries({ queryKey: queryKeys.terms.acceptances() });
      setResetTarget(null);
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, "Could not reset response."));
    },
  });

  const rows = data?.rows ?? [];
  const latestVersion = data?.latest_version ?? null;

  return (
    <div className="rounded-xl border border-border/60 bg-card">
      <div className="flex flex-col gap-3 border-b border-border/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-heading text-lg font-semibold">Admin responses</h2>
          <p className="text-sm text-muted-foreground">
            {latestVersion != null
              ? `Latest published version is v${latestVersion}. Each admin's row shows the version that currently applies to them.`
              : "Publish a version to start tracking admin responses."}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void refetch();
          }}
          disabled={isFetching}
        >
          <RefreshCw
            className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`}
          />
          {isFetching ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Admin</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Applicable</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last accepted</TableHead>
            <TableHead>Responded</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? (
            <TableRow>
              <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                Loading admin responses…
              </TableCell>
            </TableRow>
          ) : rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                No active admins yet.
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row) => {
              const hasApplicable = row.applicable_version != null;
              return (
                <TableRow key={row.admin_id}>
                  <TableCell className="font-medium">
                    {row.full_name || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{row.email || "—"}</TableCell>
                  <TableCell>
                    {hasApplicable ? (
                      <Badge variant="outline" className="font-mono text-xs">
                        v{row.applicable_version}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>{statusBadge(row.status, hasApplicable)}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.last_accepted_version != null ? (
                      <span
                        className="flex flex-col leading-tight"
                        title={
                          row.last_accepted_at
                            ? format(new Date(row.last_accepted_at), "PPpp")
                            : undefined
                        }
                      >
                        <Badge variant="outline" className="w-fit font-mono text-xs">
                          v{row.last_accepted_version}
                        </Badge>
                        {row.last_accepted_at ? (
                          <span className="mt-1 text-[11px]">
                            {format(new Date(row.last_accepted_at), "MMM d, yyyy")}
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Never</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.responded_at
                      ? format(new Date(row.responded_at), "MMM d, yyyy · h:mm a")
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {hasApplicable && row.status !== "pending" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setResetTarget({
                            adminId: row.admin_id,
                            name: row.full_name || row.email || "this admin",
                            version: row.applicable_version,
                          })
                        }
                      >
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                        Reset
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })
          )}
        </TableBody>
      </Table>

      <Dialog
        open={!!resetTarget}
        onOpenChange={(open) => {
          if (!open && !resetMutation.isPending) setResetTarget(null);
        }}
      >
        <DialogContent linkDescription>
          <DialogHeader>
            <DialogTitle>Reset response?</DialogTitle>
            <DialogDescription>
              {resetTarget
                ? `Clearing ${resetTarget.name}'s response for v${resetTarget.version} will let them accept or decline again on next login.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setResetTarget(null)}
              disabled={resetMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (resetTarget) resetMutation.mutate(resetTarget.adminId);
              }}
              disabled={resetMutation.isPending}
            >
              {resetMutation.isPending ? "Resetting…" : "Reset response"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

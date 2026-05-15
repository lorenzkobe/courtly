"use client";

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronDown, History, Users } from "lucide-react";
import { useState } from "react";
import TermsHtmlView from "@/components/admin/TermsHtmlView";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { courtlyApi } from "@/lib/api/courtly-client";
import { queryKeys } from "@/lib/query/query-keys";
import { cn } from "@/lib/utils";

export default function TermsHistoryDialog() {
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.terms.history(),
    queryFn: async () => {
      const { data: payload } = await courtlyApi.superadminTerms.history();
      return payload;
    },
    enabled: open,
    staleTime: 30_000,
  });

  const versions = data?.versions ?? [];

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <History className="mr-2 h-4 w-4" />
        Version history
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setExpandedId(null);
        }}
      >
        <DialogContent linkDescription className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Terms & Conditions history</DialogTitle>
            <DialogDescription>
              Every published version, newest first. Click a version to expand its content and
              see the admins it targeted.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {isLoading ? (
              <p className="rounded-lg border border-border bg-muted/40 px-4 py-8 text-center text-sm text-muted-foreground">
                Loading history…
              </p>
            ) : versions.length === 0 ? (
              <p className="rounded-lg border border-border bg-muted/40 px-4 py-8 text-center text-sm text-muted-foreground">
                No versions published yet.
              </p>
            ) : (
              versions.map((version) => {
                const expanded = expandedId === version.id;
                const isTargeted = version.target_admin_ids !== null;
                const targetCount = version.target_admin_ids?.length ?? null;
                return (
                  <div
                    key={version.id}
                    className="overflow-hidden rounded-lg border border-border bg-card"
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : version.id)}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                          v{version.version}
                        </Badge>
                        {isTargeted ? (
                          <Badge variant="outline" className="text-amber-700">
                            <Users className="mr-1 h-3 w-3" />
                            {targetCount} admin{targetCount === 1 ? "" : "s"}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            All admins
                          </Badge>
                        )}
                        <span className="text-sm text-muted-foreground">
                          {version.published_at
                            ? format(
                                new Date(version.published_at),
                                "MMM d, yyyy · h:mm a",
                              )
                            : "—"}
                        </span>
                        {version.published_by_name ? (
                          <span className="text-xs text-muted-foreground">
                            by {version.published_by_name}
                          </span>
                        ) : null}
                      </div>
                      <ChevronDown
                        className={cn(
                          "h-4 w-4 text-muted-foreground transition-transform",
                          expanded && "rotate-180",
                        )}
                      />
                    </button>

                    {expanded ? (
                      <div className="space-y-3 border-t border-border bg-background/50 px-4 py-4">
                        {isTargeted && version.target_admin_names &&
                        version.target_admin_names.length > 0 ? (
                          <div>
                            <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              Targeted admins
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              {version.target_admin_names.map((admin) => (
                                <Badge
                                  key={admin.admin_id}
                                  variant="outline"
                                  className="font-normal"
                                >
                                  {admin.name}
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ) : null}

                        <div>
                          <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Content
                          </p>
                          <div className="rounded-lg border border-border bg-card p-4">
                            <TermsHtmlView
                              html={version.content_html}
                              emptyMessage="This version was published with empty content."
                            />
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

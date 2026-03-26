"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { ArrowLeft, Flag, Star, Trash2 } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { useState } from "react";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import PageHeader from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { courtlyApi } from "@/lib/api/courtly-client";
import { cn } from "@/lib/utils";

export default function SuperadminModerationPage() {
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState<{
    courtId: string;
    reviewId: string;
  } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["flagged-reviews"],
    queryFn: async () => {
      const { data: res } = await courtlyApi.flaggedReviews.list();
      return res;
    },
  });

  const reviews = data?.reviews ?? [];

  const clearFlagMut = useMutation({
    mutationFn: async (p: { courtId: string; reviewId: string }) => {
      await courtlyApi.courtReviews.update(p.courtId, p.reviewId, {
        clear_flag: true,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["flagged-reviews"] });
      void queryClient.invalidateQueries({ queryKey: ["court-reviews"] });
      toast.success("Flag cleared");
    },
  });

  const deleteReviewMut = useMutation({
    mutationFn: async (p: { courtId: string; reviewId: string }) => {
      await courtlyApi.courtReviews.remove(p.courtId, p.reviewId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["flagged-reviews"] });
      void queryClient.invalidateQueries({ queryKey: ["court-reviews"] });
      void queryClient.invalidateQueries({ queryKey: ["courts"] });
      toast.success("Review removed");
    },
  });

  return (
    <div className="mx-auto max-w-4xl px-6 py-8 md:px-10">
      <ConfirmDialog
        open={!!confirmDelete}
        onOpenChange={(open) => {
          if (!open) setConfirmDelete(null);
        }}
        title="Delete flagged review?"
        description="This permanently removes the review."
        confirmLabel="Delete review"
        isPending={deleteReviewMut.isPending}
        onConfirm={() => {
          if (!confirmDelete) return;
          deleteReviewMut.mutate(confirmDelete);
          setConfirmDelete(null);
        }}
      />
      <Button variant="ghost" className="mb-4 -ml-2 text-muted-foreground" asChild>
        <Link href="/superadmin">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Platform overview
        </Link>
      </Button>

      <PageHeader
        title="Flagged reviews"
        subtitle="Court admins report reviews here for your team to check. You can clear a flag after reviewing, or delete the review if it violates policy."
      />

      {isLoading ? (
        <Skeleton className="h-40 w-full rounded-xl" />
      ) : reviews.length === 0 ? (
        <Card className="border-border/60">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            No flagged reviews right now.
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-4">
          {reviews.map((r) => (
            <li key={r.id}>
              <Card className="border-amber-500/25 bg-amber-500/5">
                <CardContent className="space-y-3 p-5 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Flag className="h-4 w-4 text-amber-700 dark:text-amber-400" />
                        <span className="font-heading font-semibold text-foreground">
                          {r.court_name}
                        </span>
                        <Badge variant="outline" className="text-[10px]">
                          Flagged
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Reported{" "}
                        {r.flagged_at
                          ? format(new Date(r.flagged_at), "PPp")
                          : "—"}
                      </p>
                      {r.flag_reason ? (
                        <p className="mt-2 rounded-md border border-border/60 bg-background/80 px-2 py-1.5 text-xs">
                          <span className="font-medium text-foreground">
                            Venue note:{" "}
                          </span>
                          {r.flag_reason}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={clearFlagMut.isPending}
                        onClick={() =>
                          clearFlagMut.mutate({
                            courtId: r.court_id,
                            reviewId: r.id,
                          })
                        }
                      >
                        Clear flag
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={deleteReviewMut.isPending}
                        onClick={() =>
                          setConfirmDelete({
                            courtId: r.court_id,
                            reviewId: r.id,
                          })
                        }
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        Delete review
                      </Button>
                    </div>
                  </div>
                  <div className="border-t border-border/50 pt-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: 5 }, (_, i) => (
                          <Star
                            key={i}
                            className={cn(
                              "h-4 w-4",
                              i < r.rating
                                ? "fill-amber-400 text-amber-400"
                                : "text-muted-foreground/25",
                            )}
                          />
                        ))}
                      </div>
                      <span className="font-medium text-foreground">
                        {r.user_name}
                      </span>
                    </div>
                    {r.comment ? (
                      <p className="mt-2 text-foreground/90">{r.comment}</p>
                    ) : null}
                    <p className="mt-2 text-xs text-muted-foreground">
                      Posted {format(new Date(r.created_at), "PP")}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

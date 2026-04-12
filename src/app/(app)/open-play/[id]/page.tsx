"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { formatDistanceToNowStrict } from "date-fns";
import {
  ArrowLeft,
  Calendar,
  Clock,
  ExternalLink,
  MapPin,
  MessageCircle,
  MoreVertical,
  Pencil,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import PageHeader from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { apiErrorMessage } from "@/lib/api/api-error-message";
import { courtlyApi } from "@/lib/api/courtly-client";
import { formatTimeShort } from "@/lib/booking-range";
import { formatAmenityLabel } from "@/lib/format-amenity";
import { formatPhp, formatPhpCompact } from "@/lib/format-currency";
import { useAuth } from "@/lib/auth/auth-context";
import { isOpenPlayCommentWithinEditWindow } from "@/lib/open-play/open-play-comment-edit";
import {
  openPlayDisplayStatus,
  openPlayDisplayStatusLabel,
} from "@/lib/open-play/lifecycle";
import { useOpenPlayDetailRealtime } from "@/lib/open-play/use-open-play-detail-realtime";
import { isOpenPlayJoinableBySchedule } from "@/lib/open-play/schedule";
import { PAYMENT_PROOF_CANONICAL_MIME_TYPE } from "@/lib/payments/payment-proof-constraints";
import { queryKeys } from "@/lib/query/query-keys";
import type { Court } from "@/lib/types/courtly";
import { cn, formatStatusLabel } from "@/lib/utils";

function StarRow({ rating, className }: { rating: number; className?: string }) {
  const filled = Math.round(rating);
  return (
    <div className={cn("flex items-center gap-0.5", className)} aria-hidden>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={cn(
            "h-4 w-4 shrink-0",
            i < filled ? "fill-amber-400 text-amber-400" : "text-muted-foreground/25",
          )}
        />
      ))}
    </div>
  );
}

function courtMapHref(court: Court | null | undefined): string {
  if (!court) return "#";
  const hasPin =
    court.map_latitude != null &&
    court.map_longitude != null &&
    Number.isFinite(court.map_latitude) &&
    Number.isFinite(court.map_longitude);
  if (hasPin) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
      `${court.map_latitude},${court.map_longitude}`,
    )}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(court.location)}`;
}

function joinRequestStatusLabel(
  status: string | undefined | null,
): string {
  switch (status) {
    case "waitlisted":
      return "On waitlist";
    case "payment_locked":
      return "Payment slot locked";
    case "pending_approval":
      return "Payment proof pending review";
    case "approved":
      return "Approved";
    case "denied":
      return "Denied";
    case "expired":
      return "Expired — you can try again";
    case "cancelled":
      return "Cancelled";
    default:
      return "Not joined yet";
  }
}

const lifecycleBadgeStyles: Record<string, string> = {
  open: "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-100",
  started: "border-primary/25 bg-primary/10 text-primary",
  closed: "bg-muted text-muted-foreground border-border",
  cancelled: "border-destructive/30 bg-destructive/10 text-destructive",
};

export default function OpenPlayDetailPage() {
  const params = useParams<{ id: string }>();
  const sessionId = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  useOpenPlayDetailRealtime(sessionId, user?.id ?? null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [hostOptionsOpen, setHostOptionsOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"gcash" | "maya">("gcash");
  const [joinNote, setJoinNote] = useState("");
  const [proofDataUrl, setProofDataUrl] = useState<string | null>(null);
  const [proofBytes, setProofBytes] = useState(0);
  const [proofWidth, setProofWidth] = useState(0);
  const [proofHeight, setProofHeight] = useState(0);
  const [commentDraft, setCommentDraft] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [organizerNote, setOrganizerNote] = useState("");
  const [clientNowMs, setClientNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setClientNowMs(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.openPlay.detail(sessionId),
    queryFn: async () => {
      const { data } = await courtlyApi.openPlay.get(sessionId);
      return data;
    },
    enabled: !!sessionId,
  });

  const venueId = data?.court?.venue_id;
  const { data: venueReviewBundle, isLoading: loadingVenueReviews } = useQuery({
    queryKey: ["open-play-venue-reviews", venueId],
    queryFn: async () => {
      const { data: bundle } = await courtlyApi.venueReviews.bundle(venueId!);
      return bundle;
    },
    enabled: Boolean(venueId),
  });

  const reviewsSummaryLine = useMemo(() => {
    const courtRow = data?.court;
    const reviews = venueReviewBundle?.reviews ?? [];
    if (courtRow?.review_summary && courtRow.review_summary.review_count > 0) {
      return {
        average: courtRow.review_summary.average_rating,
        count: courtRow.review_summary.review_count,
      };
    }
    if (reviews.length > 0) {
      const sum = reviews.reduce((acc, r) => acc + r.rating, 0);
      return { average: sum / reviews.length, count: reviews.length };
    }
    return null;
  }, [data?.court, venueReviewBundle?.reviews]);

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.openPlay.detail(sessionId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.openPlay.all() });
  };

  const joinMutation = useMutation({
    mutationFn: async () =>
      courtlyApi.openPlay.join(sessionId, { join_note: joinNote.trim() || undefined }),
    onSuccess: () => {
      toast.success("Added to waitlist.");
      refresh();
    },
    onError: () => toast.error("Could not join waitlist."),
  });

  const lockMutation = useMutation({
    mutationFn: async () => courtlyApi.openPlay.acquirePaymentLock(sessionId),
    onSuccess: ({ data: payload }) => {
      if (payload.result === "full") {
        toast.error("Slots are currently full.");
      } else if (payload.result === "locked") {
        toast.success("Slot locked. Submit payment proof before it expires.");
      } else if (payload.result === "already_active") {
        toast.message("You already have an active payment step.");
      }
      refresh();
    },
    onError: () => toast.error("Could not continue to payment."),
  });

  const submitProofMutation = useMutation({
    mutationFn: async () => {
      if (!proofDataUrl) throw new Error("missing proof");
      return courtlyApi.openPlay.submitProof(sessionId, {
        payment_method: paymentMethod,
        payment_proof_data_url: proofDataUrl,
        payment_proof_mime_type: PAYMENT_PROOF_CANONICAL_MIME_TYPE,
        payment_proof_bytes: proofBytes,
        payment_proof_width: proofWidth,
        payment_proof_height: proofHeight,
        join_note: joinNote.trim() || undefined,
      });
    },
    onSuccess: () => {
      toast.success("Payment proof sent for organizer review.");
      refresh();
    },
    onError: () => toast.error("Could not submit payment proof."),
  });

  const commentMutation = useMutation({
    mutationFn: async () =>
      courtlyApi.openPlay.addComment(sessionId, { comment: commentDraft.trim() }),
    onSuccess: () => {
      setCommentDraft("");
      refresh();
    },
    onError: () => toast.error("Could not add comment."),
  });

  const updateCommentMutation = useMutation({
    mutationFn: async (payload: { commentId: string; text: string }) =>
      courtlyApi.openPlay.updateComment(sessionId, payload.commentId, {
        comment: payload.text,
      }),
    onSuccess: () => {
      setEditingCommentId(null);
      setEditDraft("");
      refresh();
    },
    onError: (err: unknown) =>
      toast.error(apiErrorMessage(err, "Could not update comment.")),
  });

  const approveMutation = useMutation({
    mutationFn: async (requestId: string) =>
      courtlyApi.openPlay.approveRequest(sessionId, requestId, {
        organizer_note: organizerNote.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success("Join request approved.");
      refresh();
    },
    onError: () => toast.error("Could not approve request."),
  });

  const denyMutation = useMutation({
    mutationFn: async (requestId: string) =>
      courtlyApi.openPlay.denyRequest(sessionId, requestId, {
        organizer_note: organizerNote.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success("Join request denied.");
      refresh();
    },
    onError: () => toast.error("Could not deny request."),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => courtlyApi.openPlay.delete(sessionId),
    onSuccess: () => {
      toast.success("Open play deleted.");
      void queryClient.invalidateQueries({ queryKey: queryKeys.openPlay.all() });
      router.push("/open-play");
    },
    onError: () => toast.error("Could not delete open play."),
  });

  const myRequest = data?.my_request;
  const lockTimeLabel = myRequest?.payment_lock_expires_at
    ? formatDistanceToNowStrict(new Date(myRequest.payment_lock_expires_at), {
        addSuffix: true,
      })
    : null;

  if (isLoading || !data) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 px-6 py-8 md:px-10">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const { session, court } = data;
  const lifecycleDisplay = openPlayDisplayStatus(
    session,
    clientNowMs,
    data.counts.approved,
  );
  const lifecycleLabel = openPlayDisplayStatusLabel(lifecycleDisplay);
  const joinableByTime = isOpenPlayJoinableBySchedule(session, clientNowMs);

  const isHost = Boolean(user?.id && session.host_user_id === user.id);
  const canPayNow = myRequest?.status === "payment_locked";
  const onWaitlist =
    myRequest?.status === "waitlisted" ||
    myRequest?.status === "expired" ||
    myRequest?.status === "denied";

  const canAttemptNewJoin =
    joinableByTime &&
    lifecycleDisplay === "open" &&
    session.status !== "cancelled" &&
    session.status !== "full";

  const mapOpenHref = courtMapHref(court);
  const hasMapPin = Boolean(
    court &&
      court.map_latitude != null &&
      court.map_longitude != null &&
      Number.isFinite(court.map_latitude) &&
      Number.isFinite(court.map_longitude),
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-6 py-8 md:px-10">
      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title="Delete this open play?"
        description="This removes the session and related join requests. This cannot be undone."
        confirmLabel="Delete"
        isPending={deleteMutation.isPending}
        onConfirm={() => {
          deleteMutation.mutate();
        }}
      />
      <Button
        variant="ghost"
        className="mb-2 -ml-2 text-muted-foreground"
        asChild
      >
        <Link href="/open-play">
          <ArrowLeft className="mr-2 h-4 w-4" /> Open play
        </Link>
      </Button>
      <PageHeader
        title={session.title}
        subtitle={`${session.venue_name ?? "Venue"} · ${session.court_name ?? "Court"}`}
        alignActions="start"
      >
        {isHost ? (
          <Popover open={hostOptionsOpen} onOpenChange={setHostOptionsOpen}>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                aria-label="Open play options"
                disabled={deleteMutation.isPending}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-52 p-1" align="end" sideOffset={8}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-destructive outline-none transition-colors hover:bg-destructive/10 focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => {
                  setHostOptionsOpen(false);
                  setConfirmDeleteOpen(true);
                }}
              >
                <Trash2 className="h-4 w-4 shrink-0" />
                Delete open play
              </button>
            </PopoverContent>
          </Popover>
        ) : null}
      </PageHeader>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
        <div className="min-w-0 space-y-6">
      <Card className="border-border/50">
        <CardContent className="space-y-3 p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={cn(lifecycleBadgeStyles[lifecycleDisplay] ?? "")}
            >
              {lifecycleLabel}
            </Badge>
            {session.status === "full" ? (
              <Badge variant="outline" className="border-destructive/30 text-destructive">
                Full
              </Badge>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              {format(new Date(`${session.date}T12:00:00`), "EEE, MMM d, yyyy")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 shrink-0" />
              {formatTimeShort(session.start_time)} – {formatTimeShort(session.end_time)}
            </span>
            <span>
              DUPR {session.dupr_min?.toFixed(2)} – {session.dupr_max?.toFixed(2)}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-sm">
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Users className="h-4 w-4" />
              {data.counts.approved}/{session.max_players} approved
            </span>
            <span className="font-semibold text-primary">
              {formatPhp(session.price_per_player)} / player
            </span>
            <span className="text-muted-foreground">Hosted by {session.host_name}</span>
          </div>
          {session.description ? (
            <p className="text-sm text-muted-foreground">{session.description}</p>
          ) : null}
        </CardContent>
      </Card>

      {!isHost ? (
        <Card className="border-border/50">
          <CardContent className="space-y-4 p-6">
            <h2 className="font-heading text-lg font-semibold">Join</h2>
            {session.status === "cancelled" ||
            (!myRequest &&
              (!joinableByTime ||
                lifecycleDisplay === "closed" ||
                lifecycleDisplay === "cancelled")) ? (
              <p className="text-sm text-muted-foreground">
                This session is no longer accepting joins.
              </p>
            ) : (
              <>
                <div className="space-y-1 text-sm">
                  <p className="text-muted-foreground">
                    Your status:{" "}
                    <span className="font-medium text-foreground">
                      {joinRequestStatusLabel(myRequest?.status)}
                    </span>
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="join-note">Note to organizer</Label>
                  <Textarea
                    id="join-note"
                    value={joinNote}
                    onChange={(event) => setJoinNote(event.target.value)}
                    placeholder="Optional note for the host"
                    rows={3}
                    disabled={
                      myRequest != null &&
                      !(
                        myRequest.status === "waitlisted" ||
                        myRequest.status === "expired" ||
                        myRequest.status === "denied" ||
                        myRequest.status === "payment_locked"
                      )
                    }
                  />
                </div>

                {!myRequest ? (
                  <Button
                    onClick={() => joinMutation.mutate()}
                    disabled={
                      joinMutation.isPending ||
                      session.status === "full" ||
                      !canAttemptNewJoin
                    }
                  >
                    {joinMutation.isPending ? "Joining…" : "Join waitlist"}
                  </Button>
                ) : null}

                {onWaitlist && !canPayNow ? (
                  <Button
                    onClick={() => lockMutation.mutate()}
                    disabled={
                      lockMutation.isPending ||
                      session.status === "full" ||
                      !joinableByTime
                    }
                  >
                    {lockMutation.isPending ? "Please wait…" : "Continue to payment"}
                  </Button>
                ) : null}

                {myRequest?.status === "pending_approval" ? (
                  <p className="text-sm text-muted-foreground">
                    Your payment proof is with the host. You will see updates here.
                  </p>
                ) : null}

                {myRequest?.status === "approved" ? (
                  <p className="text-sm text-muted-foreground">
                    You are approved for this open play. See you on court.
                  </p>
                ) : null}

                {canPayNow ? (
                  <div className="space-y-3 rounded-md border border-border/70 p-4">
                    <p className="inline-flex items-center gap-2 text-sm text-amber-600">
                      <Clock className="h-4 w-4" />
                      Submit proof {lockTimeLabel ? `— lock expires ${lockTimeLabel}` : ""}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label>Payment method</Label>
                        <select
                          className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                          value={paymentMethod}
                          onChange={(event) =>
                            setPaymentMethod(event.target.value as "gcash" | "maya")
                          }
                        >
                          {session.accepts_gcash ? <option value="gcash">GCash</option> : null}
                          {session.accepts_maya ? <option value="maya">Maya</option> : null}
                        </select>
                      </div>
                      <div className="space-y-1">
                        <Label>Payment proof (JPEG)</Label>
                        <Input
                          type="file"
                          accept="image/jpeg"
                          onChange={(event) => {
                            const file = event.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = () => {
                              const src = String(reader.result ?? "");
                              const image = new Image();
                              image.onload = () => {
                                setProofDataUrl(src);
                                setProofBytes(file.size);
                                setProofWidth(image.width);
                                setProofHeight(image.height);
                              };
                              image.src = src;
                            };
                            reader.readAsDataURL(file);
                          }}
                        />
                      </div>
                    </div>
                    <Button
                      onClick={() => submitProofMutation.mutate()}
                      disabled={submitProofMutation.isPending || !proofDataUrl}
                    >
                      Submit payment proof
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card className="border-border/50">
          <CardContent className="space-y-2 p-6">
            <h2 className="font-heading text-lg font-semibold">Hosting</h2>
            <p className="text-sm text-muted-foreground">
              You created this open play. Manage join requests below and from{" "}
              <Link href="/open-play" className="font-medium text-primary underline-offset-4 hover:underline">
                Open Play
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      )}

      <Card className="border-border/50">
        <CardContent className="space-y-4 p-6">
          <h2 className="inline-flex items-center gap-2 font-heading text-lg font-semibold">
            <MessageCircle className="h-5 w-5" />
            Comments
          </h2>
          <div className="space-y-3">
            {data.comments.map((comment) => {
              const isAuthor = Boolean(user?.id && user.id === comment.user_id);
              const canEdit =
                isAuthor &&
                isOpenPlayCommentWithinEditWindow(comment.created_at, clientNowMs);
              const isEditing = editingCommentId === comment.id;
              const postedLabel = format(
                new Date(comment.created_at),
                "MMM d, yyyy · h:mm a",
              );
              return (
                <div key={comment.id} className="rounded-md border border-border/70 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{comment.user_name ?? "Player"}</p>
                      <p className="text-xs text-muted-foreground">
                        {postedLabel}
                        {comment.edited_at ? (
                          <span className="text-muted-foreground"> · Edited</span>
                        ) : null}
                      </p>
                    </div>
                    {canEdit && !isEditing ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 shrink-0 px-2"
                        onClick={() => {
                          setEditingCommentId(comment.id);
                          setEditDraft(comment.comment);
                        }}
                        aria-label="Edit comment"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                  {isEditing ? (
                    <div className="mt-2 space-y-2">
                      <Textarea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        rows={3}
                        className="min-h-18 resize-y"
                        disabled={updateCommentMutation.isPending}
                      />
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={
                            updateCommentMutation.isPending || !editDraft.trim()
                          }
                          onClick={() =>
                            updateCommentMutation.mutate({
                              commentId: comment.id,
                              text: editDraft.trim(),
                            })
                          }
                        >
                          Save
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={updateCommentMutation.isPending}
                          onClick={() => {
                            setEditingCommentId(null);
                            setEditDraft("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">{comment.comment}</p>
                  )}
                </div>
              );
            })}
          </div>
          <div className="flex gap-2">
            <Input
              value={commentDraft}
              onChange={(event) => setCommentDraft(event.target.value)}
              placeholder="Write a comment"
            />
            <Button
              variant="outline"
              onClick={() => commentMutation.mutate()}
              disabled={commentMutation.isPending || !commentDraft.trim()}
            >
              Send
            </Button>
          </div>
        </CardContent>
      </Card>

      {data.pending_requests && data.pending_requests.length > 0 ? (
        <Card className="border-border/50">
          <CardContent className="space-y-4 p-6">
            <h2 className="font-heading text-lg font-semibold">Organizer approvals</h2>
            <div className="space-y-3">
              {data.pending_requests.map((request) => (
                <div key={request.id} className="rounded-md border border-border/70 p-3">
                  <p className="text-sm font-medium">{request.user_name ?? request.user_id}</p>
                  <p className="text-xs text-muted-foreground">
                    Status: {request.status}
                    {typeof request.user_dupr_rating === "number"
                      ? ` · DUPR ${request.user_dupr_rating.toFixed(2)}`
                      : ""}
                  </p>
                  {request.join_note ? (
                    <p className="mt-1 text-sm text-muted-foreground">{request.join_note}</p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => approveMutation.mutate(request.id)}
                      disabled={approveMutation.isPending}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => denyMutation.mutate(request.id)}
                      disabled={denyMutation.isPending}
                    >
                      Deny
                    </Button>
                  </div>
                </div>
              ))}
            </div>
            <div className="space-y-1">
              <Label htmlFor="organizer-note">Organizer note (applies to next action)</Label>
              <Textarea
                id="organizer-note"
                value={organizerNote}
                onChange={(event) => setOrganizerNote(event.target.value)}
                rows={2}
              />
            </div>
          </CardContent>
        </Card>
      ) : null}
        </div>

        {court ? (
          <aside className="min-w-0 lg:sticky lg:top-6 lg:self-start">
            <Card className="border-border/50">
              <CardHeader className="pb-2">
                <CardTitle className="font-heading text-lg">Court details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6 pb-6">
                {court.description ? (
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {court.description}
                  </p>
                ) : null}
                <dl className="grid gap-4 text-sm sm:grid-cols-2">
                  <div>
                    <dt className="text-muted-foreground">Type</dt>
                    <dd className="mt-0.5 text-foreground">{formatStatusLabel(court.type)}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Surface</dt>
                    <dd className="mt-0.5 text-foreground">
                      {formatAmenityLabel(court.surface)}
                    </dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-muted-foreground">Rates by time</dt>
                    <dd className="mt-1 space-y-1 font-medium text-foreground">
                      {(court.hourly_rate_windows ?? []).length > 0 ? (
                        (court.hourly_rate_windows ?? []).map((rateWindow) => (
                          <div
                            key={`${rateWindow.start}-${rateWindow.end}-${rateWindow.hourly_rate}`}
                          >
                            {formatTimeShort(rateWindow.start)} –{" "}
                            {formatTimeShort(rateWindow.end)}:{" "}
                            {formatPhpCompact(rateWindow.hourly_rate)}/hr
                          </div>
                        ))
                      ) : (
                        <span className="font-normal text-muted-foreground">—</span>
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Contact</dt>
                    <dd className="mt-0.5 font-medium text-foreground">
                      {court.contact_phone ?? "—"}
                    </dd>
                  </div>
                  {court.facebook_url || court.instagram_url ? (
                    <div>
                      <dt className="text-muted-foreground">Links</dt>
                      <dd className="mt-0.5 flex flex-wrap gap-2">
                        {court.facebook_url ? (
                          <a
                            href={court.facebook_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-muted/20 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-muted/40 hover:underline"
                          >
                            Facebook <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : null}
                        {court.instagram_url ? (
                          <a
                            href={court.instagram_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-md border border-border/70 bg-muted/20 px-2.5 py-1 text-xs font-medium text-primary transition-colors hover:bg-muted/40 hover:underline"
                          >
                            Instagram <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : null}
                      </dd>
                    </div>
                  ) : null}
                  <div className="sm:col-span-2">
                    <dt className="mb-2 text-muted-foreground">Amenities</dt>
                    <dd className="flex flex-wrap gap-1.5">
                      {court.amenities?.length ? (
                        court.amenities.map((amenity) => (
                          <Badge key={amenity} variant="outline" className="font-normal">
                            {formatAmenityLabel(amenity)}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </dd>
                  </div>
                </dl>

                <div className="space-y-3 border-t border-border/60 pt-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <h3 className="flex items-center gap-2 font-heading text-base font-semibold text-foreground">
                        <MapPin className="h-4 w-4 text-primary" aria-hidden />
                        Location
                      </h3>
                      <p className="text-sm text-foreground">{court.location}</p>
                      <p className="text-xs text-muted-foreground">
                        {hasMapPin
                          ? "Opens in Google Maps at the venue pin."
                          : "Opens in Google Maps using this address."}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="shrink-0 self-start sm:mt-7"
                      asChild
                    >
                      <a href={mapOpenHref} target="_blank" rel="noopener noreferrer">
                        Open in Map
                        <ExternalLink className="ml-1.5 h-3 w-3 opacity-70" />
                      </a>
                    </Button>
                  </div>
                </div>

                <div className="space-y-3 border-t border-border/60 pt-4">
                  <h3 className="font-heading text-base font-semibold text-foreground">
                    Reviews
                  </h3>
                  {loadingVenueReviews ? (
                    <div className="space-y-2">
                      <Skeleton className="h-8 w-56 rounded-lg" />
                    </div>
                  ) : (
                    <>
                      {reviewsSummaryLine ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <StarRow rating={reviewsSummaryLine.average} />
                          <span className="text-sm text-muted-foreground">
                            {reviewsSummaryLine.average.toFixed(1)} average ·{" "}
                            {reviewsSummaryLine.count}{" "}
                            {reviewsSummaryLine.count === 1 ? "rating" : "ratings"}
                          </span>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          No reviews yet. Leave one after a completed visit.
                        </p>
                      )}
                    </>
                  )}
                  {court.id ? (
                    <Button variant="outline" size="sm" className="w-full" asChild>
                      <Link href={`/courts/${court.id}/book`}>Book this venue</Link>
                    </Button>
                  ) : null}
                </div>
              </CardContent>
            </Card>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

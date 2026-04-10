"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { formatDistanceToNowStrict } from "date-fns";
import {
  Calendar,
  Clock,
  ExternalLink,
  MapPin,
  MessageCircle,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import PageHeader from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { courtlyApi } from "@/lib/api/courtly-client";
import { formatTimeShort } from "@/lib/booking-range";
import { formatAmenityLabel } from "@/lib/format-amenity";
import { formatPhp } from "@/lib/format-currency";
import { useAuth } from "@/lib/auth/auth-context";
import {
  isOpenPlayJoinableBySchedule,
  openPlaySchedulePhase,
  openPlaySchedulePhaseLabel,
} from "@/lib/open-play/schedule";
import { PAYMENT_PROOF_CANONICAL_MIME_TYPE } from "@/lib/payments/payment-proof-constraints";
import { queryKeys } from "@/lib/query/query-keys";
import type { Court } from "@/lib/types/courtly";
import { cn } from "@/lib/utils";

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

const scheduleBadgeStyles: Record<string, string> = {
  upcoming: "border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-100",
  in_progress: "border-primary/25 bg-primary/10 text-primary",
  ended: "bg-muted text-muted-foreground border-border",
  cancelled: "border-destructive/30 bg-destructive/10 text-destructive",
};

export default function OpenPlayDetailPage() {
  const params = useParams<{ id: string }>();
  const sessionId = params.id;
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [paymentMethod, setPaymentMethod] = useState<"gcash" | "maya">("gcash");
  const [joinNote, setJoinNote] = useState("");
  const [proofDataUrl, setProofDataUrl] = useState<string | null>(null);
  const [proofBytes, setProofBytes] = useState(0);
  const [proofWidth, setProofWidth] = useState(0);
  const [proofHeight, setProofHeight] = useState(0);
  const [commentDraft, setCommentDraft] = useState("");
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
    refetchInterval: 10_000,
  });

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

  const myRequest = data?.my_request;
  const lockTimeLabel = myRequest?.payment_lock_expires_at
    ? formatDistanceToNowStrict(new Date(myRequest.payment_lock_expires_at), {
        addSuffix: true,
      })
    : null;

  if (isLoading || !data) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 px-6 py-8 md:px-10">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const { session, court } = data;
  const schedulePhase = openPlaySchedulePhase(session, clientNowMs);
  const scheduleLabel = openPlaySchedulePhaseLabel(schedulePhase);
  const joinableByTime = isOpenPlayJoinableBySchedule(session, clientNowMs);

  const isHost = Boolean(user?.id && session.host_user_id === user.id);
  const canPayNow = myRequest?.status === "payment_locked";
  const onWaitlist =
    myRequest?.status === "waitlisted" ||
    myRequest?.status === "expired" ||
    myRequest?.status === "denied";

  const mapOpenHref = courtMapHref(court);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-8 md:px-10">
      <PageHeader
        title={session.title}
        subtitle={`${session.venue_name ?? "Venue"} · ${session.court_name ?? "Court"}`}
      />

      <Card className="border-border/50">
        <CardContent className="space-y-3 p-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={cn(scheduleBadgeStyles[schedulePhase] ?? "")}
            >
              {scheduleLabel}
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

      {court ? (
        <Card className="border-border/50">
          <CardContent className="space-y-5 p-6">
            <h2 className="font-heading text-lg font-semibold text-foreground">Venue</h2>
            <div className="rounded-xl border border-border/60 bg-muted/10 p-4">
              <p className="text-base font-semibold text-foreground">
                {court.establishment_name ?? session.venue_name ?? "—"}
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-3 rounded-xl border border-border/60 p-4 text-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Location
                </p>
                <div className="space-y-3">
                  <p className="flex items-start gap-2 text-foreground">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0">{court.location}</span>
                  </p>
                  <Button variant="outline" size="sm" className="w-fit" asChild>
                    <a href={mapOpenHref} target="_blank" rel="noopener noreferrer">
                      Open in Map
                      <ExternalLink className="ml-1.5 h-3 w-3 opacity-70" />
                    </a>
                  </Button>
                </div>
              </div>
              <div className="space-y-3 rounded-xl border border-border/60 p-4 text-sm">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Contact
                </p>
                <p className="font-medium text-foreground">{court.contact_phone ?? "—"}</p>
                {court.facebook_url || court.instagram_url ? (
                  <div className="flex flex-wrap gap-2 pt-0.5">
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
                  </div>
                ) : null}
              </div>
            </div>
            {court.amenities?.length ? (
              <div className="flex flex-wrap gap-1.5">
                {court.amenities.map((amenity) => (
                  <Badge key={amenity} variant="outline" className="font-normal">
                    {formatAmenityLabel(amenity)}
                  </Badge>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {!isHost ? (
        <Card className="border-border/50">
          <CardContent className="space-y-4 p-6">
            <h2 className="font-heading text-lg font-semibold">Join</h2>
            {!joinableByTime || session.status === "cancelled" ? (
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
                    disabled={joinMutation.isPending || session.status === "full"}
                  >
                    {joinMutation.isPending ? "Joining…" : "Join waitlist"}
                  </Button>
                ) : null}

                {onWaitlist && !canPayNow ? (
                  <Button
                    onClick={() => lockMutation.mutate()}
                    disabled={lockMutation.isPending || session.status === "full"}
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
            {data.comments.map((comment) => (
              <div key={comment.id} className="rounded-md border border-border/70 p-3">
                <p className="text-sm font-medium">{comment.user_name ?? "Player"}</p>
                <p className="text-sm text-muted-foreground">{comment.comment}</p>
              </div>
            ))}
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
  );
}

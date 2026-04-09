"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { Clock, MessageCircle, Users } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import PageHeader from "@/components/shared/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { courtlyApi } from "@/lib/api/courtly-client";
import { PAYMENT_PROOF_CANONICAL_MIME_TYPE } from "@/lib/payments/payment-proof-constraints";
import { queryKeys } from "@/lib/query/query-keys";

export default function OpenPlayDetailPage() {
  const params = useParams<{ id: string }>();
  const sessionId = params.id;
  const queryClient = useQueryClient();
  const [paymentMethod, setPaymentMethod] = useState<"gcash" | "maya">("gcash");
  const [joinNote, setJoinNote] = useState("");
  const [proofDataUrl, setProofDataUrl] = useState<string | null>(null);
  const [proofBytes, setProofBytes] = useState(0);
  const [proofWidth, setProofWidth] = useState(0);
  const [proofHeight, setProofHeight] = useState(0);
  const [commentDraft, setCommentDraft] = useState("");
  const [organizerNote, setOrganizerNote] = useState("");

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
    mutationFn: async () => courtlyApi.openPlay.join(sessionId, { join_note: joinNote.trim() || undefined }),
    onSuccess: () => {
      toast.success("Added to waitlist.");
      refresh();
    },
    onError: () => toast.error("Could not join waitlist."),
  });

  const lockMutation = useMutation({
    mutationFn: async () => courtlyApi.openPlay.acquirePaymentLock(sessionId),
    onSuccess: ({ data }) => {
      if (data.result === "full") {
        toast.error("Slots are currently full.");
      } else if (data.result === "locked") {
        toast.success("Slot locked. Submit payment in 5 minutes.");
      }
      refresh();
    },
    onError: () => toast.error("Could not acquire payment lock."),
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
    mutationFn: async () => courtlyApi.openPlay.addComment(sessionId, { comment: commentDraft.trim() }),
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

  const { session } = data;
  const canPayNow = myRequest?.status === "payment_locked";
  const canAcquireLock =
    myRequest?.status === "waitlisted" ||
    myRequest?.status === "expired" ||
    myRequest?.status === "denied" ||
    !myRequest;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-6 py-8 md:px-10">
      <PageHeader title={session.title} subtitle={`${session.venue_name ?? "Venue"} - ${session.court_name ?? "Court"}`} />

      <Card className="border-border/50">
        <CardContent className="space-y-3 p-6">
          <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span>DUPR {session.dupr_min?.toFixed(2)} - {session.dupr_max?.toFixed(2)}</span>
            <span>{session.start_time} - {session.end_time}</span>
            <span>{session.location}</span>
          </div>
          <div className="flex flex-wrap items-center gap-6 text-sm">
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Users className="h-4 w-4" />
              {data.counts.approved}/{session.max_players} approved
            </span>
            <span className="font-semibold text-primary">
              PHP {session.price_per_player.toFixed(2)} / player
            </span>
            <span className="text-muted-foreground">Hosted by {session.host_name}</span>
          </div>
          {session.description ? (
            <p className="text-sm text-muted-foreground">{session.description}</p>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-border/50">
        <CardContent className="space-y-4 p-6">
          <h2 className="font-heading text-lg font-semibold">Join</h2>
          <div className="text-sm text-muted-foreground">
            Status: <span className="font-medium text-foreground">{myRequest?.status ?? "not_joined"}</span>
          </div>
          <div className="space-y-2">
            <Label htmlFor="join-note">Note to organizer</Label>
            <Textarea
              id="join-note"
              value={joinNote}
              onChange={(event) => setJoinNote(event.target.value)}
              placeholder="Optional note about your play availability"
              rows={3}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => joinMutation.mutate()} disabled={joinMutation.isPending || !!myRequest}>
              Join waitlist
            </Button>
            <Button
              variant="outline"
              onClick={() => lockMutation.mutate()}
              disabled={lockMutation.isPending || !canAcquireLock}
            >
              Acquire payment slot
            </Button>
          </div>
          {canPayNow ? (
            <div className="space-y-3 rounded-md border border-border/70 p-4">
              <p className="inline-flex items-center gap-2 text-sm text-amber-600">
                <Clock className="h-4 w-4" />
                Slot lock expires {lockTimeLabel ?? "soon"}
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Payment method</Label>
                  <select
                    className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
                    value={paymentMethod}
                    onChange={(event) => setPaymentMethod(event.target.value as "gcash" | "maya")}
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
                Submit proof
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

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
                      ? ` - DUPR ${request.user_dupr_rating.toFixed(2)}`
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

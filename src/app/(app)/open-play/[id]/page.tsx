"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
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
import PaymentLockOverlay from "@/components/payments/PaymentLockOverlay";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import PageHeader from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { apiErrorMessage } from "@/lib/api/api-error-message";
import { httpStatusOf } from "@/lib/api/http-status";
import { courtlyApi } from "@/lib/api/courtly-client";
import { formatTimeShort } from "@/lib/booking-range";
import { formatAmenityLabel } from "@/lib/format-amenity";
import { formatPhp, formatPhpCompact } from "@/lib/format-currency";
import { useAuth } from "@/lib/auth/auth-context";
import { isValidOpenPlayDuprRange, roundDuprBound } from "@/lib/open-play/dupr-range";
import { isOpenPlayCommentWithinEditWindow } from "@/lib/open-play/open-play-comment-edit";
import {
  openPlayDisplayStatus,
  openPlayDisplayStatusLabel,
} from "@/lib/open-play/lifecycle";
import { useOpenPlayDetailRealtime } from "@/lib/open-play/use-open-play-detail-realtime";
import { isOpenPlayJoinableBySchedule } from "@/lib/open-play/schedule";
import { optimizePaymentProofImage } from "@/lib/payments/optimize-payment-proof";
import {
  PAYMENT_PROOF_ALLOWED_INPUT_MIME_TYPES,
  PAYMENT_PROOF_CANONICAL_MIME_TYPE,
} from "@/lib/payments/payment-proof-constraints";
import { queryKeys } from "@/lib/query/query-keys";
import type { Court, OpenPlayDetailResponse } from "@/lib/types/courtly";
import { cn, formatStatusLabel } from "@/lib/utils";
import { isValidPhMobile } from "@/lib/validation/person-fields";

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

function isEmbedSafePaymentProofUrl(url: string): boolean {
  const u = url.trim();
  if (u.startsWith("data:image/jpeg;base64,")) return true;
  if (u.startsWith("https://")) return true;
  return false;
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
  const [editOpen, setEditOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"gcash" | "maya">("gcash");
  const [joinNote, setJoinNote] = useState("");
  const [proofDataUrl, setProofDataUrl] = useState<string | null>(null);
  const [proofBytes, setProofBytes] = useState(0);
  const [proofWidth, setProofWidth] = useState(0);
  const [proofHeight, setProofHeight] = useState(0);
  const [proofOptimizing, setProofOptimizing] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [organizerNote, setOrganizerNote] = useState("");
  const [hostAcceptsGcash, setHostAcceptsGcash] = useState(false);
  const [hostGcashAccountName, setHostGcashAccountName] = useState("");
  const [hostGcashAccountNumber, setHostGcashAccountNumber] = useState("");
  const [hostAcceptsMaya, setHostAcceptsMaya] = useState(false);
  const [hostMayaAccountName, setHostMayaAccountName] = useState("");
  const [hostMayaAccountNumber, setHostMayaAccountNumber] = useState("");
  const [paymentProofPreviewUrl, setPaymentProofPreviewUrl] = useState<string | null>(
    null,
  );
  const [paymentProofZoom, setPaymentProofZoom] = useState(1);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editMaxPlayers, setEditMaxPlayers] = useState("");
  const [editPricePerPlayer, setEditPricePerPlayer] = useState("");
  const [editDuprMin, setEditDuprMin] = useState("");
  const [editDuprMax, setEditDuprMax] = useState("");
  const [clientNowMs, setClientNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setClientNowMs(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, []);

  const {
    data,
    isLoading,
    isError: isDetailError,
    error: detailError,
  } = useQuery({
    queryKey: queryKeys.openPlay.detail(sessionId),
    queryFn: async () => {
      const { data } = await courtlyApi.openPlay.get(sessionId);
      return data;
    },
    enabled: !!sessionId,
  });
  const openPlayMissing =
    !isLoading &&
    !data &&
    (!isDetailError || httpStatusOf(detailError) === 404);
  useEffect(() => {
    if (!openPlayMissing) return;
    router.replace("/open-play");
  }, [openPlayMissing, router]);
  useEffect(() => {
    const session = data?.session;
    if (!session) return;
    const available: Array<"gcash" | "maya"> = [];
    if (session.accepts_gcash) available.push("gcash");
    if (session.accepts_maya) available.push("maya");
    if (available.length === 0) return;
    setPaymentMethod((current) =>
      available.includes(current) ? current : available[0]!,
    );
  }, [data?.session]);
  useEffect(() => {
    const session = data?.session;
    if (!session) return;
    setHostAcceptsGcash(Boolean(session.accepts_gcash));
    setHostGcashAccountName(session.gcash_account_name ?? "");
    setHostGcashAccountNumber(session.gcash_account_number ?? "");
    setHostAcceptsMaya(Boolean(session.accepts_maya));
    setHostMayaAccountName(session.maya_account_name ?? "");
    setHostMayaAccountNumber(session.maya_account_number ?? "");
    setEditTitle(session.title ?? "");
    setEditDescription(session.description ?? "");
    setEditMaxPlayers(String(session.max_players ?? ""));
    setEditPricePerPlayer(String(session.price_per_player ?? 0));
    setEditDuprMin(
      typeof session.dupr_min === "number" && Number.isFinite(session.dupr_min)
        ? session.dupr_min.toFixed(2)
        : "2.00",
    );
    setEditDuprMax(
      typeof session.dupr_max === "number" && Number.isFinite(session.dupr_max)
        ? session.dupr_max.toFixed(2)
        : "8.00",
    );
  }, [data?.session]);

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

  const processProofFile = async (file: File) => {
    const allowed = PAYMENT_PROOF_ALLOWED_INPUT_MIME_TYPES as readonly string[];
    if (!allowed.includes(file.type)) {
      toast.error("Please use a JPG, PNG, or WebP photo.");
      return;
    }
    setProofOptimizing(true);
    setProofDataUrl(null);
    try {
      const optimized = await optimizePaymentProofImage(file);
      setProofDataUrl(optimized.dataUrl);
      setProofBytes(optimized.bytes);
      setProofWidth(optimized.width);
      setProofHeight(optimized.height);
      toast.success("Photo uploaded");
    } catch (error) {
      toast.error(apiErrorMessage(error, "Could not use that image. Try another photo."));
      setProofDataUrl(null);
    } finally {
      setProofOptimizing(false);
    }
  };

  const clearProofSelection = () => {
    setProofDataUrl(null);
    setProofBytes(0);
    setProofWidth(0);
    setProofHeight(0);
  };

  const joinMutation = useMutation({
    mutationFn: async () =>
      courtlyApi.openPlay.join(sessionId, { join_note: joinNote.trim() || undefined }),
    onSuccess: ({ data: payload }) => {
      if (payload.result === "full") {
        toast.error("Slots are currently full.");
      } else if (payload.result === "locked") {
        toast.success("Slot locked. Submit payment proof before it expires.");
      } else if (payload.result === "already_active") {
        toast.message("You already have an active payment step.");
      } else if (payload.result === "not_found") {
        toast.error("Open play not found.");
      } else {
        toast.error("Could not start join payment.");
      }
      refresh();
    },
    onError: (err: unknown) =>
      toast.error(apiErrorMessage(err, "Could not start join payment.")),
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
    onSuccess: ({ data: response }) => {
      queryClient.setQueryData<OpenPlayDetailResponse>(
        queryKeys.openPlay.detail(sessionId),
        (current) => {
          if (!current) return current;
          return {
            ...current,
            comments: current.comments.map((comment) =>
              comment.id === response.comment.id ? response.comment : comment,
            ),
          };
        },
      );
      setEditingCommentId(null);
      setEditDraft("");
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
  const updateOpenPlayMutation = useMutation({
    mutationFn: async () =>
      courtlyApi.openPlay.update(sessionId, {
        title: editTitle.trim(),
        description: editDescription.trim() || undefined,
        max_players: Number.parseInt(editMaxPlayers.trim(), 10),
        price_per_player: Number.parseInt(editPricePerPlayer.trim(), 10),
        dupr_min: roundDuprBound(editDuprMin),
        dupr_max: roundDuprBound(editDuprMax),
        accepts_gcash: hostAcceptsGcash,
        gcash_account_name: hostAcceptsGcash ? hostGcashAccountName.trim() : null,
        gcash_account_number: hostAcceptsGcash ? hostGcashAccountNumber.trim() : null,
        accepts_maya: hostAcceptsMaya,
        maya_account_name: hostAcceptsMaya ? hostMayaAccountName.trim() : null,
        maya_account_number: hostAcceptsMaya ? hostMayaAccountNumber.trim() : null,
      }),
    onSuccess: () => {
      toast.success("Open play updated.");
      setEditOpen(false);
      refresh();
    },
    onError: (error) =>
      toast.error(apiErrorMessage(error, "Could not update open play.")),
  });

  const myRequest = data?.my_request;
  const canPayNow = myRequest?.status === "payment_locked";
  const paymentLockRemainingSeconds =
    canPayNow && myRequest?.payment_lock_expires_at
      ? Math.max(
          0,
          Math.ceil((new Date(myRequest.payment_lock_expires_at).getTime() - clientNowMs) / 1000),
        )
      : 0;
  useEffect(() => {
    if (!canPayNow) return;
    if (paymentLockRemainingSeconds > 0) return;
    window.location.reload();
  }, [canPayNow, paymentLockRemainingSeconds]);

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
  const canRestartJoin =
    !myRequest ||
    myRequest?.status === "waitlisted" ||
    myRequest?.status === "expired" ||
    myRequest?.status === "denied" ||
    myRequest?.status === "cancelled";

  const canAttemptNewJoin =
    joinableByTime &&
    lifecycleDisplay === "open" &&
    session.status !== "cancelled" &&
    session.status !== "full";
  const hostEditInvalid =
    !editTitle.trim() ||
    !editMaxPlayers.trim() ||
    !editPricePerPlayer.trim() ||
    !editDuprMin.trim() ||
    !editDuprMax.trim() ||
    !Number.isInteger(Number.parseInt(editMaxPlayers.trim(), 10)) ||
    Number.parseInt(editMaxPlayers.trim(), 10) < 2 ||
    !Number.isInteger(Number.parseInt(editPricePerPlayer.trim(), 10)) ||
    Number.parseInt(editPricePerPlayer.trim(), 10) < 0 ||
    !isValidOpenPlayDuprRange(
      roundDuprBound(editDuprMin),
      roundDuprBound(editDuprMax),
    ) ||
    ((Number.parseInt(editPricePerPlayer.trim(), 10) || 0) > 0 &&
      !hostAcceptsGcash &&
      !hostAcceptsMaya) ||
    (hostAcceptsGcash && (!hostGcashAccountName.trim() || !hostGcashAccountNumber.trim())) ||
    (hostAcceptsMaya && (!hostMayaAccountName.trim() || !hostMayaAccountNumber.trim())) ||
    (hostAcceptsGcash && !isValidPhMobile(hostGcashAccountNumber)) ||
    (hostAcceptsMaya && !isValidPhMobile(hostMayaAccountNumber));
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
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit open play</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="edit-open-play-title">Lobby name</Label>
              <Input
                id="edit-open-play-title"
                value={editTitle}
                onChange={(event) => setEditTitle(event.target.value)}
                placeholder="Friday Evening Games"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-open-play-slots">Slots</Label>
              <Input
                id="edit-open-play-slots"
                type="number"
                min={2}
                step={1}
                value={editMaxPlayers}
                onChange={(event) => setEditMaxPlayers(event.target.value)}
                placeholder="e.g. 8"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="edit-open-play-price">Price per player (PHP)</Label>
              <Input
                id="edit-open-play-price"
                type="number"
                min={0}
                step={1}
                value={editPricePerPlayer}
                onChange={(event) => setEditPricePerPlayer(event.target.value)}
                placeholder="e.g. 100"
              />
            </div>
            <div className="space-y-1">
              <Label>DUPR range</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={2}
                  max={8}
                  step={0.01}
                  value={editDuprMin}
                  onChange={(event) => setEditDuprMin(event.target.value)}
                  placeholder="Min"
                />
                <Input
                  type="number"
                  min={2}
                  max={8}
                  step={0.01}
                  value={editDuprMax}
                  onChange={(event) => setEditDuprMax(event.target.value)}
                  placeholder="Max"
                />
              </div>
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="edit-open-play-description">Description</Label>
              <Textarea
                id="edit-open-play-description"
                rows={3}
                value={editDescription}
                onChange={(event) => setEditDescription(event.target.value)}
                placeholder="Optional notes for players"
              />
            </div>
          </div>
          <div className="space-y-3 rounded-xl border border-border/60 p-4">
            <p className="text-sm font-medium text-foreground">Organizer payment methods</p>
            <div className="space-y-2 rounded-lg border border-border/60 p-3">
              <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={hostAcceptsGcash}
                  onChange={(event) => setHostAcceptsGcash(event.target.checked)}
                />
                Accept GCash
              </label>
              {hostAcceptsGcash ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    value={hostGcashAccountName}
                    onChange={(event) => setHostGcashAccountName(event.target.value)}
                    placeholder="GCash account name"
                  />
                  <Input
                    value={hostGcashAccountNumber}
                    onChange={(event) => setHostGcashAccountNumber(event.target.value)}
                    placeholder="GCash account number"
                  />
                </div>
              ) : null}
            </div>
            <div className="space-y-2 rounded-lg border border-border/60 p-3">
              <label className="flex items-center gap-2 text-sm font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={hostAcceptsMaya}
                  onChange={(event) => setHostAcceptsMaya(event.target.checked)}
                />
                Accept Maya
              </label>
              {hostAcceptsMaya ? (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    value={hostMayaAccountName}
                    onChange={(event) => setHostMayaAccountName(event.target.value)}
                    placeholder="Maya account name"
                  />
                  <Input
                    value={hostMayaAccountNumber}
                    onChange={(event) => setHostMayaAccountNumber(event.target.value)}
                    placeholder="Maya account number"
                  />
                </div>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditOpen(false)}
              disabled={updateOpenPlayMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => updateOpenPlayMutation.mutate()}
              disabled={updateOpenPlayMutation.isPending || hostEditInvalid}
            >
              {updateOpenPlayMutation.isPending ? "Saving..." : "Save changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!paymentProofPreviewUrl}
        onOpenChange={(open) => {
          if (!open) {
            setPaymentProofPreviewUrl(null);
            setPaymentProofZoom(1);
          }
        }}
      >
        <DialogContent className="max-h-[min(92dvh,44rem)] sm:max-w-5xl">
          <DialogHeader className="pr-8 text-left">
            <DialogTitle className="font-heading">Payment proof</DialogTitle>
            <DialogDescription>
              Screenshot submitted by the player.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/20 px-3 py-2">
            <p className="text-xs text-muted-foreground">
              Zoom: {Math.round(paymentProofZoom * 100)}%
            </p>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2"
                onClick={() =>
                  setPaymentProofZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))
                }
                disabled={paymentProofZoom <= 0.5}
                aria-label="Zoom out"
              >
                -
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2"
                onClick={() => setPaymentProofZoom(1)}
                disabled={paymentProofZoom === 1}
              >
                Reset
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 px-2"
                onClick={() =>
                  setPaymentProofZoom((z) => Math.min(3, Math.round((z + 0.25) * 100) / 100))
                }
                disabled={paymentProofZoom >= 3}
                aria-label="Zoom in"
              >
                +
              </Button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border/70 bg-muted/20 p-2">
            {paymentProofPreviewUrl && isEmbedSafePaymentProofUrl(paymentProofPreviewUrl) ? (
              <div className="inline-block">
                {/* eslint-disable-next-line @next/next/no-img-element -- data URL or HTTPS proof URL */}
                <img
                  src={paymentProofPreviewUrl}
                  alt="Payment proof submitted for this open play request"
                  className="block h-auto max-h-none max-w-none"
                  style={{
                    width: `${paymentProofZoom * 100}%`,
                  }}
                />
              </div>
            ) : paymentProofPreviewUrl ? (
              <p className="p-4 text-sm text-muted-foreground">
                This proof link cannot be previewed here.{" "}
                <a
                  href={paymentProofPreviewUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="font-medium text-primary underline-offset-2 hover:underline"
                >
                  Open in new tab
                </a>
              </p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
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
                className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => {
                  setHostOptionsOpen(false);
                  setEditOpen(true);
                }}
              >
                <Pencil className="h-4 w-4 shrink-0" />
                Edit open play
              </button>
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
      {data.approved_players && data.approved_players.length > 0 ? (
        <Card className="border-border/50">
          <CardContent className="space-y-4 p-6">
            <h2 className="font-heading text-lg font-semibold">Players</h2>
            <div className="space-y-2">
              {data.approved_players.map((player) => (
                <div
                  key={player.id}
                  className="flex items-center justify-between rounded-md border border-border/70 p-3"
                >
                  <p className="text-sm font-medium">{player.user_name ?? player.user_id}</p>
                  <p className="text-xs text-muted-foreground">
                    {typeof player.user_dupr_rating === "number"
                      ? `DUPR ${player.user_dupr_rating.toFixed(2)}`
                      : "DUPR -"}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {isHost ? (
        <Card className="border-border/50">
          <CardContent className="space-y-4 p-6">
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
      ) : null}

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
            <h2 className="font-heading text-lg font-semibold">Requests</h2>
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
                    {request.payment_proof_url ? (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setPaymentProofPreviewUrl(request.payment_proof_url ?? null);
                          setPaymentProofZoom(1);
                        }}
                      >
                        View payment proof
                      </Button>
                    ) : null}
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

        <aside className="min-w-0 space-y-6 lg:sticky lg:top-6 lg:self-start">
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
                    {!myRequest ? (
                      <div className="space-y-2">
                        <Label htmlFor="join-note">Note to organizer</Label>
                        <Textarea
                          id="join-note"
                          value={joinNote}
                          onChange={(event) => setJoinNote(event.target.value)}
                          placeholder="Optional note for the host"
                          rows={3}
                        />
                      </div>
                    ) : null}
                    {!myRequest && session.status === "full" ? (
                      <p className="text-sm text-muted-foreground">
                        This session is currently full. Join requests are disabled.
                      </p>
                    ) : null}

                    {canRestartJoin ? (
                      <Button
                        onClick={() => joinMutation.mutate()}
                        disabled={
                          joinMutation.isPending ||
                          session.status === "full" ||
                          !canAttemptNewJoin
                        }
                      >
                        {joinMutation.isPending ? "Starting join…" : "Join now"}
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
                  </>
                )}
              </CardContent>
            </Card>
          ) : null}
        {court ? (
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
        ) : null}
          </aside>
      </div>
      {canPayNow ? (
        <PaymentLockOverlay
          description="Send payment to the selected account, then upload your proof."
          remainingSeconds={paymentLockRemainingSeconds}
          totalDue={session.price_per_player}
          paymentMethods={[
            ...(session.accepts_gcash
              ? [
                  {
                    method: "gcash" as const,
                    account_name: session.gcash_account_name ?? "",
                    account_number: session.gcash_account_number ?? "",
                    label: "GCash",
                  },
                ]
              : []),
            ...(session.accepts_maya
              ? [
                  {
                    method: "maya" as const,
                    account_name: session.maya_account_name ?? "",
                    account_number: session.maya_account_number ?? "",
                    label: "Maya",
                  },
                ]
              : []),
          ]}
          selectedPaymentMethod={paymentMethod}
          onPaymentMethodChange={(value) => setPaymentMethod(value)}
          onPickProofFile={processProofFile}
          proofPreviewUrl={proofDataUrl}
          proofOptimizing={proofOptimizing}
          onClearProof={clearProofSelection}
          onSubmit={() => submitProofMutation.mutate()}
          submitDisabled={submitProofMutation.isPending || proofOptimizing || !proofDataUrl}
          submitPending={submitProofMutation.isPending}
        />
      ) : null}
    </div>
  );
}

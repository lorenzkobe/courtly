import { listVenueAdminAssignmentsByVenue } from "@/lib/data/courtly-db";
import type { Booking, CourtReview } from "@/lib/types/courtly";
import type { EmitNotificationInput } from "@/lib/notifications/repository";
import { createNotificationRepository } from "@/lib/notifications/repository-factory";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  sendBookingRefundInitiated,
  sendBookingRefunded,
  sendGuestBookingStatusUpdate,
} from "@/lib/email/email-service";

const repo = createNotificationRepository();

export async function safeEmitMany(inputs: EmitNotificationInput[]): Promise<void> {
  if (inputs.length === 0) return;
  try {
    await repo.emitMany(inputs);
  } catch (err) {
    console.error("[courtly:notifications]", err);
  }
}

async function listSuperadminProfileIds(): Promise<string[]> {
  try {
    const sb = createSupabaseAdminClient();
    const { data, error } = await sb.from("profiles").select("id").eq("role", "superadmin");
    if (error) {
      console.error("[courtly:notifications]", error);
      return [];
    }
    return (data ?? []).map((profileRow) => (profileRow as { id: string }).id);
  } catch (e) {
    console.error("[courtly:notifications]", e);
    return [];
  }
}

type BookingNotifySnapshot = {
  user_id: string | null;
  status: Booking["status"];
  date: string;
  start_time: string;
  end_time: string;
  court_id: string;
  admin_note: string | null;
};

function coerceBookingStatus(
  value: unknown,
  fallback: Booking["status"],
): Booking["status"] {
  if (
    value === "pending_payment" ||
    value === "pending_confirmation" ||
    value === "confirmed" ||
    value === "cancelled" ||
    value === "completed" ||
    value === "refund" ||
    value === "refunded"
  ) {
    return value;
  }
  if (typeof value === "string") {
    const t = value.trim().toLowerCase();
    if (
      t === "pending_payment" ||
      t === "pending_confirmation" ||
      t === "confirmed" ||
      t === "cancelled" ||
      t === "completed" ||
      t === "refund" ||
      t === "refunded"
    ) {
      return t as Booking["status"];
    }
  }
  return fallback;
}

async function fetchBookingOwnerUserId(bookingId: string): Promise<string | null> {
  try {
    const sb = createSupabaseAdminClient();
    const { data, error } = await sb
      .from("bookings")
      .select("user_id")
      .eq("id", bookingId)
      .maybeSingle();
    if (error) {
      console.error("[courtly:notifications]", error);
      return null;
    }
    const uid = (data as { user_id?: string | null } | null)?.user_id;
    return typeof uid === "string" && uid.length > 0 ? uid : null;
  } catch (e) {
    console.error("[courtly:notifications]", e);
    return null;
  }
}

async function fetchBookingVenueId(bookingId: string): Promise<string | null> {
  try {
    const sb = createSupabaseAdminClient();
    const { data, error } = await sb
      .from("bookings")
      .select("courts(venue_id)")
      .eq("id", bookingId)
      .maybeSingle();
    if (error) {
      console.error("[courtly:notifications]", error);
      return null;
    }
    const venueId = (data as { courts?: { venue_id?: string } | null } | null)?.courts
      ?.venue_id;
    return typeof venueId === "string" && venueId.length > 0 ? venueId : null;
  } catch (e) {
    console.error("[courtly:notifications]", e);
    return null;
  }
}

async function hasVenueReviewByUser(userId: string, venueId: string): Promise<boolean> {
  try {
    const sb = createSupabaseAdminClient();
    const { count, error } = await sb
      .from("court_reviews")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("venue_id", venueId);
    if (error) {
      console.error("[courtly:notifications]", error);
      return false;
    }
    return (count ?? 0) > 0;
  } catch (e) {
    console.error("[courtly:notifications]", e);
    return false;
  }
}

export async function emitBookingCompletedReviewReminderIfNeeded(params: {
  userId: string | null | undefined;
  bookingId: string;
  venueId?: string | null;
}): Promise<void> {
  const userId = params.userId ?? null;
  if (!userId) return;
  const venueId = params.venueId ?? (await fetchBookingVenueId(params.bookingId));
  if (!venueId) return;
  if (await hasVenueReviewByUser(userId, venueId)) return;
  await safeEmitMany([
    {
      user_id: userId,
      type: "booking_completed_review_reminder",
      title: "How was your visit?",
      body: "Leave a review for your completed booking.",
      metadata: {
        booking_id: params.bookingId,
        target_path: `/my-bookings/${params.bookingId}`,
      },
    },
  ]);
}

function snapshotFromBooking(b: Booking): BookingNotifySnapshot {
  return {
    user_id: b.user_id ?? null,
    status: b.status,
    date: b.date,
    start_time: b.start_time,
    end_time: b.end_time,
    court_id: b.court_id,
    admin_note: b.admin_note ?? null,
  };
}

function snapshotFromBookingRow(
  row: Record<string, unknown>,
  prev: BookingNotifySnapshot,
): BookingNotifySnapshot {
  const rawDate = row.date;
  const date =
    typeof rawDate === "string"
      ? rawDate.slice(0, 10)
      : rawDate instanceof Date
        ? rawDate.toISOString().slice(0, 10)
        : prev.date;
  return {
    user_id: (row.user_id as string | null | undefined) ?? prev.user_id,
    status: coerceBookingStatus(row.status, prev.status),
    date: date || prev.date,
    start_time: String(row.start_time ?? prev.start_time),
    end_time: String(row.end_time ?? prev.end_time),
    court_id: String(row.court_id || prev.court_id),
    admin_note:
      row.admin_note === undefined
        ? prev.admin_note
        : ((row.admin_note as string | null | undefined) ?? null),
  };
}

export async function emitBookingCreatedToVenueAdmins(params: {
  venueId: string;
  venueName: string;
  courtName: string;
  bookingId: string;
  bookerLabel: string;
  bookerUserId: string | null;
}): Promise<void> {
  const assignments = await listVenueAdminAssignmentsByVenue(params.venueId);
  const adminIds = new Set(assignments.map((a) => a.admin_user_id));
  if (params.bookerUserId) adminIds.delete(params.bookerUserId);
  const inputs: EmitNotificationInput[] = [...adminIds].map((user_id) => ({
    user_id,
    type: "booking_created_admin",
    title: "New booking",
    body: `${params.bookerLabel} booked ${params.courtName} at ${params.venueName}.`,
    metadata: {
      booking_id: params.bookingId,
      target_path: `/admin/bookings?detail=${params.bookingId}`,
    },
  }));
  await safeEmitMany(inputs);
}

export async function emitBookingAutoConfirmedToVenueAdmins(params: {
  venueId: string;
  bookingId: string;
  courtName: string;
  venueName: string;
}): Promise<void> {
  const assignments = await listVenueAdminAssignmentsByVenue(params.venueId);
  const adminIds = [...new Set(assignments.map((a) => a.admin_user_id))];
  const inputs = adminIds.map(
    (user_id): EmitNotificationInput => ({
      user_id,
      type: "booking_auto_confirmed_admin",
      title: "Booking auto-confirmed",
      body: `A booking for ${params.courtName} at ${params.venueName} was auto-confirmed at slot start — please verify the payment proof.`,
      metadata: {
        booking_id: params.bookingId,
        target_path: `/admin/bookings?detail=${params.bookingId}`,
      },
    }),
  );
  await safeEmitMany(inputs);
}

export async function emitBookingLifecycleNotifications(params: {
  prev: Booking;
  nextRow: Record<string, unknown>;
  bookingId: string;
  skipReviewReminder?: boolean;
}): Promise<void> {
  try {
    await emitBookingLifecycleNotificationsInner(params);
  } catch (e) {
    console.error("[courtly:notifications] booking lifecycle", e);
  }
}

/** One digest notification per booker for admin bulk status changes (not per court row). */
export async function emitBulkBookingLifecycleNotifications(
  items: Array<{ prev: Booking; nextRow: Record<string, unknown>; bookingId: string }>,
): Promise<void> {
  if (items.length === 0) return;
  try {
    const isIndividualTransition = (item: { prev: Booking; nextRow: Record<string, unknown> }) => {
      const prev = snapshotFromBooking(item.prev);
      const next = snapshotFromBookingRow(item.nextRow, prev);
      return (
        (next.status === "completed" && prev.status !== "completed") ||
        (next.status === "refund" && prev.status !== "refund") ||
        (next.status === "refunded" && prev.status !== "refunded")
      );
    };

    const individualTransitions = items.filter(isIndividualTransition);
    for (const item of individualTransitions) {
      await emitBookingLifecycleNotifications({
        prev: item.prev,
        nextRow: item.nextRow,
        bookingId: item.bookingId,
        skipReviewReminder: false,
      });
    }

    const digestItems = items.filter((item) => !isIndividualTransition(item));
    if (digestItems.length === 0) return;

    type EmailGroup = {
      emailBase: { to: string; playerName: string; bookingNumber: string; courtName: string; venueName: string };
      status: "confirmed" | "cancelled";
      slots: Array<{ date?: string; startTime?: string; endTime?: string; courtName?: string }>;
    };
    const emailGroups = new Map<string, EmailGroup>();

    type Agg = { confirmed: number; cancelled: number; firstBookingId: string };
    const byUser = new Map<string, Agg>();
    for (const item of digestItems) {
      const prev = snapshotFromBooking(item.prev);
      const next = snapshotFromBookingRow(item.nextRow, prev);

      let targetStatus: "confirmed" | "cancelled" | null = null;
      if (next.status === "confirmed" && prev.status !== "confirmed") targetStatus = "confirmed";
      else if (next.status === "cancelled" && prev.status !== "cancelled") targetStatus = "cancelled";

      const playerEmail = item.prev.player_email?.trim();
      if (playerEmail && targetStatus) {
        const groupKey = `${playerEmail}|${targetStatus}|${item.prev.booking_group_id ?? item.bookingId}`;
        const slot = {
          date: item.prev.date ?? undefined,
          startTime: item.prev.start_time ?? undefined,
          endTime: item.prev.end_time ?? undefined,
          courtName: item.prev.court_name ?? undefined,
        };
        const existing = emailGroups.get(groupKey);
        if (existing) {
          existing.slots.push(slot);
        } else {
          emailGroups.set(groupKey, {
            emailBase: {
              to: playerEmail,
              playerName: item.prev.player_name ?? "Player",
              bookingNumber: item.prev.booking_number ?? "",
              courtName: item.prev.court_name ?? "",
              venueName: item.prev.establishment_name ?? "",
            },
            status: targetStatus,
            slots: [slot],
          });
        }
      }

      let uid = next.user_id ?? prev.user_id;
      if (!uid) {
        uid = (await fetchBookingOwnerUserId(item.bookingId)) ?? null;
      }
      if (!uid) continue;
      let agg = byUser.get(uid);
      if (!agg) {
        agg = { confirmed: 0, cancelled: 0, firstBookingId: item.bookingId };
        byUser.set(uid, agg);
      }
      if (next.status === "confirmed" && prev.status !== "confirmed") {
        agg.confirmed += 1;
      } else if (next.status === "cancelled" && prev.status !== "cancelled") {
        agg.cancelled += 1;
      }
    }

    for (const group of emailGroups.values()) {
      void sendGuestBookingStatusUpdate({ ...group.emailBase, status: group.status, slots: group.slots });
    }

    const inputs: EmitNotificationInput[] = [];
    for (const [userId, agg] of byUser) {
      const parts: string[] = [];
      if (agg.confirmed > 0) {
        parts.push(
          `${agg.confirmed} booking${agg.confirmed > 1 ? "s" : ""} confirmed`,
        );
      }
      if (agg.cancelled > 0) {
        parts.push(
          `${agg.cancelled} booking${agg.cancelled > 1 ? "s" : ""} cancelled`,
        );
      }
      if (parts.length === 0) continue;
      inputs.push({
        user_id: userId,
        type: "booking_changed",
        title: "Bookings updated",
        body: `The venue updated your reservations: ${parts.join("; ")}.`,
        metadata: {
          booking_id: agg.firstBookingId,
          target_path: `/my-bookings/${agg.firstBookingId}`,
        },
      });
    }
    await safeEmitMany(inputs);
  } catch (e) {
    console.error("[courtly:notifications] bulk booking lifecycle", e);
  }
}

async function emitBookingLifecycleNotificationsInner(params: {
  prev: Booking;
  nextRow: Record<string, unknown>;
  bookingId: string;
  skipReviewReminder?: boolean;
}): Promise<void> {
  const prev = snapshotFromBooking(params.prev);
  const next = snapshotFromBookingRow(params.nextRow, prev);

  // Email stubs fire for all players (authenticated and guest) before the uid check.
  const playerEmail = params.prev.player_email?.trim();
  const emailBase = {
    to: playerEmail ?? "",
    playerName: params.prev.player_name ?? "Player",
    bookingNumber: params.prev.booking_number ?? "",
    courtName: params.prev.court_name ?? "",
    venueName: params.prev.establishment_name ?? "",
  };
  if (next.status === "confirmed" && prev.status !== "confirmed" && playerEmail) {
    void sendGuestBookingStatusUpdate({
      ...emailBase,
      status: "confirmed",
      date: params.prev.date ?? undefined,
      startTime: params.prev.start_time ?? undefined,
      endTime: params.prev.end_time ?? undefined,
    });
  }
  if (next.status === "refund" && prev.status !== "refund" && playerEmail) {
    void sendBookingRefundInitiated(emailBase);
  }
  if (next.status === "refunded" && prev.status !== "refunded" && playerEmail) {
    void sendBookingRefunded(emailBase);
  }

  let uid = next.user_id ?? prev.user_id;
  if (!uid) {
    uid = await fetchBookingOwnerUserId(params.bookingId);
  }
  if (!uid) return;

  if (next.status === "refund" && prev.status !== "refund") {
    await safeEmitMany([
      {
        user_id: uid,
        type: "booking_refund_initiated",
        title: "Refund in progress",
        body: "A refund has been initiated for your booking.",
        metadata: {
          booking_id: params.bookingId,
          target_path: `/my-bookings/${params.bookingId}`,
        },
      },
    ]);
    return;
  }

  if (next.status === "refunded" && prev.status !== "refunded") {
    await safeEmitMany([
      {
        user_id: uid,
        type: "booking_refunded",
        title: "Refund completed",
        body: "Your booking refund has been processed.",
        metadata: {
          booking_id: params.bookingId,
          target_path: `/my-bookings/${params.bookingId}`,
        },
      },
    ]);
    return;
  }

  if (next.status === "cancelled" && prev.status !== "cancelled") {
    await safeEmitMany([
      {
        user_id: uid,
        type: "booking_cancelled",
        title: "Booking cancelled",
        body: "Your booking has been cancelled.",
        metadata: {
          booking_id: params.bookingId,
          target_path: `/my-bookings/${params.bookingId}`,
        },
      },
    ]);
    return;
  }

  if (next.status === "completed" && prev.status !== "completed") {
    if (!params.skipReviewReminder && prev.user_id) {
      await emitBookingCompletedReviewReminderIfNeeded({
        userId: uid,
        bookingId: params.bookingId,
        venueId: next.court_id === prev.court_id ? params.prev.venue_id : undefined,
      });
    }
    return;
  }

  const statusConfirmedNow = next.status === "confirmed" && prev.status !== "confirmed";
  if (statusConfirmedNow) {
    await safeEmitMany([
      {
        user_id: uid,
        type: "booking_changed",
        title: "Booking confirmed",
        body: "Your booking was confirmed by the venue.",
        metadata: {
          booking_id: params.bookingId,
          target_path: `/my-bookings/${params.bookingId}`,
        },
      },
    ]);
  }
}

export async function emitCourtCreatedToSuperadmins(params: {
  courtId: string;
  courtName: string;
  venueName: string;
}): Promise<void> {
  const ids = await listSuperadminProfileIds();
  const inputs = ids.map(
    (user_id): EmitNotificationInput => ({
      user_id,
      type: "court_created_superadmin",
      title: "New court",
      body: `${params.courtName} was added at ${params.venueName}.`,
      metadata: {
        court_id: params.courtId,
        target_path: "/superadmin/venues",
      },
    }),
  );
  await safeEmitMany(inputs);
}

export async function emitReviewCreatedToVenueAdmins(params: {
  venueId: string;
  venueName: string;
  reviewId: string;
  reviewerLabel: string;
  rating: number;
}): Promise<void> {
  const assignments = await listVenueAdminAssignmentsByVenue(params.venueId);
  const adminIds = [...new Set(assignments.map((a) => a.admin_user_id))];
  const inputs = adminIds.map(
    (user_id): EmitNotificationInput => ({
      user_id,
      type: "review_added_admin",
      title: "New review",
      body: `${params.reviewerLabel} rated ${params.venueName} ${params.rating}/5.`,
      metadata: {
        review_id: params.reviewId,
        target_path: `/admin/venues/${params.venueId}`,
      },
    }),
  );
  await safeEmitMany(inputs);
}

export async function emitReviewFlagged(params: {
  review: Pick<CourtReview, "id" | "user_id" | "venue_id">;
  venueName: string;
  flagReason?: string | null;
}): Promise<void> {
  const superIds = await listSuperadminProfileIds();
  const authorId = params.review.user_id;
  const reason =
    typeof params.flagReason === "string" && params.flagReason.trim()
      ? ` Reason: ${params.flagReason.trim().slice(0, 200)}`
      : "";
  const toAuthor: EmitNotificationInput = {
    user_id: authorId,
    type: "review_flagged_author",
    title: "Your review was flagged",
    body: `A venue admin flagged your review at ${params.venueName}.${reason}`,
    metadata: {
      review_id: params.review.id,
      target_path: "/my-bookings",
    },
  };
  const toSupers = superIds
    .filter((id) => id !== authorId)
    .map(
      (user_id): EmitNotificationInput => ({
        user_id,
        type: "review_flagged_superadmin",
        title: "Review flagged",
        body: `A review was flagged at ${params.venueName}.${reason}`,
        metadata: {
          review_id: params.review.id,
          target_path: "/superadmin/moderation",
        },
      }),
    );
  await safeEmitMany([toAuthor, ...toSupers]);
}

export async function emitReviewFlagCleared(params: {
  review: CourtReview;
  venueName: string;
}): Promise<void> {
  const inputs: EmitNotificationInput[] = [];
  const seen = new Set<string>();
  const push = (row: EmitNotificationInput) => {
    if (!seen.has(row.user_id)) {
      seen.add(row.user_id);
      inputs.push(row);
    }
  };
  push({
    user_id: params.review.user_id,
    type: "review_flag_resolution_feedback",
    title: "Review flag cleared",
    body: `The flag on your review at ${params.venueName} was cleared.`,
    metadata: { review_id: params.review.id, target_path: "/my-bookings" },
  });
  const flagger = params.review.flagged_by_user_id;
  if (flagger && flagger !== params.review.user_id) {
    push({
      user_id: flagger,
      type: "review_flag_resolution_feedback",
      title: "Flag cleared",
      body: `A flag you raised at ${params.venueName} was cleared by a platform admin.`,
      metadata: {
        review_id: params.review.id,
        target_path: "/superadmin/moderation",
      },
    });
  }
  await safeEmitMany(inputs);
}

export async function emitReviewDeletedByModerationToAuthor(params: {
  review: Pick<CourtReview, "id" | "user_id">;
  venueName: string;
  reason?: string | null;
}): Promise<void> {
  const reasonText =
    typeof params.reason === "string" && params.reason.trim().length > 0
      ? ` Reason: ${params.reason.trim().slice(0, 200)}`
      : "";
  await safeEmitMany([
    {
      user_id: params.review.user_id,
      type: "review_flag_deleted_author",
      title: "Review removed by moderation",
      body: `Your flagged review at ${params.venueName} was removed.${reasonText}`,
      metadata: {
        review_id: params.review.id,
        target_path: "/my-bookings",
        moderation_reason: params.reason?.trim() || undefined,
      },
    },
  ]);
}

export async function emitOpenPlayPaymentSubmittedToHost(params: {
  hostUserId: string | null | undefined;
  participantName: string;
  sessionId: string;
  sessionTitle: string;
}): Promise<void> {
  if (!params.hostUserId) return;
  await safeEmitMany([
    {
      user_id: params.hostUserId,
      type: "open_play_payment_submitted_host",
      category: "open_play",
      title: "Payment proof submitted",
      body: `${params.participantName} submitted payment proof for "${params.sessionTitle}".`,
      metadata: {
        open_play_session_id: params.sessionId,
        target_path: `/open-play/${params.sessionId}`,
      },
    },
  ]);
}

export async function emitOpenPlayDecisionToUser(params: {
  userId: string;
  sessionId: string;
  sessionTitle: string;
  decision: "approved" | "denied";
}): Promise<void> {
  await safeEmitMany([
    {
      user_id: params.userId,
      type: params.decision === "approved" ? "open_play_join_approved" : "open_play_join_denied",
      category: "open_play",
      title:
        params.decision === "approved"
          ? "Open play request approved"
          : "Open play request declined",
      body:
        params.decision === "approved"
          ? `You're approved for "${params.sessionTitle}".`
          : `Your request for "${params.sessionTitle}" was declined.`,
      metadata: {
        open_play_session_id: params.sessionId,
        target_path: `/open-play/${params.sessionId}`,
      },
    },
  ]);
}

export async function emitVenueRequestDecisionToRequester(params: {
  userId: string;
  requestId: string;
  venueName: string;
  decision: "approved" | "rejected" | "needs_update";
  reviewNote?: string | null;
  approvedVenueId?: string | null;
}): Promise<void> {
  const trimmedNote =
    typeof params.reviewNote === "string" ? params.reviewNote.trim() : "";
  if (params.decision === "approved") {
    await safeEmitMany([
      {
        user_id: params.userId,
        type: "venue_request_approved",
        category: "platform",
        title: "Venue request approved",
        body: `Your venue request for "${params.venueName}" was approved.`,
        metadata: {
          venue_request_id: params.requestId,
          venue_id: params.approvedVenueId ?? undefined,
          target_path: "/admin/venues",
        },
      },
    ]);
    return;
  }
  if (params.decision === "rejected") {
    await safeEmitMany([
      {
        user_id: params.userId,
        type: "venue_request_rejected",
        category: "platform",
        title: "Venue request rejected",
        body: `Your venue request for "${params.venueName}" was rejected.`,
        metadata: {
          venue_request_id: params.requestId,
          target_path: "/admin/venues",
        },
      },
    ]);
    return;
  }
  await safeEmitMany([
    {
      user_id: params.userId,
      type: "venue_request_update_requested",
      category: "platform",
      title: "Venue request needs updates",
      body: trimmedNote
        ? `Update requested for "${params.venueName}": ${trimmedNote}`
        : `Update requested for "${params.venueName}".`,
      metadata: {
        venue_request_id: params.requestId,
        target_path: "/admin/venues",
      },
    },
  ]);
}

export async function emitBillingProofSubmittedToSuperadmins(params: {
  venueId: string;
  venueName: string;
  cycleId: string;
  period: string;
}): Promise<void> {
  const ids = await listSuperadminProfileIds();
  await safeEmitMany(
    ids.map((user_id) => ({
      user_id,
      type: "billing_proof_submitted_superadmin",
      category: "platform",
      title: "Payment proof received",
      body: `${params.venueName} submitted payment proof for ${params.period}.`,
      metadata: {
        billing_cycle_id: params.cycleId,
        venue_id: params.venueId,
        target_path: `/superadmin/revenue/venues/${params.venueId}`,
      },
    })),
  );
}

export async function emitBillingSettledToVenueAdmins(params: {
  venueId: string;
  venueName: string;
  cycleId: string;
  period: string;
}): Promise<void> {
  const assignments = await listVenueAdminAssignmentsByVenue(params.venueId);
  await safeEmitMany(
    assignments.map((a) => ({
      user_id: a.admin_user_id,
      type: "billing_settled",
      category: "platform",
      title: "Billing settled",
      body: `Your ${params.period} billing for ${params.venueName} has been marked as paid.`,
      metadata: {
        billing_cycle_id: params.cycleId,
        venue_id: params.venueId,
        target_path: `/admin/billing/${params.cycleId}`,
      },
    })),
  );
}

export async function emitBillingProofRejectedToVenueAdmins(params: {
  venueId: string;
  venueName: string;
  cycleId: string;
  period: string;
  note: string | null;
}): Promise<void> {
  const assignments = await listVenueAdminAssignmentsByVenue(params.venueId);
  const noteText = params.note?.trim() ? ` Reason: ${params.note.trim()}` : "";
  await safeEmitMany(
    assignments.map((a) => ({
      user_id: a.admin_user_id,
      type: "billing_proof_rejected",
      category: "platform",
      title: "Payment proof rejected",
      body: `Your payment proof for ${params.period} was rejected.${noteText}`,
      metadata: {
        billing_cycle_id: params.cycleId,
        venue_id: params.venueId,
        target_path: `/admin/billing/${params.cycleId}`,
      },
    })),
  );
}

export async function emitNewBillingCycleToVenueAdmins(params: {
  venueId: string;
  venueName: string;
  cycleId: string;
  period: string;
}): Promise<void> {
  const assignments = await listVenueAdminAssignmentsByVenue(params.venueId);
  await safeEmitMany(
    assignments.map((a) => ({
      user_id: a.admin_user_id,
      type: "billing_new_cycle",
      category: "platform",
      title: "New billing statement",
      body: `Your ${params.period} billing statement for ${params.venueName} is ready.`,
      metadata: {
        billing_cycle_id: params.cycleId,
        venue_id: params.venueId,
        target_path: `/admin/billing/${params.cycleId}`,
      },
    })),
  );
}

export async function emitVenueDeletedToVenueAdmins(params: {
  venueId: string;
  venueName: string;
  adminIds: string[];
}): Promise<void> {
  if (params.adminIds.length === 0) return;
  await safeEmitMany(
    params.adminIds.map((user_id) => ({
      user_id,
      type: "venue_deleted_admin",
      category: "platform" as const,
      title: "Venue deleted",
      body: `"${params.venueName}" has been deleted by a platform admin.`,
      metadata: {
        venue_id: params.venueId,
        target_path: "/admin/venues",
      },
    })),
  );
}

export async function emitVenueUpdatedToVenueAdmins(params: {
  venueId: string;
  venueName: string;
  adminIds: string[];
}): Promise<void> {
  if (params.adminIds.length === 0) return;
  await safeEmitMany(
    params.adminIds.map((user_id) => ({
      user_id,
      type: "venue_updated_admin",
      category: "platform" as const,
      title: "Venue updated",
      body: `"${params.venueName}" was updated by a platform admin.`,
      metadata: {
        venue_id: params.venueId,
        target_path: `/admin/venues/${params.venueId}`,
      },
    })),
  );
}

export async function emitVenueRequestCreatedToSuperadmins(params: {
  requestId: string;
  venueName: string;
  requestedByName: string;
}): Promise<void> {
  const ids = await listSuperadminProfileIds();
  if (ids.length === 0) return;
  await safeEmitMany(
    ids.map((user_id) => ({
      user_id,
      type: "venue_request_created_superadmin",
      category: "platform",
      title: "New venue request",
      body: `${params.requestedByName} submitted a venue request for "${params.venueName}".`,
      metadata: {
        venue_request_id: params.requestId,
        target_path: "/superadmin/venues",
      },
    })),
  );
}

import { listVenueAdminAssignments } from "@/lib/data/courtly-db";
import type { Booking, CourtReview } from "@/lib/types/courtly";
import type { EmitNotificationInput } from "@/lib/notifications/repository";
import { createNotificationRepository } from "@/lib/notifications/repository-factory";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

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
  if (value === "confirmed" || value === "cancelled" || value === "completed") {
    return value;
  }
  if (typeof value === "string") {
    const t = value.trim().toLowerCase();
    if (t === "confirmed" || t === "cancelled" || t === "completed") {
      return t;
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
  bookerUserId: string;
}): Promise<void> {
  const assignments = await listVenueAdminAssignments();
  const adminIds = new Set(
    assignments
      .filter((a) => a.venue_id === params.venueId)
      .map((a) => a.admin_user_id),
  );
  adminIds.delete(params.bookerUserId);
  const inputs: EmitNotificationInput[] = [...adminIds].map((user_id) => ({
    user_id,
    type: "booking_created_admin",
    title: "New booking",
    body: `${params.bookerLabel} booked ${params.courtName} at ${params.venueName}.`,
    metadata: {
      booking_id: params.bookingId,
      target_path: "/admin/bookings",
    },
  }));
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

async function emitBookingLifecycleNotificationsInner(params: {
  prev: Booking;
  nextRow: Record<string, unknown>;
  bookingId: string;
  skipReviewReminder?: boolean;
}): Promise<void> {
  const prev = snapshotFromBooking(params.prev);
  const next = snapshotFromBookingRow(params.nextRow, prev);
  let uid = next.user_id ?? prev.user_id;
  if (!uid) {
    uid = await fetchBookingOwnerUserId(params.bookingId);
  }
  if (!uid) return;

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
    if (!params.skipReviewReminder) {
      await emitBookingCompletedReviewReminderIfNeeded({
        userId: uid,
        bookingId: params.bookingId,
        venueId: next.court_id === prev.court_id ? params.prev.venue_id : undefined,
      });
    }
    return;
  }

  const changed =
    prev.date !== next.date ||
    prev.start_time !== next.start_time ||
    prev.end_time !== next.end_time ||
    prev.court_id !== next.court_id ||
    prev.status !== next.status ||
    prev.admin_note !== next.admin_note;

  if (changed) {
    await safeEmitMany([
      {
        user_id: uid,
        type: "booking_changed",
        title: "Booking updated",
        body: "Your booking details were updated by the venue.",
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
  const assignments = await listVenueAdminAssignments();
  const adminIds = [
    ...new Set(
      assignments
        .filter((a) => a.venue_id === params.venueId)
        .map((a) => a.admin_user_id),
    ),
  ];
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

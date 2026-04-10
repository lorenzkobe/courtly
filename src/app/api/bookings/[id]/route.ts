import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import {
  applyPlayerMobileVisibility,
  enrichBookingsWithProfileMobile,
} from "@/lib/booking-player-mobile";
import {
  getBookingById,
  getCourtById,
  listPaymentTransactionsByBookingIdAdmin,
  listPaymentTransactionsByGroupIdAdmin,
  listBookingsFiltered,
  listCourtReviewsByVenue,
  listVenueAdminAssignmentsByAdminUser,
  updateRow,
} from "@/lib/data/courtly-db";
import { emitBookingLifecycleNotifications } from "@/lib/notifications/emit-from-server";
import type { Booking } from "@/lib/types/courtly";

function hydrateBooking(booking: Booking): Booking {
  return booking;
}

type Ctx = { params: Promise<{ id: string }> };

async function canReadBooking(
  user: Awaited<ReturnType<typeof readSessionUser>>,
  booking: Booking,
  adminVenueIds?: Set<string>,
  courtVenueByCourtId?: Map<string, string>,
): Promise<boolean> {
  if (!user) return false;
  if (user.email) {
    const userEmailNormalized = user.email.trim().toLowerCase();
    const playerEmailNormalized = (booking.player_email ?? "").trim().toLowerCase();
    if (
      userEmailNormalized &&
      playerEmailNormalized &&
      userEmailNormalized === playerEmailNormalized
    ) {
      return true;
    }
  }
  if (user.role === "superadmin") return true;
  if (user.role === "admin") {
    const venueIdFromCache = courtVenueByCourtId?.get(booking.court_id);
    if (venueIdFromCache) {
      return (adminVenueIds ?? new Set()).has(venueIdFromCache);
    }
    const court = await getCourtById(booking.court_id);
    if (!court) return false;
    courtVenueByCourtId?.set(booking.court_id, court.venue_id);
    if (adminVenueIds) return adminVenueIds.has(court.venue_id);
    const assignments = await listVenueAdminAssignmentsByAdminUser(user.id);
    return assignments.some((assignment) => assignment.venue_id === court.venue_id);
  }
  return false;
}

export async function GET(req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  const adminVenueIds =
    user?.role === "admin"
      ? new Set(
        (await listVenueAdminAssignmentsByAdminUser(user.id)).map(
          (assignment) => assignment.venue_id,
        ),
      )
      : undefined;
  const courtVenueByCourtId = new Map<string, string>();
  const { searchParams } = new URL(req.url);
  const includeGroup = searchParams.get("include_group") === "true";
  const includeContext = searchParams.get("include_context") === "true";
  const serverNowIso = new Date().toISOString();
  const { id } = await ctx.params;
  const booking = await getBookingById(id);
  if (!booking) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!(await canReadBooking(user, booking, adminVenueIds, courtVenueByCourtId))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!includeGroup) {
    const [enriched] = await enrichBookingsWithProfileMobile(
      [hydrateBooking(booking)],
      user,
    );
    if (!includeContext) {
      return NextResponse.json(
        applyPlayerMobileVisibility(enriched ?? hydrateBooking(booking), user),
      );
    }
    const court = await getCourtById(booking.court_id);
    const reviews = court?.venue_id
      ? await listCourtReviewsByVenue(court.venue_id)
      : [];
    const paymentTransactions =
      user?.role === "admin" || user?.role === "superadmin"
        ? await listPaymentTransactionsByBookingIdAdmin(booking.id)
        : [];
    return NextResponse.json({
      booking: applyPlayerMobileVisibility(
        enriched ?? hydrateBooking(booking),
        user,
      ),
      group_segments: [applyPlayerMobileVisibility(hydrateBooking(booking), user)],
      server_now: serverNowIso,
      ...(court ? { court } : {}),
      ...(reviews.length > 0 ? { reviews } : {}),
      ...(paymentTransactions.length > 0 ? { payment_transactions: paymentTransactions } : {}),
    });
  }

  const groupSegments = booking.booking_group_id
    ? (await listBookingsFiltered({ bookingGroupId: booking.booking_group_id }))
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
      .map(hydrateBooking)
    : [hydrateBooking(booking)];

  if (booking.booking_group_id) {
    const readable: Booking[] = [];
    for (const segment of groupSegments) {
      if (await canReadBooking(user, segment, adminVenueIds, courtVenueByCourtId)) {
        readable.push(segment);
      }
    }
    const [enrichedBooking] = await enrichBookingsWithProfileMobile(
      [hydrateBooking(booking)],
      user,
    );
    const enrichedSegments = await enrichBookingsWithProfileMobile(readable, user);
    if (!includeContext) {
      const paymentTransactions =
        user?.role === "admin" || user?.role === "superadmin"
          ? booking.booking_group_id
            ? await listPaymentTransactionsByGroupIdAdmin(booking.booking_group_id)
            : await listPaymentTransactionsByBookingIdAdmin(booking.id)
          : [];
      return NextResponse.json({
        booking: applyPlayerMobileVisibility(
          enrichedBooking ?? hydrateBooking(booking),
          user,
        ),
        group_segments: enrichedSegments.map((seg) =>
          applyPlayerMobileVisibility(hydrateBooking(seg), user),
        ),
        ...(paymentTransactions.length > 0 ? { payment_transactions: paymentTransactions } : {}),
      });
    }
    const court = await getCourtById(booking.court_id);
    const reviews = court?.venue_id
      ? await listCourtReviewsByVenue(court.venue_id)
      : [];
    const paymentTransactions =
      user?.role === "admin" || user?.role === "superadmin"
        ? booking.booking_group_id
          ? await listPaymentTransactionsByGroupIdAdmin(booking.booking_group_id)
          : await listPaymentTransactionsByBookingIdAdmin(booking.id)
        : [];
    return NextResponse.json({
      booking: applyPlayerMobileVisibility(
        enrichedBooking ?? hydrateBooking(booking),
        user,
      ),
      group_segments: enrichedSegments.map((seg) =>
        applyPlayerMobileVisibility(hydrateBooking(seg), user),
      ),
      server_now: serverNowIso,
      ...(court ? { court } : {}),
      ...(reviews.length > 0 ? { reviews } : {}),
      ...(paymentTransactions.length > 0 ? { payment_transactions: paymentTransactions } : {}),
    });
  }

  const [enrichedBooking] = await enrichBookingsWithProfileMobile(
    [hydrateBooking(booking)],
    user,
  );
  const enrichedGroupSegments = await enrichBookingsWithProfileMobile(groupSegments, user);
  if (!includeContext) {
    const paymentTransactions =
      user?.role === "admin" || user?.role === "superadmin"
        ? booking.booking_group_id
          ? await listPaymentTransactionsByGroupIdAdmin(booking.booking_group_id)
          : await listPaymentTransactionsByBookingIdAdmin(booking.id)
        : [];
    return NextResponse.json({
      booking: applyPlayerMobileVisibility(
        enrichedBooking ?? hydrateBooking(booking),
        user,
      ),
      group_segments: enrichedGroupSegments.map((seg) =>
        applyPlayerMobileVisibility(hydrateBooking(seg), user),
      ),
      ...(paymentTransactions.length > 0 ? { payment_transactions: paymentTransactions } : {}),
    });
  }
  const court = await getCourtById(booking.court_id);
  const reviews = court?.venue_id
    ? await listCourtReviewsByVenue(court.venue_id)
    : [];
  const paymentTransactions =
    user?.role === "admin" || user?.role === "superadmin"
      ? booking.booking_group_id
        ? await listPaymentTransactionsByGroupIdAdmin(booking.booking_group_id)
        : await listPaymentTransactionsByBookingIdAdmin(booking.id)
      : [];
  return NextResponse.json({
    booking: applyPlayerMobileVisibility(
      enrichedBooking ?? hydrateBooking(booking),
      user,
    ),
    group_segments: enrichedGroupSegments.map((seg) =>
      applyPlayerMobileVisibility(hydrateBooking(seg), user),
    ),
    server_now: serverNowIso,
    ...(court ? { court } : {}),
    ...(reviews.length > 0 ? { reviews } : {}),
    ...(paymentTransactions.length > 0 ? { payment_transactions: paymentTransactions } : {}),
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  const adminVenueIds =
    user?.role === "admin"
      ? new Set(
        (await listVenueAdminAssignmentsByAdminUser(user.id)).map(
          (assignment) => assignment.venue_id,
        ),
      )
      : undefined;
  const { id } = await ctx.params;
  const booking = await getBookingById(id);
  if (!booking) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const court = await getCourtById(booking.court_id);
  const body = (await req.json()) as Partial<Booking> & {
    admin_note?: string;
    clear_admin_note?: boolean;
  };
  const patch: Partial<Booking> = { ...body };
  delete (patch as { admin_note?: unknown }).admin_note;
  delete (patch as { clear_admin_note?: unknown }).clear_admin_note;
  delete (patch as { admin_notes?: unknown }).admin_notes;
  const ownerEmail = (user?.email ?? "").trim().toLowerCase();
  const bookingEmail = (booking.player_email ?? "").trim().toLowerCase();
  const ownerMatches = !!ownerEmail && ownerEmail === bookingEmail;

  const onlyStatusCancel =
    patch.status === "cancelled" && Object.keys(patch).length === 1;
  if (ownerMatches && onlyStatusCancel) {
    return NextResponse.json(
      { error: "This booking is paid. Please contact the venue to request cancellation." },
      { status: 403 },
    );
  }

  if (Object.prototype.hasOwnProperty.call(patch, "notes")) {
    return NextResponse.json(
      { error: "Booking note can only be set during booking creation" },
      { status: 400 },
    );
  }

  if (!court) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const canMutate =
    !!user &&
    (user.role === "superadmin" ||
      (user.role === "admin" && !!adminVenueIds?.has(court.venue_id)));
  if (!canMutate) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (user) {
    const wantsAdminNoteUpdate =
      typeof body.admin_note === "string" || body.clear_admin_note === true;
    if (wantsAdminNoteUpdate) {
      if (body.clear_admin_note === true) {
        patch.admin_note = undefined;
        patch.admin_note_updated_by_user_id = undefined;
        patch.admin_note_updated_by_name = undefined;
        patch.admin_note_updated_at = undefined;
      } else {
        const text = body.admin_note?.trim() ?? "";
        patch.admin_note = text || undefined;
        patch.admin_note_updated_by_user_id = text ? user.id : undefined;
        patch.admin_note_updated_by_name = text
          ? (user.full_name || user.email)
          : undefined;
        patch.admin_note_updated_at = text ? new Date().toISOString() : undefined;
      }
    }
  }

  const updated = await updateRow("bookings", id, {
    ...patch,
    admin_note: patch.admin_note ?? null,
    admin_note_updated_by_user_id: patch.admin_note_updated_by_user_id ?? null,
    admin_note_updated_by_name: patch.admin_note_updated_by_name ?? null,
    admin_note_updated_at: patch.admin_note_updated_at ?? null,
  });
  await emitBookingLifecycleNotifications({
    prev: booking,
    nextRow: updated as Record<string, unknown>,
    bookingId: id,
  });
  return NextResponse.json(hydrateBooking(updated as Booking));
}

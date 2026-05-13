import type { Booking } from "@/lib/types/courtly";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

/** Strip hydrated profile mobile unless the viewer is a venue admin or superadmin. */
export function applyPlayerMobileVisibility(
  booking: Booking,
  viewer: { role: string } | null | undefined,
): Booking {
  if (viewer?.role === "admin" || viewer?.role === "superadmin") {
    return booking;
  }
  if (booking.player_mobile_number === undefined) {
    return booking;
  }
  const rest = { ...booking };
  delete rest.player_mobile_number;
  return rest;
}

/** Hydrate booking.player_mobile_number for venue admins/superadmin via service-role client. */
export async function enrichBookingsWithProfileMobile(
  bookings: Booking[],
  viewer: { role: string } | null | undefined,
): Promise<Booking[]> {
  if (viewer?.role !== "admin" && viewer?.role !== "superadmin") {
    return bookings;
  }
  if (bookings.length === 0) return bookings;

  const userIds = [
    ...new Set(
      bookings.map((booking) => booking.user_id).filter((id): id is string => !!id),
    ),
  ];
  if (userIds.length === 0) {
    // Guest bookings already have player_mobile_number set from guest_phone — preserve it.
    return bookings.map((booking) => ({
      ...booking,
      player_mobile_number: booking.player_mobile_number ?? null,
    }));
  }

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id,mobile_number")
    .in("id", userIds);
  if (error) throw error;

  const mobileByUserId = new Map<string, string | null>();
  for (const row of data ?? []) {
    const rec = row as { id: string; mobile_number: string | null };
    const trimmed = typeof rec.mobile_number === "string" ? rec.mobile_number.trim() : "";
    mobileByUserId.set(rec.id, trimmed || null);
  }

  return bookings.map((booking) => {
    if (!booking.user_id) {
      // Guest booking — preserve player_mobile_number already mapped from guest_phone.
      return { ...booking, player_mobile_number: booking.player_mobile_number ?? null };
    }
    return {
      ...booking,
      player_mobile_number: mobileByUserId.get(booking.user_id) ?? null,
    };
  });
}

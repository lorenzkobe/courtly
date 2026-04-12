import { NextResponse } from "next/server";
import { readSessionUser } from "@/lib/auth/cookie-session";
import { canMutateVenue } from "@/lib/auth/management";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  deleteRow,
  getVenueById,
  hasConfirmedBookingsForVenue,
  listCourtsByVenue,
  listManagedUsersByIds,
  listVenueAdminAssignments,
  listVenueAdminAssignmentsByVenue,
  updateRow,
} from "@/lib/data/courtly-db";
import type { Venue } from "@/lib/types/courtly";
import {
  applyVenueMapCoordsToPatch,
  parseVenueMapCoordsForPatch,
} from "@/lib/venue-map-coords";
import {
  parseRateWindowsFromUnknown,
  validateVenuePriceRanges,
} from "@/lib/venue-price-ranges";
import { normalizeSocialUrl, validateSocialUrl } from "@/lib/social-url";
import { validateVenuePaymentSettings } from "@/lib/venue-payment-methods";

function pickVenuePatch(patch: Record<string, unknown>): Partial<Venue> {
  const keys: (keyof Venue)[] = [
    "name",
    "location",
    "contact_phone",
    "facebook_url",
    "instagram_url",
    "sport",
    "hourly_rate_windows",
    "status",
    "amenities",
    "image_url",
    "map_latitude",
    "map_longitude",
    "accepts_gcash",
    "gcash_account_name",
    "gcash_account_number",
    "accepts_maya",
    "maya_account_name",
    "maya_account_number",
  ];
  const out: Partial<Venue> = {};
  for (const key of keys) {
    if (key in patch && patch[key] !== undefined) {
      (out as Record<string, unknown>)[key as string] = patch[key];
    }
  }
  return out;
}

type Ctx = { params: Promise<{ venueId: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  const { venueId } = await ctx.params;
  const assignments = await listVenueAdminAssignmentsByVenue(venueId);
  const canRead = !!user && canMutateVenue(user, venueId, assignments);
  if (!canRead) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const [venue, courts, managedUsers] = await Promise.all([
    getVenueById(venueId),
    listCourtsByVenue(venueId),
    listManagedUsersByIds(assignments.map((row) => row.admin_user_id)),
  ]);
  const detail = venue
    ? {
        venue,
        courts,
        admins: managedUsers,
      }
    : null;
  if (!detail) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(detail);
}

export async function PATCH(req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  const { venueId } = await ctx.params;
  const assignments = await listVenueAdminAssignments();
  const canWrite = !!user && canMutateVenue(user, venueId, assignments);
  if (!canWrite) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const cur = await getVenueById(venueId);
  if (!cur) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const patch = (await req.json()) as Record<string, unknown> & {
    add_admin_user_ids?: string[];
    remove_admin_user_ids?: string[];
  };

  const hasAssignmentPatch =
    Object.prototype.hasOwnProperty.call(patch, "add_admin_user_ids") ||
    Object.prototype.hasOwnProperty.call(patch, "remove_admin_user_ids");
  if (hasAssignmentPatch && user.role !== "superadmin") {
    return NextResponse.json(
      { error: "Only superadmins can change venue admin assignments." },
      { status: 403 },
    );
  }
  const addAdminIds = Array.isArray(patch.add_admin_user_ids)
    ? [
        ...new Set(
          patch.add_admin_user_ids
            .map((id) => (typeof id === "string" ? id.trim() : ""))
            .filter(Boolean),
        ),
      ]
    : [];
  const removeAdminIds = Array.isArray(patch.remove_admin_user_ids)
    ? [
        ...new Set(
          patch.remove_admin_user_ids
            .map((id) => (typeof id === "string" ? id.trim() : ""))
            .filter(Boolean),
        ),
      ]
    : [];
  if (user.role === "superadmin" && addAdminIds.length > 0) {
    const managedUsers = await listManagedUsersByIds(addAdminIds);
    const invalidIds = addAdminIds.filter(
      (id) =>
        !managedUsers.some(
          (managedUser) => managedUser.id === id && managedUser.role === "admin",
        ),
    );
    if (invalidIds.length > 0) {
      return NextResponse.json(
        { error: "Only existing court admins can be assigned to a venue." },
        { status: 400 },
      );
    }
  }
  if (patch.status === "closed") {
    const hasConfirmed = await hasConfirmedBookingsForVenue(venueId);
    if (hasConfirmed) {
      return NextResponse.json(
        {
          error:
            "Cannot set this venue inactive while it has confirmed bookings. Cancel or complete those bookings first.",
        },
        { status: 409 },
      );
    }
  }

  const mapParse = parseVenueMapCoordsForPatch(patch);
  if (!mapParse.ok) {
    return NextResponse.json({ error: mapParse.error }, { status: 400 });
  }

  const patchSansMap = { ...patch };
  delete patchSansMap.map_latitude;
  delete patchSansMap.map_longitude;
  delete patchSansMap.add_admin_user_ids;
  delete patchSansMap.remove_admin_user_ids;

  const venuePatch = pickVenuePatch(patchSansMap) as Partial<Venue>;
  applyVenueMapCoordsToPatch(venuePatch as Record<string, unknown>, mapParse);

  if (venuePatch.hourly_rate_windows !== undefined) {
    const parsed = parseRateWindowsFromUnknown(venuePatch.hourly_rate_windows);
    const check = validateVenuePriceRanges(parsed);
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 400 });
    }
    venuePatch.hourly_rate_windows = parsed;
  }
  if (Object.prototype.hasOwnProperty.call(venuePatch, "facebook_url")) {
    const value = normalizeSocialUrl(venuePatch.facebook_url);
    const error = validateSocialUrl(value, "facebook");
    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }
    venuePatch.facebook_url = value;
  }
  if (Object.prototype.hasOwnProperty.call(venuePatch, "instagram_url")) {
    const value = normalizeSocialUrl(venuePatch.instagram_url);
    const error = validateSocialUrl(value, "instagram");
    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }
    venuePatch.instagram_url = value;
  }
  const paymentKeys: Array<keyof Venue> = [
    "accepts_gcash",
    "gcash_account_name",
    "gcash_account_number",
    "accepts_maya",
    "maya_account_name",
    "maya_account_number",
  ];
  const hasPaymentPatch = paymentKeys.some((key) =>
    Object.prototype.hasOwnProperty.call(venuePatch, key),
  );
  const nextStatus = (venuePatch.status ?? cur.status) === "active" ? "active" : "closed";
  const mergedPaymentSource = {
    accepts_gcash: hasPaymentPatch
      ? (venuePatch.accepts_gcash as boolean | undefined)
      : cur.accepts_gcash,
    gcash_account_name: hasPaymentPatch
      ? (venuePatch.gcash_account_name as string | undefined)
      : cur.gcash_account_name,
    gcash_account_number: hasPaymentPatch
      ? (venuePatch.gcash_account_number as string | undefined)
      : cur.gcash_account_number,
    accepts_maya: hasPaymentPatch
      ? (venuePatch.accepts_maya as boolean | undefined)
      : cur.accepts_maya,
    maya_account_name: hasPaymentPatch
      ? (venuePatch.maya_account_name as string | undefined)
      : cur.maya_account_name,
    maya_account_number: hasPaymentPatch
      ? (venuePatch.maya_account_number as string | undefined)
      : cur.maya_account_number,
  };
  const paymentSettings = validateVenuePaymentSettings(mergedPaymentSource, {
    requireAtLeastOne: nextStatus === "active",
  });
  if (!paymentSettings.ok) {
    return NextResponse.json({ error: paymentSettings.error }, { status: 400 });
  }
  if (hasPaymentPatch) {
    venuePatch.accepts_gcash = paymentSettings.value.accepts_gcash;
    venuePatch.gcash_account_name = paymentSettings.value.gcash_account_name;
    venuePatch.gcash_account_number = paymentSettings.value.gcash_account_number;
    venuePatch.accepts_maya = paymentSettings.value.accepts_maya;
    venuePatch.maya_account_name = paymentSettings.value.maya_account_name;
    venuePatch.maya_account_number = paymentSettings.value.maya_account_number;
  }
  const next = await updateRow<Venue>("venues", venueId, venuePatch);

  if (user.role === "superadmin" && hasAssignmentPatch) {
    const supabase = await createSupabaseServerClient();
    if (addAdminIds.length > 0) {
      const addRows = addAdminIds.map((adminUserId) => ({
        venue_id: venueId,
        admin_user_id: adminUserId,
      }));
      const { error: addError } = await supabase
        .from("venue_admin_assignments")
        .upsert(addRows as never, { onConflict: "venue_id,admin_user_id" });
      if (addError) {
        return NextResponse.json({ error: addError.message }, { status: 500 });
      }
    }
    if (removeAdminIds.length > 0) {
      const { error: removeError } = await supabase
        .from("venue_admin_assignments")
        .delete()
        .eq("venue_id", venueId)
        .in("admin_user_id", removeAdminIds);
      if (removeError) {
        return NextResponse.json({ error: removeError.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json(next);
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const user = await readSessionUser();
  if (user?.role !== "superadmin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { venueId } = await ctx.params;
  const [venue, courtsAtVenue, hasActiveBookings] = await Promise.all([
    getVenueById(venueId),
    listCourtsByVenue(venueId),
    hasConfirmedBookingsForVenue(venueId),
  ]);
  if (!venue) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (hasActiveBookings) {
    return NextResponse.json(
      {
        error:
          "Cannot delete this venue while it has active bookings on its courts. Cancel or complete those bookings first.",
      },
      { status: 409 },
    );
  }

  const linked = courtsAtVenue.length > 0;
  if (linked) {
    return NextResponse.json(
      {
        error:
          "Cannot delete a venue that still has courts assigned. Reassign or remove courts first.",
      },
      { status: 409 },
    );
  }

  await deleteRow("venues", venueId);
  return NextResponse.json({ ok: true });
}

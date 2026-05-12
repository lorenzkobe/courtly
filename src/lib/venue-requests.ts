import type { Venue, VenueRequest } from "@/lib/types/courtly";
import { parseVenueMapCoordsForCreate } from "@/lib/venue-map-coords";
import {
  parseRateWindowsFromUnknown,
  validateVenuePriceRanges,
} from "@/lib/venue-price-ranges";
import { normalizeSocialUrl, validateSocialUrl } from "@/lib/social-url";
import { validateVenuePaymentSettings } from "@/lib/venue-payment-methods";
import { isValidPhMobile, normalizePhMobile } from "@/lib/validation/person-fields";
import { VENUE_PHOTO_MIN_COUNT } from "@/lib/venues/venue-photo-constraints";

export type NormalizedVenueDraft = Omit<
  VenueRequest,
  | "id"
  | "request_status"
  | "requested_by"
  | "reviewed_by"
  | "reviewed_at"
  | "review_note"
  | "approved_venue_id"
  | "created_at"
  | "updated_at"
>;

export function normalizeVenueDraftFromBody(
  body: Record<string, unknown>,
): { ok: true; value: NormalizedVenueDraft } | { ok: false; error: string } {
  const mapCoords = parseVenueMapCoordsForCreate(body);
  if (!mapCoords.ok) {
    return { ok: false, error: mapCoords.error };
  }

  const hourlyRateWindows = parseRateWindowsFromUnknown(body.hourly_rate_windows);
  const rangeCheck = validateVenuePriceRanges(hourlyRateWindows);
  if (!rangeCheck.ok) {
    return { ok: false, error: rangeCheck.error };
  }

  const facebookUrl = normalizeSocialUrl(body.facebook_url);
  const facebookError = validateSocialUrl(facebookUrl, "facebook");
  if (facebookError) {
    return { ok: false, error: facebookError };
  }

  const instagramUrl = normalizeSocialUrl(body.instagram_url);
  const instagramError = validateSocialUrl(instagramUrl, "instagram");
  if (instagramError) {
    return { ok: false, error: instagramError };
  }

  const paymentSettings = validateVenuePaymentSettings(body, {
    requireAtLeastOne: true,
  });
  if (!paymentSettings.ok) {
    return { ok: false, error: paymentSettings.error };
  }

  const nextValue: NormalizedVenueDraft = {
    name: typeof body.name === "string" ? body.name.trim() : "",
    location: typeof body.location === "string" ? body.location.trim() : "",
    contact_phone:
      typeof body.contact_phone === "string"
        ? normalizePhMobile(body.contact_phone)
        : "",
    facebook_url: facebookUrl,
    instagram_url: instagramUrl,
    sport:
      body.sport === "pickleball" ||
      body.sport === "tennis" ||
      body.sport === "badminton" ||
      body.sport === "padel"
        ? body.sport
        : "pickleball",
    hourly_rate_windows: hourlyRateWindows,
    status: body.status === "closed" ? "closed" : "active",
    amenities: Array.isArray(body.amenities)
      ? body.amenities
          .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
          .filter(Boolean)
      : [],
    photo_urls: Array.isArray(body.photo_urls)
      ? (body.photo_urls as unknown[]).filter((u): u is string => typeof u === "string" && u.length > 0)
      : [],
    accepts_gcash: paymentSettings.value.accepts_gcash,
    gcash_account_name: paymentSettings.value.gcash_account_name,
    gcash_account_number: paymentSettings.value.gcash_account_number
      ? normalizePhMobile(paymentSettings.value.gcash_account_number)
      : undefined,
    accepts_maya: paymentSettings.value.accepts_maya,
    maya_account_name: paymentSettings.value.maya_account_name,
    maya_account_number: paymentSettings.value.maya_account_number
      ? normalizePhMobile(paymentSettings.value.maya_account_number)
      : undefined,
    ...(mapCoords.mode === "set"
      ? {
          map_latitude: mapCoords.map_latitude,
          map_longitude: mapCoords.map_longitude,
        }
      : {}),
  };


  if (!nextValue.name || !nextValue.location || !nextValue.contact_phone || nextValue.photo_urls.length < VENUE_PHOTO_MIN_COUNT) {
    return {
      ok: false,
      error: `Name, location, contact number, and at least ${VENUE_PHOTO_MIN_COUNT} photos are required.`,
    };
  }
  if (!isValidPhMobile(nextValue.contact_phone)) {
    return {
      ok: false,
      error: "Contact number must be a valid PH mobile number (0917... or +63917...).",
    };
  }
  if (
    nextValue.accepts_gcash &&
    (!nextValue.gcash_account_number ||
      !isValidPhMobile(nextValue.gcash_account_number))
  ) {
    return {
      ok: false,
      error: "GCash account number must be a valid PH mobile number.",
    };
  }
  if (
    nextValue.accepts_maya &&
    (!nextValue.maya_account_number ||
      !isValidPhMobile(nextValue.maya_account_number))
  ) {
    return {
      ok: false,
      error: "Maya account number must be a valid PH mobile number.",
    };
  }

  return { ok: true, value: nextValue };
}

function normalizedName(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function distanceMeters(
  aLat: number,
  aLng: number,
  bLat: number,
  bLng: number,
): number {
  const earthRadiusMeters = 6371e3;
  const phi1 = (aLat * Math.PI) / 180;
  const phi2 = (bLat * Math.PI) / 180;
  const deltaPhi = ((bLat - aLat) * Math.PI) / 180;
  const deltaLambda = ((bLng - aLng) * Math.PI) / 180;
  const h =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) *
      Math.cos(phi2) *
      Math.sin(deltaLambda / 2) *
      Math.sin(deltaLambda / 2);
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

type VenueLike = Pick<Venue, "id" | "name" | "map_latitude" | "map_longitude">;
type RequestLike = Pick<
  VenueRequest,
  "id" | "name" | "map_latitude" | "map_longitude" | "request_status"
>;

export function findPotentialVenueDuplicate(
  draft: Pick<NormalizedVenueDraft, "name" | "map_latitude" | "map_longitude">,
  venues: VenueLike[],
  pendingRequests: RequestLike[],
  opts?: { ignoreRequestId?: string },
): { type: "venue" | "request"; id: string; name: string } | null {
  const candidateName = normalizedName(draft.name);
  const hasCandidateCoords =
    typeof draft.map_latitude === "number" &&
    Number.isFinite(draft.map_latitude) &&
    typeof draft.map_longitude === "number" &&
    Number.isFinite(draft.map_longitude);
  for (const venue of venues) {
    const sameName = normalizedName(venue.name) === candidateName;
    if (!sameName) continue;
    if (!hasCandidateCoords) {
      return { type: "venue", id: venue.id, name: venue.name };
    }
    const hasVenueCoords =
      typeof venue.map_latitude === "number" &&
      typeof venue.map_longitude === "number";
    if (!hasVenueCoords) {
      return { type: "venue", id: venue.id, name: venue.name };
    }
    const meters = distanceMeters(
      draft.map_latitude!,
      draft.map_longitude!,
      venue.map_latitude!,
      venue.map_longitude!,
    );
    if (meters <= 300) {
      return { type: "venue", id: venue.id, name: venue.name };
    }
  }
  for (const request of pendingRequests) {
    if (opts?.ignoreRequestId && request.id === opts.ignoreRequestId) continue;
    if (request.request_status !== "pending") continue;
    const sameName = normalizedName(request.name) === candidateName;
    if (!sameName) continue;
    if (!hasCandidateCoords) {
      return { type: "request", id: request.id, name: request.name };
    }
    const hasRequestCoords =
      typeof request.map_latitude === "number" &&
      typeof request.map_longitude === "number";
    if (!hasRequestCoords) {
      return { type: "request", id: request.id, name: request.name };
    }
    const meters = distanceMeters(
      draft.map_latitude!,
      draft.map_longitude!,
      request.map_latitude!,
      request.map_longitude!,
    );
    if (meters <= 300) {
      return { type: "request", id: request.id, name: request.name };
    }
  }
  return null;
}

function toNumberOrNaN(n: unknown): number {
  if (typeof n === "number") return n;
  if (typeof n === "string" && n.trim() !== "") return Number(n);
  return NaN;
}

function validateLatLng(lat: number, lng: number): string | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return "map_latitude and map_longitude must be valid numbers";
  }
  if (lat < -90 || lat > 90) {
    return "map_latitude must be between -90 and 90";
  }
  if (lng < -180 || lng > 180) {
    return "map_longitude must be between -180 and 180";
  }
  return null;
}

export type VenueMapCoordsCreateResult =
  | { ok: true; mode: "omit" }
  | { ok: true; mode: "set"; map_latitude: number; map_longitude: number }
  | { ok: false; error: string };

/** Optional coords on venue POST — both keys must appear together if either is sent. */
export function parseVenueMapCoordsForCreate(
  body: Record<string, unknown>,
): VenueMapCoordsCreateResult {
  const hasLat = Object.prototype.hasOwnProperty.call(body, "map_latitude");
  const hasLng = Object.prototype.hasOwnProperty.call(body, "map_longitude");
  if (!hasLat && !hasLng) return { ok: true, mode: "omit" };
  if (hasLat !== hasLng) {
    return {
      ok: false,
      error: "map_latitude and map_longitude must be sent together",
    };
  }
  const latRaw = body.map_latitude;
  const lngRaw = body.map_longitude;
  if (latRaw === null && lngRaw === null) return { ok: true, mode: "omit" };
  const lat = toNumberOrNaN(latRaw);
  const lng = toNumberOrNaN(lngRaw);
  const err = validateLatLng(lat, lng);
  if (err) return { ok: false, error: err };
  return { ok: true, mode: "set", map_latitude: lat, map_longitude: lng };
}

export type VenueMapCoordsPatchResult =
  | { ok: true; mode: "omit" }
  | { ok: true; mode: "clear" }
  | { ok: true; mode: "set"; map_latitude: number; map_longitude: number }
  | { ok: false; error: string };

/** Coords on PATCH: omit both keys if absent; both null clears; both numbers sets. */
export function parseVenueMapCoordsForPatch(
  body: Record<string, unknown>,
): VenueMapCoordsPatchResult {
  const hasLat = Object.prototype.hasOwnProperty.call(body, "map_latitude");
  const hasLng = Object.prototype.hasOwnProperty.call(body, "map_longitude");
  if (!hasLat && !hasLng) return { ok: true, mode: "omit" };
  if (hasLat !== hasLng) {
    return {
      ok: false,
      error: "map_latitude and map_longitude must be sent together",
    };
  }
  const latRaw = body.map_latitude;
  const lngRaw = body.map_longitude;
  if (latRaw === null && lngRaw === null) {
    return { ok: true, mode: "clear" };
  }
  const lat = toNumberOrNaN(latRaw);
  const lng = toNumberOrNaN(lngRaw);
  const err = validateLatLng(lat, lng);
  if (err) return { ok: false, error: err };
  return { ok: true, mode: "set", map_latitude: lat, map_longitude: lng };
}

export function applyVenueMapCoordsToPatch(
  venuePatch: Record<string, unknown>,
  mapResult: Exclude<VenueMapCoordsPatchResult, { ok: false }>,
) {
  if (mapResult.mode === "omit") return;
  if (mapResult.mode === "clear") {
    venuePatch.map_latitude = null;
    venuePatch.map_longitude = null;
    return;
  }
  venuePatch.map_latitude = mapResult.map_latitude;
  venuePatch.map_longitude = mapResult.map_longitude;
}

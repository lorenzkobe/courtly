"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { courtlyApi } from "@/lib/api/courtly-client";
import { useAuth } from "@/lib/auth/auth-context";

const STORAGE_KEY = "courtly.favoriteVenueIds";
const CHANGED = "courtly-favorites-changed";

const serverEmpty = new Set<string>();

function parse(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(
      arr.filter((element): element is string => typeof element === "string"),
    );
  } catch {
    return new Set();
  }
}

let cachedJson: string | null | undefined;
let cachedSet: Set<string> = new Set();

function getSnapshot(): Set<string> {
  if (typeof window === "undefined") return serverEmpty;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw !== cachedJson) {
    cachedJson = raw;
    cachedSet = parse(raw);
  }
  return cachedSet;
}

function subscribe(onChange: () => void) {
  const handler = () => onChange();
  window.addEventListener("storage", handler);
  window.addEventListener(CHANGED, handler);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener(CHANGED, handler);
  };
}

export function useFavoriteVenueIds() {
  const { user } = useAuth();
  const hydratedUserIdRef = useRef<string | null>(null);
  const favoriteIds = useSyncExternalStore(subscribe, getSnapshot, () => serverEmpty);

  useEffect(() => {
    if (!user?.id) {
      hydratedUserIdRef.current = null;
      return;
    }
    if (hydratedUserIdRef.current === user.id) return;
    hydratedUserIdRef.current = user.id;
    void (async () => {
      try {
        const { data } = await courtlyApi.favoriteVenues.list();
        const next = new Set(data.venue_ids);
        const json = JSON.stringify([...next]);
        window.localStorage.setItem(STORAGE_KEY, json);
        cachedJson = json;
        cachedSet = next;
        window.dispatchEvent(new Event(CHANGED));
      } catch {
        // Keep local-only fallback when server fetch fails.
      }
    })();
  }, [user?.id]);

  const toggleFavorite = useCallback((venueId: string) => {
    const next = new Set(getSnapshot());
    if (next.has(venueId)) next.delete(venueId);
    else next.add(venueId);
    const json = JSON.stringify([...next]);
    try {
      window.localStorage.setItem(STORAGE_KEY, json);
    } catch {
      /* quota */
    }
    cachedJson = json;
    cachedSet = next;
    window.dispatchEvent(new Event(CHANGED));
    if (!user?.id) return;
    void courtlyApi.favoriteVenues.set(venueId, next.has(venueId)).catch(() => {
      const rollback = new Set(getSnapshot());
      if (rollback.has(venueId)) rollback.delete(venueId);
      else rollback.add(venueId);
      const rollbackJson = JSON.stringify([...rollback]);
      try {
        window.localStorage.setItem(STORAGE_KEY, rollbackJson);
      } catch {
        // noop
      }
      cachedJson = rollbackJson;
      cachedSet = rollback;
      window.dispatchEvent(new Event(CHANGED));
    });
  }, [user?.id]);

  const isFavorite = useCallback(
    (venueId: string) => favoriteIds.has(venueId),
    [favoriteIds],
  );

  return { favoriteIds, toggleFavorite, isFavorite };
}

"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "courtly.favoriteCourtIds";
const CHANGED = "courtly-favorites-changed";

const serverEmpty = new Set<string>();

function parse(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return new Set();
    return new Set(arr.filter((x): x is string => typeof x === "string"));
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

export function useFavoriteCourtIds() {
  const favoriteIds = useSyncExternalStore(subscribe, getSnapshot, () => serverEmpty);

  const toggleFavorite = useCallback((courtId: string) => {
    const next = new Set(getSnapshot());
    if (next.has(courtId)) next.delete(courtId);
    else next.add(courtId);
    const json = JSON.stringify([...next]);
    try {
      window.localStorage.setItem(STORAGE_KEY, json);
    } catch {
      /* quota */
    }
    cachedJson = json;
    cachedSet = next;
    window.dispatchEvent(new Event(CHANGED));
  }, []);

  const isFavorite = useCallback(
    (courtId: string) => favoriteIds.has(courtId),
    [favoriteIds],
  );

  return { favoriteIds, toggleFavorite, isFavorite };
}

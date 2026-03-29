"use client";

import { importLibrary, setOptions } from "@googlemaps/js-api-loader";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

export type VenueMapPinValue = { lat: number; lng: number } | null;

type Props = {
  value: VenueMapPinValue;
  onChange: (next: VenueMapPinValue) => void;
  /** When false, map click/drag only (no Places search). Use for venue edit / venue admins. */
  showPlaceSearch?: boolean;
};

const DEFAULT_CENTER = { lat: 14.5995, lng: 120.9842 };

const PLACES_API_LIBRARY_URL =
  "https://console.cloud.google.com/apis/library/places.googleapis.com";

function placesConsoleUrlFromError(message: string): string {
  const m = message.match(/project\s+(\d+)/i);
  if (m?.[1]) {
    return `https://console.developers.google.com/apis/api/places.googleapis.com/overview?project=${m[1]}`;
  }
  return PLACES_API_LIBRARY_URL;
}

function textFromGmpNetworkError(ev: Event): string {
  if (ev instanceof ErrorEvent && ev.message?.trim()) {
    return ev.message.trim();
  }
  const ce = ev as CustomEvent<{ message?: string }>;
  if (ce.detail?.message?.trim()) {
    return ce.detail.message.trim();
  }
  const unknown = ev as unknown as { message?: string; error?: { message?: string } };
  return (
    unknown.message ??
    unknown.error?.message ??
    "Places search failed. Enable Places API (New) for your Google Cloud project."
  );
}

type PlacesLibWithPac = {
  PlaceAutocompleteElement: typeof google.maps.places.PlaceAutocompleteElement;
};

function getPlaceAutocompleteCtor(placesLib: object) {
  const lib = placesLib as PlacesLibWithPac;
  if (typeof lib.PlaceAutocompleteElement !== "function") {
    throw new Error("PlaceAutocompleteElement missing from Places library");
  }
  return lib.PlaceAutocompleteElement;
}

function placePredictionFromGmpSelect(
  ev: Event,
): google.maps.places.PlacePrediction | null {
  const raw = ev as unknown as { placePrediction?: google.maps.places.PlacePrediction | null };
  return raw.placePrediction ?? null;
}

export function VenueMapPinPicker({
  value,
  onChange,
  showPlaceSearch = true,
}: Props) {
  const mapElRef = useRef<HTMLDivElement>(null);
  const pacHostRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const markerClassRef = useRef<google.maps.MarkerLibrary["Marker"] | null>(null);
  const pacElementRef = useRef<google.maps.places.PlaceAutocompleteElement | null>(null);
  const onChangeRef = useRef(onChange);
  const [mapReady, setMapReady] = useState(false);
  const [loadError, setLoadError] = useState<"missing_key" | "load_failed" | null>(
    null,
  );
  const [placesSearchError, setPlacesSearchError] = useState<string | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const ensureMarkerOnMap = useCallback((map: google.maps.Map) => {
    const Marker = markerClassRef.current;
    if (!Marker) return null;
    if (markerRef.current) return markerRef.current;
    const marker = new Marker({
      map,
      draggable: true,
    });
    marker.addListener("dragend", () => {
      const pos = marker.getPosition();
      if (!pos) return;
      onChangeRef.current({ lat: pos.lat(), lng: pos.lng() });
    });
    markerRef.current = marker;
    return marker;
  }, []);

  const applyPin = useCallback(
    (map: google.maps.Map, lat: number, lng: number) => {
      const marker = ensureMarkerOnMap(map);
      if (!marker) return;
      marker.setPosition({ lat, lng });
      marker.setMap(map);
      map.panTo({ lat, lng });
      map.setZoom(16);
      onChangeRef.current({ lat, lng });
    },
    [ensureMarkerOnMap],
  );

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
    if (!apiKey) {
      setLoadError("missing_key");
      return;
    }

    const initialPin = value;
    let cancelled = false;
    const listeners: Array<{ remove: () => void }> = [];
    let pacHostMounted: HTMLDivElement | null = null;

    void (async () => {
      try {
        setOptions({ key: apiKey, v: "weekly" });
        const mapsLib = await importLibrary("maps");
        const markerLib = await importLibrary("marker");
        const mapEl = mapElRef.current;
        if (cancelled || !mapEl) return;

        markerClassRef.current = markerLib.Marker;

        const center = initialPin ?? DEFAULT_CENTER;
        const map = new mapsLib.Map(mapEl, {
          center,
          zoom: initialPin ? 16 : 11,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });
        mapRef.current = map;

        if (showPlaceSearch) {
          const pacHost = pacHostRef.current;
          if (!pacHost) return;

          const placesLib = await importLibrary("places");
          const PlaceAutocompleteElement = getPlaceAutocompleteCtor(placesLib);

          const pac = new PlaceAutocompleteElement({
            requestedRegion: "ph",
          });
          pac.id = "venue-place-autocomplete";
          pac.setAttribute("placeholder", "Search for the venue or address");
          pac.className = "block w-full";
          pacHost.replaceChildren(pac);
          pacHostMounted = pacHost;
          pacElementRef.current = pac;

          const syncSearchBias = () => {
            const b = map.getBounds();
            if (b) pac.locationBias = b;
          };
          listeners.push(map.addListener("bounds_changed", syncSearchBias));
          syncSearchBias();

          const onGmpSelect = async (ev: Event) => {
            const prediction = placePredictionFromGmpSelect(ev);
            if (!prediction) return;
            try {
              const place = prediction.toPlace();
              const { place: loaded } = await place.fetchFields({ fields: ["location"] });
              const loc = loaded.location;
              if (!loc) return;
              setPlacesSearchError(null);
              applyPin(map, loc.lat(), loc.lng());
            } catch (err) {
              const msg =
                err instanceof Error && err.message
                  ? err.message
                  : "Could not load place details. Check Places API (New) and billing.";
              setPlacesSearchError(msg);
            }
          };
          pac.addEventListener("gmp-select", (e) => {
            void onGmpSelect(e);
          });

          pac.addEventListener("gmp-error", (ev: Event) => {
            setPlacesSearchError(textFromGmpNetworkError(ev));
          });
        } else {
          pacElementRef.current = null;
        }

        listeners.push(
          map.addListener("click", (e: google.maps.MapMouseEvent) => {
            if (!e.latLng) return;
            setPlacesSearchError(null);
            applyPin(map, e.latLng.lat(), e.latLng.lng());
          }),
        );

        if (initialPin) {
          const marker = ensureMarkerOnMap(map);
          if (marker) {
            marker.setPosition(initialPin);
            marker.setMap(map);
          }
        }

        setMapReady(true);
      } catch {
        if (!cancelled) setLoadError("load_failed");
      }
    })();

    return () => {
      cancelled = true;
      for (const l of listeners) {
        l.remove();
      }
      pacElementRef.current = null;
      pacHostMounted?.replaceChildren();
      markerClassRef.current = null;
      if (markerRef.current) {
        markerRef.current.setMap(null);
        markerRef.current = null;
      }
      mapRef.current = null;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialPin at mount; parent remounts via key
  }, [applyPin, ensureMarkerOnMap, showPlaceSearch]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    if (value) {
      const marker = ensureMarkerOnMap(map);
      if (!marker) return;
      marker.setPosition(value);
      marker.setMap(map);
      map.panTo(value);
    } else if (markerRef.current) {
      markerRef.current.setMap(null);
      markerRef.current = null;
    }
  }, [value, mapReady, ensureMarkerOnMap]);

  const clearPacValue = () => {
    const el = pacElementRef.current;
    if (!el) return;
    try {
      (el as unknown as { value?: string }).value = "";
    } catch {
      /* optional on older typings */
    }
  };

  if (loadError === "missing_key") {
    return (
      <div className="rounded-xl border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
        Set <code className="rounded bg-muted px-1">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code>{" "}
        and enable <strong>Maps JavaScript API</strong>
        {showPlaceSearch ? (
          <>
            {" "}
            plus <strong>Places API (New)</strong> in Google Cloud (referrer-restricted key).
          </>
        ) : (
          <> in Google Cloud (referrer-restricted key).</>
        )}
      </div>
    );
  }

  if (loadError === "load_failed") {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
        {showPlaceSearch
          ? "Could not load Google Maps. Confirm the key, billing, and that Places API (New) is enabled."
          : "Could not load Google Maps. Confirm the key and billing."}
      </div>
    );
  }

  return (
    <div className="venue-map-pin-picker space-y-2">
      {showPlaceSearch ? (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <Label htmlFor="venue-place-autocomplete">Find on map</Label>
              <div
                ref={pacHostRef}
                className="mt-1.5 w-full [&_gmp-place-autocomplete]:block [&_gmp-place-autocomplete]:w-full"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={!value}
              onClick={() => {
                setPlacesSearchError(null);
                onChange(null);
                clearPacValue();
              }}
            >
              Clear pin
            </Button>
          </div>
          {placesSearchError ? (
            <div
              role="alert"
              className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2.5 text-xs text-foreground"
            >
              <p className="font-medium">Could not reach Places</p>
              <p className="mt-1.5 whitespace-pre-wrap text-muted-foreground">{placesSearchError}</p>
              <a
                href={placesConsoleUrlFromError(placesSearchError)}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-flex font-medium text-primary underline-offset-4 hover:underline"
              >
                Open Google Cloud — enable Places API (New)
              </a>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                After enabling, wait a few minutes for Google to propagate, then try again. You can still{" "}
                <strong>click the map</strong> to set a pin without search.
              </p>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            Search for a place, or <strong>click the map</strong> to drop the pin; drag the pin to
            fine-tune. This sets the map players see when booking.
          </p>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <Label>Map pin</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Click the map to place the pin, or drag it to adjust. This is what players see on the
                booking page.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              disabled={!value}
              onClick={() => {
                onChange(null);
              }}
            >
              Clear pin
            </Button>
          </div>
        </>
      )}
      <div
        ref={mapElRef}
        className="h-52 w-full cursor-crosshair overflow-hidden rounded-xl border border-border bg-muted/20"
        role="presentation"
        title="Click to place or move pin"
      />
    </div>
  );
}

"use client";

import "leaflet/dist/leaflet.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type VenueMapPinValue = { lat: number; lng: number } | null;

type Props = {
  value: VenueMapPinValue;
  onChange: (next: VenueMapPinValue) => void;
  /** When false, map click/drag only (no address search). */
  showPlaceSearch?: boolean;
  /** Non-interactive preview mode. */
  readOnly?: boolean;
  /** Called when address details are resolved — from search or reverse geocoding a click/drag. */
  onPlaceDetails?: (details: { city?: string; address?: string }) => void;
};

const DEFAULT_CENTER = { lat: 14.5995, lng: 120.9842 };

type NominatimResult = {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  address: {
    city?: string;
    town?: string;
    municipality?: string;
    county?: string;
  };
};

function extractCity(addr: NominatimResult["address"]): string | undefined {
  return addr.city ?? addr.town ?? addr.municipality ?? addr.county;
}

async function reverseGeocodeNominatim(
  lat: number,
  lng: number,
): Promise<{ city?: string; address?: string } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1`,
      { headers: { "Accept-Language": "en" } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as NominatimResult;
    return { city: extractCity(data.address), address: data.display_name };
  } catch {
    return null;
  }
}

export function VenueMapPinPicker({
  value,
  onChange,
  showPlaceSearch = true,
  readOnly = false,
  onPlaceDetails,
}: Props) {
  const mapElRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import("leaflet").Map | null>(null);
  const markerRef = useRef<import("leaflet").Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const onPlaceDetailsRef = useRef(onPlaceDetails);
  const [mapReady, setMapReady] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [suggestions, setSuggestions] = useState<NominatimResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);
  useEffect(() => {
    onPlaceDetailsRef.current = onPlaceDetails;
  }, [onPlaceDetails]);

  const placeMarker = useCallback(
    async (lat: number, lng: number, doReverseGeocode: boolean) => {
      const map = mapRef.current;
      if (!map) return;
      const L = (await import("leaflet")).default;
      if (mapRef.current !== map) return;

      if (markerRef.current) {
        markerRef.current.setLatLng([lat, lng]);
      } else {
        const marker = L.marker([lat, lng], { draggable: !readOnly });
        if (!readOnly) {
          marker.on("dragend", () => {
            const pos = marker.getLatLng();
            onChangeRef.current({ lat: pos.lat, lng: pos.lng });
            void reverseGeocodeNominatim(pos.lat, pos.lng).then((details) => {
              if (details) onPlaceDetailsRef.current?.(details);
            });
          });
        }
        marker.addTo(map);
        markerRef.current = marker;
      }

      map.setView([lat, lng], 16);
      onChangeRef.current({ lat, lng });
      if (doReverseGeocode) {
        void reverseGeocodeNominatim(lat, lng).then((details) => {
          if (details) onPlaceDetailsRef.current?.(details);
        });
      }
    },
    [readOnly],
  );

  // Initialize map once
  useEffect(() => {
    const mapEl = mapElRef.current;
    if (!mapEl || mapRef.current) return;

    let cancelled = false;

    void (async () => {
      const L = (await import("leaflet")).default;
      // Fix broken default marker icons in webpack/Next.js bundles
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });

      if (cancelled || !mapEl) return;

      const center = value ?? DEFAULT_CENTER;
      const map = L.map(mapEl, {
        center: [center.lat, center.lng],
        zoom: value ? 16 : 11,
        zoomControl: !readOnly,
        dragging: !readOnly,
        scrollWheelZoom: !readOnly,
        doubleClickZoom: !readOnly,
        boxZoom: !readOnly,
        keyboard: !readOnly,
        touchZoom: !readOnly,
      });

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        maxZoom: 19,
      }).addTo(map);

      mapRef.current = map;

      if (value) {
        const marker = L.marker([value.lat, value.lng], { draggable: !readOnly });
        if (!readOnly) {
          marker.on("dragend", () => {
            const pos = marker.getLatLng();
            onChangeRef.current({ lat: pos.lat, lng: pos.lng });
            void reverseGeocodeNominatim(pos.lat, pos.lng).then((details) => {
              if (details) onPlaceDetailsRef.current?.(details);
            });
          });
        }
        marker.addTo(map);
        markerRef.current = marker;
      }

      if (!readOnly) {
        map.on("click", (e: import("leaflet").LeafletMouseEvent) => {
          const { lat, lng } = e.latlng;
          void placeMarker(lat, lng, true);
        });
      }

      if (!cancelled) setMapReady(true);
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- init once; parent remounts via key
  }, [readOnly]);

  // Sync value changes after init
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    void (async () => {
      const L = (await import("leaflet")).default;
      if (mapRef.current !== map) return;
      if (value) {
        if (markerRef.current) {
          markerRef.current.setLatLng([value.lat, value.lng]);
        } else {
          const marker = L.marker([value.lat, value.lng], { draggable: !readOnly });
          if (!readOnly) {
            marker.on("dragend", () => {
              const pos = marker.getLatLng();
              onChangeRef.current({ lat: pos.lat, lng: pos.lng });
              void reverseGeocodeNominatim(pos.lat, pos.lng).then((details) => {
                if (details) onPlaceDetailsRef.current?.(details);
              });
            });
          }
          marker.addTo(map);
          markerRef.current = marker;
        }
        map.panTo([value.lat, value.lng]);
      } else {
        if (markerRef.current) {
          markerRef.current.remove();
          markerRef.current = null;
        }
      }
    })();
  }, [value, mapReady, readOnly]);

  const handleSearchChange = useCallback((q: string) => {
    setSearchQuery(q);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    if (!q.trim() || q.length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    searchTimerRef.current = setTimeout(() => {
      setSearchLoading(true);
      void fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=5&countrycodes=ph`,
        { headers: { "Accept-Language": "en" } },
      )
        .then((r) => (r.ok ? r.json() : []))
        .then((data: NominatimResult[]) => {
          setSuggestions(data);
          setShowSuggestions(data.length > 0);
        })
        .catch(() => {
          /* ignore */
        })
        .finally(() => setSearchLoading(false));
    }, 400);
  }, []);

  const handleSelectSuggestion = useCallback(
    (result: NominatimResult) => {
      const lat = parseFloat(result.lat);
      const lng = parseFloat(result.lon);
      setSearchQuery(result.display_name);
      setSuggestions([]);
      setShowSuggestions(false);
      void placeMarker(lat, lng, false);
      onPlaceDetailsRef.current?.({
        city: extractCity(result.address),
        address: result.display_name,
      });
    },
    [placeMarker],
  );

  return (
    <div className="venue-map-pin-picker space-y-2">
      {showPlaceSearch && !readOnly ? (
        <>
          <div className="relative z-10 flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="relative min-w-0 flex-1">
              <Label htmlFor="venue-place-search">Find on map</Label>
              <Input
                id="venue-place-search"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="Search for the venue or address"
                className="mt-1.5"
                autoComplete="off"
              />
              {showSuggestions && (
                <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-background shadow-lg">
                  {searchLoading ? (
                    <div className="px-3 py-2 text-xs text-muted-foreground">Searching…</div>
                  ) : (
                    suggestions.map((s) => (
                      <button
                        key={s.place_id}
                        type="button"
                        className="block w-full px-3 py-2 text-left text-xs hover:bg-muted"
                        onMouseDown={() => handleSelectSuggestion(s)}
                      >
                        {s.display_name}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="default"
              className="shrink-0"
              disabled={!value}
              onClick={() => {
                onChange(null);
                setSearchQuery("");
                setSuggestions([]);
                setShowSuggestions(false);
              }}
            >
              Clear pin
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Search for a place, or <strong>click the map</strong> to drop the pin; drag the pin to
            fine-tune. This sets the map players see when booking.
          </p>
        </>
      ) : !readOnly ? (
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
            onClick={() => onChange(null)}
          >
            Clear pin
          </Button>
        </div>
      ) : null}
      <div
        ref={mapElRef}
        className="relative z-0 h-52 w-full overflow-hidden rounded-xl border border-border bg-muted/20"
        style={{ cursor: readOnly ? "default" : "crosshair" }}
        role="presentation"
        title={readOnly ? undefined : "Click to place or move pin"}
      />
    </div>
  );
}

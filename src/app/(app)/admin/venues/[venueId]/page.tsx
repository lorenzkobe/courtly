"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { ArrowLeft, CalendarIcon, Loader2, Plus, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import PageHeader from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { VenueMapPinPicker } from "@/components/admin/VenueMapPinPicker";
import { VenueTimeInput } from "@/components/admin/VenueTimeInput";
import { apiErrorMessage } from "@/lib/api/api-error-message";
import { httpStatusOf } from "@/lib/api/http-status";
import { courtlyApi } from "@/lib/api/courtly-client";
import {
  formatBookableHourSlotRange,
  formatHourToken,
  formatTimeShort,
  hourFromTime,
  isBookableHourStartInPast,
  occupiedHourStarts,
  occupiedHourStartsFromClosures,
} from "@/lib/booking-range";
import { formatPhpCompact } from "@/lib/format-currency";
import type { Court, CourtClosure, VenueClosure, Venue } from "@/lib/types/courtly";
import { formatAmenityLabel } from "@/lib/format-amenity";
import {
  ALL_DAYS_OF_WEEK,
  bookableHourTokensFromRanges,
  dayOfWeekInitialLabel,
  formatDaysOfWeekLabel,
  formRowFromRateWindow,
  makeEmptyPriceRangeFormRow,
  type PriceRangeFormRow,
  validatePriceRangeFormRows,
} from "@/lib/venue-price-ranges";
import { validateSocialUrl } from "@/lib/social-url";
import { validateVenuePaymentSettings } from "@/lib/venue-payment-methods";
import { optimizeVenuePhoto } from "@/lib/venues/optimize-venue-photo";
import { VENUE_PHOTO_MAX_COUNT, VENUE_PHOTO_MIN_COUNT } from "@/lib/venues/venue-photo-constraints";
import { cn, formatStatusLabel } from "@/lib/utils";
import { queryKeys } from "@/lib/query/query-keys";

const defaultForm = {
  name: "",
};

const defaultClosureForm = {
  date: format(addDays(new Date(), 1), "yyyy-MM-dd"),
  reason: "owner_use",
  note: "",
};

const CLOSURE_REASON_LABELS: Record<string, string> = {
  owner_use: "Owner use",
  maintenance: "Maintenance",
  special_event: "Special event",
  other: "Other",
};

function formatClosureReason(reason: string): string {
  return CLOSURE_REASON_LABELS[reason] ?? reason;
}

const defaultVenueForm = {
  name: "",
  location: "",
  contact_phone: "",
  facebook_url: "",
  instagram_url: "",
  sport: "pickleball" as Venue["sport"],
  status: "active" as Venue["status"],
  amenities: [] as string[],
  customAmenityDraft: "",
  photo_urls: [] as string[],
  hourly_rate_windows: [] as PriceRangeFormRow[],
  map_latitude: null as number | null,
  map_longitude: null as number | null,
  city: "",
  accepts_gcash: false,
  gcash_account_name: "",
  gcash_account_number: "",
  accepts_maya: false,
  maya_account_name: "",
  maya_account_number: "",
};

const amenityOptions = [
  "lights",
  "restrooms",
  "parking",
  "locker_room",
  "pro_shop",
  "water_fountain",
  "seating",
];

function normAmenity(s: string) {
  return s.trim().toLowerCase();
}

export default function AdminVenueCourtsPage() {
  const params = useParams<{ venueId: string }>();
  const venueId = params.venueId;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Court | null>(null);
  const [form, setForm] = useState(defaultForm);
  const [venueOpen, setVenueOpen] = useState(false);
  const [venueForm, setVenueForm] = useState(defaultVenueForm);
  const [stagedPhotoUrls, setStagedPhotoUrls] = useState<string[]>([]);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [closureOpen, setClosureOpen] = useState(false);
  const [closureForm, setClosureForm] = useState(defaultClosureForm);
  const [closureTokensByCourtId, setClosureTokensByCourtId] = useState<
    Record<string, string[]>
  >({});
  const [closureDateOpen, setClosureDateOpen] = useState(false);
  const [confirmDeleteCourtId, setConfirmDeleteCourtId] = useState<string | null>(null);
  const [confirmDeleteVenueOpen, setConfirmDeleteVenueOpen] = useState(false);

  const {
    data: workspace,
    isLoading,
    isError: isWorkspaceError,
    error: workspaceError,
  } = useQuery({
    queryKey: queryKeys.admin.venueWorkspace(venueId),
    queryFn: async () => {
      const { data } = await courtlyApi.adminVenues.workspace(venueId);
      return data;
    },
    enabled: !!venueId,
  });

  const venueCourts = useMemo(() => workspace?.courts ?? [], [workspace?.courts]);
  const venue = workspace?.venue;
  const missingVenue =
    !isLoading &&
    !workspace &&
    (!isWorkspaceError || httpStatusOf(workspaceError) === 404);
  useEffect(() => {
    if (!missingVenue) return;
    router.replace("/admin/venues");
  }, [missingVenue, router]);
  const venueName = venue?.name ?? venueCourts[0]?.establishment_name ?? "Venue";
  const showVenueWorkspaceSkeleton = isLoading && !venue;

  const venuePriceRangesValidation = useMemo(
    () => validatePriceRangeFormRows(venueForm.hourly_rate_windows),
    [venueForm.hourly_rate_windows],
  );
  const facebookUrlError = useMemo(
    () => validateSocialUrl(venueForm.facebook_url, "facebook"),
    [venueForm.facebook_url],
  );
  const instagramUrlError = useMemo(
    () => validateSocialUrl(venueForm.instagram_url, "instagram"),
    [venueForm.instagram_url],
  );
  const paymentSettingsValidation = useMemo(
    () =>
      validateVenuePaymentSettings(venueForm, {
        requireAtLeastOne: venueForm.status === "active",
      }),
    [venueForm],
  );

  const upsert = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        venue_id: venueId,
      };
      if (editing) {
        await courtlyApi.courts.update(editing.id, payload);
      } else {
        await courtlyApi.courts.create(payload);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.venueWorkspace(venueId) });
      void queryClient.invalidateQueries({ queryKey: ["courts"] });
      toast.success(editing ? "Court updated" : "Court created");
      setOpen(false);
      setEditing(null);
      setForm(defaultForm);
    },
    onError: (e: unknown) => {
      toast.error(apiErrorMessage(e, "Could not save the court."));
    },
  });

  const saveVenue = useMutation({
    mutationFn: async () => {
      const parsed = validatePriceRangeFormRows(venueForm.hourly_rate_windows);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      const hasMapPin =
        venueForm.map_latitude != null &&
        venueForm.map_longitude != null &&
        Number.isFinite(venueForm.map_latitude) &&
        Number.isFinite(venueForm.map_longitude);
      const mapBody = hasMapPin
        ? {
            map_latitude: venueForm.map_latitude!,
            map_longitude: venueForm.map_longitude!,
          }
        : { map_latitude: null, map_longitude: null };

      await courtlyApi.venues.update(venueId, {
        name: venueForm.name.trim(),
        location: venueForm.location.trim(),
        city: venueForm.city.trim(),
        contact_phone: venueForm.contact_phone.trim(),
        facebook_url: venueForm.facebook_url.trim(),
        instagram_url: venueForm.instagram_url.trim(),
        sport: "pickleball",
        status: venueForm.status,
        amenities: [
          ...new Set(
            venueForm.amenities.map((amenity) => amenity.trim()).filter(Boolean),
          ),
        ],
        photo_urls: venueForm.photo_urls,
        hourly_rate_windows: parsed.windows,
        accepts_gcash: venueForm.accepts_gcash,
        gcash_account_name: venueForm.gcash_account_name.trim(),
        gcash_account_number: venueForm.gcash_account_number.trim(),
        accepts_maya: venueForm.accepts_maya,
        maya_account_name: venueForm.maya_account_name.trim(),
        maya_account_number: venueForm.maya_account_number.trim(),
        ...mapBody,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.venueWorkspace(venueId) });
      void queryClient.invalidateQueries({ queryKey: ["courts"] });
      toast.success("Venue updated");
      setStagedPhotoUrls([]);
      setVenueOpen(false);
    },
    onError: (e: unknown) => {
      toast.error(apiErrorMessage(e, "Could not save venue"));
    },
  });

  const deleteCourt = useMutation({
    mutationFn: async (id: string) => {
      await courtlyApi.courts.remove(id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.venueWorkspace(venueId) });
      void queryClient.invalidateQueries({ queryKey: ["courts"] });
      toast.success("Court deleted");
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, "Could not delete court"));
    },
  });

  const deleteVenue = useMutation({
    mutationFn: async () => {
      await courtlyApi.venues.remove(venueId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-venues"] });
      toast.success("Venue deleted");
      router.replace("/admin/venues");
    },
    onError: (error: unknown) => {
      toast.error(apiErrorMessage(error, "Could not delete venue"));
    },
  });

  const venueCourtIdsKey = useMemo(
    () =>
      venueCourts
        .map((c) => c.id)
        .sort()
        .join(","),
    [venueCourts],
  );
  const upcomingUnavailabilityQuery = useQuery({
    queryKey: ["venue-unavailability", venueId, venueCourtIdsKey],
    enabled: Boolean(venueId) && venueCourts.length > 0,
    queryFn: async () => {
      const [venueClosures, ...perCourt] = await Promise.all([
        courtlyApi.venueClosures.list(venueId).then((r) => r.data),
        ...venueCourts.map((court) =>
          courtlyApi.courtClosures
            .list(court.id)
            .then((r) => ({ court, rows: r.data })),
        ),
      ]);
      return { venueClosures, perCourt };
    },
  });
  type UnavailabilityRow = {
    key: string;
    scope: "venue" | "court";
    date: string;
    start_time: string;
    end_time: string;
    reason: string;
    note?: string | null;
    venueClosureId?: string;
    courtEntries: Array<{ courtId: string; closureId: string; courtName: string }>;
  };
  const upcomingUnavailabilityRows = useMemo<UnavailabilityRow[]>(() => {
    const data = upcomingUnavailabilityQuery.data;
    if (!data) return [];
    const today = format(new Date(), "yyyy-MM-dd");
    const rows: UnavailabilityRow[] = [];
    for (const closure of data.venueClosures) {
      if (closure.date < today) continue;
      rows.push({
        key: `v-${closure.id}`,
        scope: "venue",
        date: closure.date,
        start_time: closure.start_time,
        end_time: closure.end_time,
        reason: closure.reason,
        note: closure.note ?? null,
        venueClosureId: closure.id,
        courtEntries: [],
      });
    }
    const grouped = new Map<string, UnavailabilityRow>();
    for (const { court, rows: closures } of data.perCourt) {
      for (const closure of closures) {
        if (closure.date < today) continue;
        const groupKey = `c-${closure.date}-${closure.start_time}-${closure.end_time}-${closure.reason}-${closure.note ?? ""}`;
        const existing = grouped.get(groupKey);
        if (existing) {
          existing.courtEntries.push({
            courtId: court.id,
            closureId: closure.id,
            courtName: court.name,
          });
        } else {
          const row: UnavailabilityRow = {
            key: groupKey,
            scope: "court",
            date: closure.date,
            start_time: closure.start_time,
            end_time: closure.end_time,
            reason: closure.reason,
            note: closure.note ?? null,
            courtEntries: [
              { courtId: court.id, closureId: closure.id, courtName: court.name },
            ],
          };
          grouped.set(groupKey, row);
          rows.push(row);
        }
      }
    }
    rows.sort((a, b) => {
      const d = a.date.localeCompare(b.date);
      if (d !== 0) return d;
      return a.start_time.localeCompare(b.start_time);
    });
    for (const row of rows) {
      row.courtEntries.sort((a, b) => a.courtName.localeCompare(b.courtName));
    }
    return rows;
  }, [upcomingUnavailabilityQuery.data]);

  const existingClosureDates = useMemo(() => {
    const set = new Set<string>();
    for (const row of upcomingUnavailabilityRows) set.add(row.date);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [upcomingUnavailabilityRows]);

  const removeUnavailability = useMutation({
    mutationFn: async (row: UnavailabilityRow) => {
      if (row.scope === "venue" && row.venueClosureId) {
        await courtlyApi.venueClosures.remove(venueId, row.venueClosureId);
        return;
      }
      await Promise.all(
        row.courtEntries.map((entry) =>
          courtlyApi.courtClosures.remove(entry.courtId, entry.closureId),
        ),
      );
    },
    onSuccess: () => {
      toast.success("Unavailability removed");
      void queryClient.invalidateQueries({
        queryKey: ["venue-unavailability", venueId],
      });
      void queryClient.invalidateQueries({ queryKey: ["court-closures"] });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.admin.venueWorkspace(venueId),
      });
      venueCourts.forEach((court) => {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.bookingSurface.courtDay(court.id, closureForm.date),
        });
      });
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, "Could not remove unavailability"));
    },
  });

  const closureLeaderCourtId = venueCourts[0]?.id ?? "";
  const closureSurfaceQuery = useQuery({
    queryKey: queryKeys.bookingSurface.courtDay(closureLeaderCourtId, closureForm.date),
    queryFn: async () => {
      const { data } = await courtlyApi.courts.bookingSurface(closureLeaderCourtId, {
        date: closureForm.date,
      });
      return data;
    },
    enabled: closureOpen && Boolean(closureForm.date) && Boolean(closureLeaderCourtId),
    staleTime: 20_000,
  });
  const closureSurface = closureSurfaceQuery.data;
  const closureTokenSummaryByCourtId = useMemo(() => {
    const out = new Map<
      string,
      {
        booked: Set<string>;
        venueClosed: Set<string>;
        existingCourtClosed: Set<string>;
        existingCourtClosureIds: string[];
        existingClosureByHour: Map<string, { reason: string; note?: string | null }>;
      }
    >();
    const venueClosed = closureSurface
      ? occupiedHourStartsFromClosures(closureSurface.venue_closures ?? [], closureForm.date)
      : new Set<string>();
    venueCourts.forEach((court) => {
      const slot = closureSurface?.availability_by_court_id?.[court.id];
      const booked = slot ? occupiedHourStarts(slot.bookings ?? []) : new Set<string>();
      const existingCourtClosed = slot
        ? occupiedHourStartsFromClosures(slot.court_closures ?? [], closureForm.date)
        : new Set<string>();
      const existingCourtClosureIds = (slot?.court_closures ?? []).map((closure) => closure.id);
      const existingClosureByHour = new Map<
        string,
        { reason: string; note?: string | null }
      >();
      for (const closure of slot?.court_closures ?? []) {
        if (closure.date !== closureForm.date) continue;
        const sh = hourFromTime(closure.start_time);
        const eh = hourFromTime(closure.end_time);
        for (let h = sh; h < eh; h++) {
          existingClosureByHour.set(formatHourToken(h), {
            reason: closure.reason,
            note: closure.note,
          });
        }
      }
      out.set(court.id, {
        booked,
        venueClosed,
        existingCourtClosed,
        existingCourtClosureIds,
        existingClosureByHour,
      });
    });
    return out;
  }, [closureForm.date, closureSurface, venueCourts]);
  const saveClosureDraft = useMutation({
    mutationFn: async () => {
      const date = closureForm.date.trim();
      const reason = closureForm.reason.trim();
      const note = closureForm.note.trim();

      if (!date || !reason) {
        throw new Error("Date and reason are required.");
      }
      const touchedCourtIds = venueCourts.filter((court) =>
        Array.isArray(closureTokensByCourtId[court.id]),
      );
      if (touchedCourtIds.length === 0) {
        throw new Error("No courts available for update.");
      }
      const updatedClosuresByCourtId = new Map<string, CourtClosure[]>();
      const removedClosureIdsByCourtId = new Map<string, Set<string>>();
      for (const court of touchedCourtIds) {
        updatedClosuresByCourtId.set(court.id, []);
        const summary = closureTokenSummaryByCourtId.get(court.id);
        const selected = new Set(
          closureTokensByCourtId[court.id] ??
            [...(summary?.existingCourtClosed ?? new Set<string>())],
        );
        const locked = new Set<string>([
          ...(summary?.booked ?? new Set<string>()),
          ...(summary?.venueClosed ?? new Set<string>()),
        ]);
        const desired = [...selected]
          .filter(
            (token) =>
              !locked.has(token) &&
              !isBookableHourStartInPast(token, new Date(`${date}T12:00:00`)),
          )
          .sort((a, b) => a.localeCompare(b));
        const removedIds = new Set<string>(
          summary?.existingCourtClosureIds ?? [],
        );
        removedClosureIdsByCourtId.set(court.id, removedIds);
        for (const closureId of summary?.existingCourtClosureIds ?? []) {
          await courtlyApi.courtClosures.remove(court.id, closureId);
        }
        if (desired.length === 0) continue;
        const existingByHour = summary?.existingClosureByHour ?? new Map();
        const bucketsByKey = new Map<
          string,
          { reason: string; note: string | null; hours: string[] }
        >();
        for (const token of desired) {
          const prior = existingByHour.get(token);
          const hourReason = prior ? prior.reason : reason;
          const hourNote = prior ? (prior.note ?? null) : note ? note : null;
          const bucketKey = `${hourReason} ${hourNote ?? ""}`;
          const bucket = bucketsByKey.get(bucketKey);
          if (bucket) {
            bucket.hours.push(token);
          } else {
            bucketsByKey.set(bucketKey, {
              reason: hourReason,
              note: hourNote,
              hours: [token],
            });
          }
        }
        for (const bucket of bucketsByKey.values()) {
          const sortedHours = [...bucket.hours].sort((a, b) =>
            a.localeCompare(b),
          );
          const contiguousRanges: Array<{
            start_time: string;
            end_time: string;
          }> = [];
          let rangeStart = sortedHours[0]!;
          let previous = sortedHours[0]!;
          for (let i = 1; i <= sortedHours.length; i++) {
            const current = sortedHours[i];
            const prevHour = Number.parseInt(
              previous.split(":")[0] ?? "0",
              10,
            );
            const expectedNext = `${String(prevHour + 1).padStart(2, "0")}:00`;
            if (!current || current !== expectedNext) {
              contiguousRanges.push({
                start_time: rangeStart,
                end_time: `${String(prevHour + 1).padStart(2, "0")}:00`,
              });
              rangeStart = current ?? rangeStart;
            }
            previous = current ?? previous;
          }
          for (const range of contiguousRanges) {
            const { data: createdClosure } = await courtlyApi.courtClosures.create(
              court.id,
              {
                date,
                reason: bucket.reason,
                note: bucket.note || undefined,
                start_time: range.start_time,
                end_time: range.end_time,
              },
            );
            updatedClosuresByCourtId.get(court.id)!.push(createdClosure);
          }
        }
      }
      return { updatedClosuresByCourtId, removedClosureIdsByCourtId };
    },
    onSuccess: ({ updatedClosuresByCourtId, removedClosureIdsByCourtId }) => {
      toast.success("Court unavailability updated");
      const submittedDate = closureForm.date;
      setClosureOpen(false);
      setClosureTokensByCourtId({});
      setClosureForm(defaultClosureForm);
      queryClient.setQueryData<{
        venueClosures: VenueClosure[];
        perCourt: Array<{ court: Court; rows: CourtClosure[] }>;
      }>(["venue-unavailability", venueId, venueCourtIdsKey], (prev) => {
        if (!prev) return prev;
        return {
          venueClosures: prev.venueClosures,
          perCourt: prev.perCourt.map((entry) => {
            const created = updatedClosuresByCourtId.get(entry.court.id);
            if (!created) return entry;
            const removed = removedClosureIdsByCourtId.get(entry.court.id);
            const retained = removed
              ? entry.rows.filter((row) => !removed.has(row.id))
              : entry.rows;
            return { court: entry.court, rows: [...retained, ...created] };
          }),
        };
      });
      void queryClient.invalidateQueries({ queryKey: ["court-closures"] });
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.venueWorkspace(venueId) });
      venueCourts.forEach((court) => {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.bookingSurface.courtDay(court.id, submittedDate),
        });
      });
    },
    onError: (error) => {
      toast.error(apiErrorMessage(error, "Could not update court unavailability"));
    },
  });

  const openEdit = (court: Court) => {
    setEditing(court);
    setForm({
      name: court.name || "",
    });
    setOpen(true);
  };

  const openCreate = () => {
    setEditing(null);
    setForm(defaultForm);
    setOpen(true);
  };

  const openVenueEdit = () => {
    if (!venue) return;
    setVenueForm({
      name: venue.name,
      location: venue.location,
      contact_phone: venue.contact_phone ?? "",
      facebook_url: venue.facebook_url ?? "",
      instagram_url: venue.instagram_url ?? "",
      sport: "pickleball",
      status: venue.status,
      amenities: [...venue.amenities],
      customAmenityDraft: "",
      photo_urls: venue.photo_urls ?? [],
      map_latitude:
        venue.map_latitude != null && Number.isFinite(venue.map_latitude)
          ? venue.map_latitude
          : null,
      map_longitude:
        venue.map_longitude != null && Number.isFinite(venue.map_longitude)
          ? venue.map_longitude
          : null,
      city: (venue as { city?: string }).city ?? "",
      hourly_rate_windows: (venue.hourly_rate_windows ?? []).map((rateWindow) =>
        formRowFromRateWindow(rateWindow),
      ),
      accepts_gcash: venue.accepts_gcash ?? false,
      gcash_account_name: venue.gcash_account_name ?? "",
      gcash_account_number: venue.gcash_account_number ?? "",
      accepts_maya: venue.accepts_maya ?? false,
      maya_account_name: venue.maya_account_name ?? "",
      maya_account_number: venue.maya_account_number ?? "",
    });
    setVenueOpen(true);
  };

  const closureSelectedDate = useMemo(
    () => new Date(`${closureForm.date}T12:00:00`),
    [closureForm.date],
  );
  const closureTimeSlots = useMemo(
    () =>
      bookableHourTokensFromRanges(
        venue?.hourly_rate_windows ?? [],
        closureSelectedDate.getDay(),
      ),
    [venue?.hourly_rate_windows, closureSelectedDate],
  );
  const closureGridLoading = closureSurfaceQuery.isLoading;

  const toggleAmenity = (amenity: string) => {
    setVenueForm((prev) => ({
      ...prev,
      amenities: prev.amenities.includes(amenity)
        ? prev.amenities.filter((item) => item !== amenity)
        : [...prev.amenities, amenity],
    }));
  };

  const addCustomAmenity = () => {
    const next = venueForm.customAmenityDraft.trim();
    if (!next) return;
    const exists = venueForm.amenities.some(
      (item) => normAmenity(item) === normAmenity(next),
    );
    if (!exists) {
      setVenueForm((prev) => ({
        ...prev,
        amenities: [...prev.amenities, next],
        customAmenityDraft: "",
      }));
      return;
    }
    setVenueForm((prev) => ({ ...prev, customAmenityDraft: "" }));
  };

  async function handlePhotoSelect(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setIsUploadingPhoto(true);
    setPhotoError(null);
    try {
      const optimized = await optimizeVenuePhoto(file);
      const { data } = await courtlyApi.venuePhotos.upload(optimized.dataUrl);
      setStagedPhotoUrls((prev) => [...prev, data.public_url]);
      setVenueForm((prev) => ({ ...prev, photo_urls: [...prev.photo_urls, data.public_url] }));
    } catch (err) {
      setPhotoError(apiErrorMessage(err, "Could not upload photo"));
    } finally {
      setIsUploadingPhoto(false);
    }
  }

  function removePhoto(url: string) {
    setVenueForm((prev) => ({ ...prev, photo_urls: prev.photo_urls.filter((u) => u !== url) }));
    if (stagedPhotoUrls.includes(url)) {
      setStagedPhotoUrls((prev) => prev.filter((u) => u !== url));
      void courtlyApi.venuePhotos.delete([url]);
    }
  }

  function cleanupStagedPhotos(currentPhotoUrls: string[]) {
    const orphaned = stagedPhotoUrls.filter((u) => !currentPhotoUrls.includes(u));
    if (orphaned.length > 0) void courtlyApi.venuePhotos.delete(orphaned);
    setStagedPhotoUrls([]);
  }

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 md:px-10">
      <ConfirmDialog
        open={!!confirmDeleteCourtId}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteCourtId(null);
        }}
        title="Delete court?"
        description="This court will be removed from the venue."
        confirmLabel="Delete court"
        isPending={deleteCourt.isPending}
        onConfirm={() => {
          if (!confirmDeleteCourtId) return;
          deleteCourt.mutate(confirmDeleteCourtId);
          setConfirmDeleteCourtId(null);
        }}
      />
      <ConfirmDialog
        open={confirmDeleteVenueOpen}
        onOpenChange={(open) => setConfirmDeleteVenueOpen(open)}
        title="Delete venue?"
        description="This hides the venue from all listings and unassigns all admins. Booking history is preserved. Not allowed while there are pending, confirmed, or in-progress refund bookings."
        confirmLabel="Delete venue"
        countdownSeconds={5}
        isPending={deleteVenue.isPending}
        onConfirm={() => {
          deleteVenue.mutate();
          setConfirmDeleteVenueOpen(false);
        }}
      />
      <Button variant="ghost" className="mb-4 -ml-2" asChild>
        <Link href="/admin/venues">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to venues
        </Link>
      </Button>

      {showVenueWorkspaceSkeleton ? (
        <div className="space-y-6" aria-busy="true" aria-label="Loading venue">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-9 w-[min(18rem,85vw)] max-w-md" />
              <Skeleton className="h-4 w-56" />
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Skeleton className="h-10 w-36" />
              <Skeleton className="h-10 w-28" />
              <Skeleton className="h-10 w-32" />
            </div>
          </div>
          <Card className="border-border/50">
            <CardContent className="grid gap-4 p-5 sm:grid-cols-2">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-5 w-full max-w-sm" />
                </div>
              ))}
              <div className="space-y-2 sm:col-span-2">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-20 w-full" />
              </div>
            </CardContent>
          </Card>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-40 rounded-xl" />
            ))}
          </div>
        </div>
      ) : null}

      {!showVenueWorkspaceSkeleton ? (
        <>
      <PageHeader
        title={venueName}
        subtitle="Manage courts for this venue"
      >
        <Button
          variant="outline"
          className="border-destructive/25 text-destructive hover:bg-destructive/5"
          onClick={() => setConfirmDeleteVenueOpen(true)}
        >
          <Trash2 className="mr-1.5 h-4 w-4" />
          Delete venue
        </Button>
        <Button variant="outline" onClick={openVenueEdit}>
          Edit venue
        </Button>
        <Button className="font-heading font-semibold" onClick={openCreate}>
          <Plus className="mr-2 h-4 w-4" /> Add Court
        </Button>
      </PageHeader>

      {venue ? (
        <Card className="mb-6 border-border/50">
          <CardContent className="grid gap-3 p-5 text-sm sm:grid-cols-2">
            <div>
              <p className="text-muted-foreground">Location</p>
              <p className="font-medium text-foreground">{venue.location}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Contact</p>
              <p className="font-medium text-foreground">{venue.contact_phone || "-"}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Facebook</p>
              {venue.facebook_url ? (
                <a
                  href={venue.facebook_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-primary hover:underline"
                >
                  {venue.facebook_url}
                </a>
              ) : (
                <p className="font-medium text-foreground">-</p>
              )}
            </div>
            <div>
              <p className="text-muted-foreground">Instagram</p>
              {venue.instagram_url ? (
                <a
                  href={venue.instagram_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-primary hover:underline"
                >
                  {venue.instagram_url}
                </a>
              ) : (
                <p className="font-medium text-foreground">-</p>
              )}
            </div>
            <div>
              <p className="text-muted-foreground">Sport</p>
              <p className="font-medium text-foreground">{formatStatusLabel(venue.sport)}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Status</p>
              <p className="font-medium text-foreground">
                {venue.status === "active" ? "Active" : "Inactive"}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Amenities</p>
              {venue.amenities.length ? (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {venue.amenities.map((amenity) => (
                    <Badge key={amenity} variant="outline" className="font-normal">
                      {formatAmenityLabel(amenity)}
                    </Badge>
                  ))}
                </div>
              ) : (
                <p className="font-medium text-foreground">-</p>
              )}
            </div>
            <div className="sm:col-span-2">
              <p className="text-muted-foreground">Price ranges</p>
              {(venue.hourly_rate_windows?.length ?? 0) > 0 ? (
                <ul className="mt-1 space-y-1 text-foreground">
                  {venue.hourly_rate_windows!.map((rateWindow) => (
                    <li
                      key={`${rateWindow.start}-${rateWindow.end}-${rateWindow.hourly_rate}`}
                      className="flex flex-wrap items-baseline gap-x-2"
                    >
                      <span>
                        {formatTimeShort(rateWindow.start)} – {formatTimeShort(rateWindow.end)}:{" "}
                        {formatPhpCompact(rateWindow.hourly_rate)}/hr
                      </span>
                      <span className="text-xs text-muted-foreground">
                        · {formatDaysOfWeekLabel(rateWindow)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="font-medium text-foreground">None</p>
              )}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card className="mb-6 border-border/50">
        <CardContent className="p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h3 className="font-heading text-base font-semibold text-foreground">
              Upcoming unavailability
            </h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setClosureOpen(true)}
            >
              Set unavailability
            </Button>
          </div>
          {upcomingUnavailabilityQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : upcomingUnavailabilityRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No upcoming court or venue unavailability.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {upcomingUnavailabilityRows.map((row) => {
                const isRemoving =
                  removeUnavailability.isPending &&
                  removeUnavailability.variables?.key === row.key;
                return (
                  <li
                    key={row.key}
                    className="flex flex-col gap-2 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-sm font-medium text-foreground">
                        {format(new Date(`${row.date}T12:00:00`), "EEE, MMM d, yyyy")}
                        <span className="text-muted-foreground">
                          {" · "}
                          {formatTimeShort(row.start_time)} – {formatTimeShort(row.end_time)}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {row.scope === "venue"
                          ? "All courts (venue-wide)"
                          : row.courtEntries.map((e) => e.courtName).join(", ")}
                      </p>
                      {row.note ? (
                        <p className="text-xs italic text-muted-foreground">
                          {row.note}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2 self-start">
                      <Badge variant="outline" className="font-normal">
                        {formatClosureReason(row.reason)}
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 border-destructive/25 px-2 text-destructive hover:bg-destructive/5 hover:text-destructive"
                        disabled={removeUnavailability.isPending}
                        onClick={() => removeUnavailability.mutate(row)}
                        aria-label="Remove unavailability"
                      >
                        {isRemoving ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {!isLoading ? (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {venueCourts.map((court) => (
            <Card
              key={court.id}
              className="cursor-pointer overflow-hidden border-border/50 transition-shadow hover:shadow-md"
              onClick={() => openEdit(court)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openEdit(court);
                }
              }}
            >
              <CardContent className="p-5">
                <div className="mb-2 flex items-start justify-between">
                  <h3 className="font-heading font-bold text-foreground">
                    {court.name}
                  </h3>
                </div>
                <div className="shrink-0 text-xs text-muted-foreground">Click to edit</div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      )}

        </>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {editing ? "Edit Court" : "Add New Court"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Court name *</Label>
                <Input
                  className="mt-1.5"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
            </div>
            {editing ? (
              <Button
                className="w-full border-destructive/20 text-destructive hover:bg-destructive/5 hover:text-destructive"
                type="button"
                variant="outline"
                onClick={() => setConfirmDeleteCourtId(editing.id)}
              >
                <Trash2 className="mr-1.5 h-4 w-4" />
                Delete Court
              </Button>
            ) : null}
            <Button
              className="w-full font-heading font-semibold"
              type="button"
              onClick={() => {
                if (!form.name.trim()) {
                  toast.error("Court name is required.");
                  return;
                }
                upsert.mutate();
              }}
              disabled={upsert.isPending}
            >
              {upsert.isPending
                ? "Saving..."
                : editing
                  ? "Save Changes"
                  : "Create Court"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={venueOpen}
        onOpenChange={(open) => {
          if (!open) {
            cleanupStagedPhotos(venueForm.photo_urls);
            setPhotoError(null);
          }
          setVenueOpen(open);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">Edit venue</DialogTitle>
          </DialogHeader>
          {venueOpen && !venue ? (
            <div
              className="space-y-4 py-1"
              aria-busy="true"
              aria-label="Loading venue details"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ))}
              <Skeleton className="h-32 w-full rounded-xl" />
            </div>
          ) : (
          <div className="space-y-4">
            <div>
              <Label>Venue name *</Label>
              <Input
                className="mt-1.5"
                value={venueForm.name}
                onChange={(e) => setVenueForm({ ...venueForm, name: e.target.value })}
              />
            </div>
            <div>
              <Label>Location *</Label>
              <Input
                className="mt-1.5"
                value={venueForm.location}
                onChange={(e) => setVenueForm({ ...venueForm, location: e.target.value })}
              />
            </div>
            <div>
              <VenueMapPinPicker
                key={venueId}
                showPlaceSearch={true}
                value={
                  venueForm.map_latitude != null &&
                  venueForm.map_longitude != null &&
                  Number.isFinite(venueForm.map_latitude) &&
                  Number.isFinite(venueForm.map_longitude)
                    ? { lat: venueForm.map_latitude, lng: venueForm.map_longitude }
                    : null
                }
                onChange={(next) =>
                  setVenueForm((prev) => ({
                    ...prev,
                    map_latitude: next?.lat ?? null,
                    map_longitude: next?.lng ?? null,
                  }))
                }
                onPlaceDetails={({ city, address }) => {
                  setVenueForm((f) => ({
                    ...f,
                    city: city ?? f.city,
                    location: address ?? f.location,
                  }));
                }}
              />
            </div>
            <div>
              <Label>Contact number *</Label>
              <Input
                className="mt-1.5"
                value={venueForm.contact_phone}
                onChange={(e) => setVenueForm({ ...venueForm, contact_phone: e.target.value })}
                placeholder="+63 9XX XXX XXXX or landline"
              />
            </div>
            <div>
              <Label>Facebook page link</Label>
              <Input
                className="mt-1.5"
                value={venueForm.facebook_url}
                onChange={(e) => setVenueForm({ ...venueForm, facebook_url: e.target.value })}
                placeholder="https://facebook.com/your-page"
              />
              {facebookUrlError ? (
                <p className="mt-1 text-xs text-destructive">{facebookUrlError}</p>
              ) : null}
            </div>
            <div>
              <Label>Instagram page link</Label>
              <Input
                className="mt-1.5"
                value={venueForm.instagram_url}
                onChange={(e) => setVenueForm({ ...venueForm, instagram_url: e.target.value })}
                placeholder="https://instagram.com/your-page"
              />
              {instagramUrlError ? (
                <p className="mt-1 text-xs text-destructive">{instagramUrlError}</p>
              ) : null}
            </div>
            <div>
              <Label>Sport</Label>
              <Select value="pickleball" disabled>
                <SelectTrigger className="mt-1.5 bg-muted/50">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pickleball">Pickleball</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Availability</Label>
              <Select
                value={venueForm.status}
                onValueChange={(v) => setVenueForm({ ...venueForm, status: v as Venue["status"] })}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="closed">Inactive</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                Inactive venues stop accepting new bookings. Existing confirmed bookings are not automatically cancelled — contact players directly if their bookings will be affected.
              </p>
            </div>
            <div>
              <Label className="mb-2 block">Payment methods *</Label>
              <p className="mb-2 text-xs text-muted-foreground">
                Add at least one method for active venues. Only enabled methods are shown to players.
              </p>
              <div className="space-y-3 rounded-xl border border-border/60 bg-muted/10 p-4">
                <label
                  className={`block rounded-lg border p-3 transition-colors ${
                    venueForm.accepts_gcash
                      ? "border-primary/40 bg-primary/5"
                      : "border-border/60 bg-background"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">GCash</span>
                    <input
                      type="checkbox"
                      checked={venueForm.accepts_gcash}
                      onChange={(e) =>
                        setVenueForm((prev) => ({ ...prev, accepts_gcash: e.target.checked }))
                      }
                    />
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Wallet number and account name shown to players.
                  </span>
                  {venueForm.accepts_gcash ? (
                    <span className="mt-3 grid gap-2 sm:grid-cols-2">
                      <Input
                        value={venueForm.gcash_account_name}
                        onChange={(e) =>
                          setVenueForm((prev) => ({ ...prev, gcash_account_name: e.target.value }))
                        }
                        placeholder="Account name"
                      />
                      <Input
                        value={venueForm.gcash_account_number}
                        onChange={(e) =>
                          setVenueForm((prev) => ({
                            ...prev,
                            gcash_account_number: e.target.value,
                          }))
                        }
                        placeholder="Account number"
                      />
                    </span>
                  ) : null}
                </label>
                <label
                  className={`block rounded-lg border p-3 transition-colors ${
                    venueForm.accepts_maya
                      ? "border-primary/40 bg-primary/5"
                      : "border-border/60 bg-background"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">Maya</span>
                    <input
                      type="checkbox"
                      checked={venueForm.accepts_maya}
                      onChange={(e) =>
                        setVenueForm((prev) => ({ ...prev, accepts_maya: e.target.checked }))
                      }
                    />
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Wallet number and account name shown to players.
                  </span>
                  {venueForm.accepts_maya ? (
                    <span className="mt-3 grid gap-2 sm:grid-cols-2">
                      <Input
                        value={venueForm.maya_account_name}
                        onChange={(e) =>
                          setVenueForm((prev) => ({ ...prev, maya_account_name: e.target.value }))
                        }
                        placeholder="Account name"
                      />
                      <Input
                        value={venueForm.maya_account_number}
                        onChange={(e) =>
                          setVenueForm((prev) => ({
                            ...prev,
                            maya_account_number: e.target.value,
                          }))
                        }
                        placeholder="Account number"
                      />
                    </span>
                  ) : null}
                </label>
              </div>
            </div>
            <div>
              <Label className="mb-2 block">Amenities</Label>
              <div className="mb-3 flex flex-wrap gap-2">
                {amenityOptions.map((amenity) => (
                  <button
                    key={amenity}
                    type="button"
                    onClick={() => toggleAmenity(amenity)}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
                      venueForm.amenities.includes(amenity)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    {formatAmenityLabel(amenity)}
                  </button>
                ))}
              </div>
              {venueForm.amenities.filter((item) => !amenityOptions.includes(item)).length >
              0 ? (
                <div className="mb-3 flex flex-wrap gap-2">
                  {venueForm.amenities
                    .filter((item) => !amenityOptions.includes(item))
                    .map((customAmenity) => (
                      <Badge
                        key={customAmenity}
                        variant="outline"
                        className="cursor-pointer"
                        onClick={() =>
                          setVenueForm((prev) => ({
                            ...prev,
                            amenities: prev.amenities.filter(
                              (amenity) => amenity !== customAmenity,
                            ),
                          }))
                        }
                      >
                        {formatAmenityLabel(customAmenity)} x
                      </Badge>
                    ))}
                </div>
              ) : null}
              <div className="flex gap-2">
                <Input
                  value={venueForm.customAmenityDraft}
                  onChange={(e) =>
                    setVenueForm({ ...venueForm, customAmenityDraft: e.target.value })
                  }
                  placeholder="Add custom amenity"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCustomAmenity();
                    }
                  }}
                />
                <Button type="button" variant="secondary" onClick={addCustomAmenity}>
                  Add
                </Button>
              </div>
            </div>
            <div className="space-y-3 rounded-xl border border-border/60 bg-muted/10 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <Label>Price ranges *</Label>
                  <p className="mt-1 max-w-prose text-xs text-muted-foreground">
                    Non-overlapping hours (e.g. 7am–5pm at one rate, 5pm–10pm at another).
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 self-start"
                  onClick={() =>
                    setVenueForm((prev) => ({
                      ...prev,
                      hourly_rate_windows: [
                        ...prev.hourly_rate_windows,
                        makeEmptyPriceRangeFormRow(),
                      ],
                    }))
                  }
                >
                  Add range
                </Button>
              </div>
              {venueForm.hourly_rate_windows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Add at least one start–end range and price per hour.
                </p>
              ) : (
                <div className="space-y-4">
                  {venueForm.hourly_rate_windows.map((row, i) => (
                    <div
                      key={i}
                      className="relative rounded-xl border border-border/50 bg-background p-4 pr-12 shadow-sm"
                    >
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Remove range"
                        className="absolute right-2 top-2 h-8 w-8 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        onClick={() =>
                          setVenueForm((prev) => ({
                            ...prev,
                            hourly_rate_windows: prev.hourly_rate_windows.filter(
                              (_, idx) => idx !== i,
                            ),
                          }))
                        }
                      >
                        <X className="h-4 w-4" />
                      </Button>
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <div className="min-w-0 space-y-1.5">
                            <Label
                              className="text-xs text-muted-foreground"
                              htmlFor={`admin-range-start-${i}`}
                            >
                              Start
                            </Label>
                            <VenueTimeInput
                              id={`admin-range-start-${i}`}
                              value={row.start}
                              onChange={(value) =>
                                setVenueForm((prev) => {
                                  const next = [...prev.hourly_rate_windows];
                                  next[i] = { ...next[i]!, start: value };
                                  return { ...prev, hourly_rate_windows: next };
                                })
                              }
                            />
                          </div>
                          <div className="min-w-0 space-y-1.5">
                            <Label
                              className="text-xs text-muted-foreground"
                              htmlFor={`admin-range-end-${i}`}
                            >
                              End
                            </Label>
                            <VenueTimeInput
                              id={`admin-range-end-${i}`}
                              value={row.end}
                              onChange={(value) =>
                                setVenueForm((prev) => {
                                  const next = [...prev.hourly_rate_windows];
                                  next[i] = { ...next[i]!, end: value };
                                  return { ...prev, hourly_rate_windows: next };
                                })
                              }
                            />
                          </div>
                        </div>
                        <div className="min-w-0 space-y-1.5">
                          <Label
                            className="text-xs text-muted-foreground"
                            htmlFor={`admin-range-rate-${i}`}
                          >
                            Rate (PHP / hr)
                          </Label>
                          <Input
                            id={`admin-range-rate-${i}`}
                            type="number"
                            inputMode="decimal"
                            className="h-11 w-full"
                            value={row.rate}
                            onChange={(e) =>
                              setVenueForm((prev) => {
                                const next = [...prev.hourly_rate_windows];
                                next[i] = { ...next[i]!, rate: e.target.value };
                                return { ...prev, hourly_rate_windows: next };
                              })
                            }
                            placeholder="e.g. 450"
                          />
                        </div>
                        <div className="space-y-1.5 border-t border-border/50 pt-3">
                          <Label className="text-xs text-muted-foreground">
                            Active days
                          </Label>
                          <div className="flex items-center gap-1">
                            {ALL_DAYS_OF_WEEK.map((day) => {
                              const selected = row.days_of_week.includes(day);
                              return (
                                <button
                                  key={day}
                                  type="button"
                                  aria-pressed={selected}
                                  aria-label={`Toggle ${formatDaysOfWeekLabel({ days_of_week: [day] })}`}
                                  onClick={() =>
                                    setVenueForm((prev) => {
                                      const next = [...prev.hourly_rate_windows];
                                      const current = new Set(next[i]!.days_of_week);
                                      if (current.has(day)) current.delete(day);
                                      else current.add(day);
                                      next[i] = {
                                        ...next[i]!,
                                        days_of_week: [...current].sort((a, b) => a - b),
                                      };
                                      return { ...prev, hourly_rate_windows: next };
                                    })
                                  }
                                  className={cn(
                                    "inline-flex h-9 min-w-0 flex-1 items-center justify-center rounded-md border text-xs font-medium transition",
                                    selected
                                      ? "border-primary bg-primary text-primary-foreground"
                                      : "border-border bg-background text-muted-foreground hover:border-primary/50 hover:text-foreground",
                                  )}
                                >
                                  {dayOfWeekInitialLabel(day)}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Label>
                Photos *{" "}
                <span className="font-normal text-muted-foreground">
                  ({venueForm.photo_urls.length}/{VENUE_PHOTO_MAX_COUNT} — at least {VENUE_PHOTO_MIN_COUNT} required)
                </span>
              </Label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {venueForm.photo_urls.map((url, i) => (
                  <div
                    key={url}
                    className="relative aspect-square overflow-hidden rounded-lg border border-border"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={url}
                      alt={`Photo ${i + 1}`}
                      className="h-full w-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <button
                      type="button"
                      onClick={() => removePhoto(url)}
                      className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-background/85 hover:bg-background"
                      aria-label="Remove photo"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
                {venueForm.photo_urls.length < VENUE_PHOTO_MAX_COUNT && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingPhoto}
                    className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-50"
                  >
                    {isUploadingPhoto ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Plus className="h-5 w-5" />
                    )}
                  </button>
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handlePhotoSelect}
              />
              {photoError ? (
                <p className="mt-1 text-xs text-destructive">{photoError}</p>
              ) : null}
            </div>
            {!venuePriceRangesValidation.ok ? (
              <p
                className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100"
                role="alert"
              >
                {venuePriceRangesValidation.error}
              </p>
            ) : null}
            {paymentSettingsValidation.ok ? null : (
              <p
                className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100"
                role="alert"
              >
                {paymentSettingsValidation.error}
              </p>
            )}
            <Button
              className="w-full font-heading font-semibold"
              type="button"
              onClick={() => saveVenue.mutate()}
              disabled={
                saveVenue.isPending ||
                isUploadingPhoto ||
                venueForm.photo_urls.length < VENUE_PHOTO_MIN_COUNT ||
                !venuePriceRangesValidation.ok ||
                !paymentSettingsValidation.ok ||
                Boolean(facebookUrlError) ||
                Boolean(instagramUrlError)
              }
            >
              {saveVenue.isPending ? "Saving..." : "Save Venue"}
            </Button>
          </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={closureOpen} onOpenChange={setClosureOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-heading">
              Set court/s unavailability
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Date *</Label>
              <Popover open={closureDateOpen} onOpenChange={setClosureDateOpen}>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "mt-1.5 h-11 w-full justify-start gap-2.5 rounded-xl border-border/80 bg-background px-3 text-left text-sm font-normal shadow-sm transition-[box-shadow,background-color] hover:bg-muted/50 hover:shadow-md",
                      !closureForm.date && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                    <span className="truncate">
                      {closureForm.date
                        ? format(new Date(`${closureForm.date}T12:00:00`), "MMMM d, yyyy")
                        : "Select date"}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent
                  className="z-120 w-auto overflow-hidden border-border/80 p-0 shadow-xl"
                  align="start"
                >
                  <Calendar
                    mode="single"
                    selected={new Date(`${closureForm.date}T12:00:00`)}
                    onSelect={(d) => {
                      if (!d) return;
                      const nextDate = format(d, "yyyy-MM-dd");
                      setClosureForm((prev) => ({
                        ...prev,
                        date: nextDate,
                      }));
                      setClosureTokensByCourtId({});
                      setClosureDateOpen(false);
                    }}
                    modifiers={{
                      hasClosure: (date) =>
                        existingClosureDates.includes(format(date, "yyyy-MM-dd")),
                    }}
                    modifiersClassNames={{
                      hasClosure:
                        "relative after:absolute after:bottom-1 after:left-1/2 after:h-1 after:w-1 after:-translate-x-1/2 after:rounded-full after:bg-primary after:content-['']",
                    }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              {existingClosureDates.length > 0 ? (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">
                    Existing:
                  </span>
                  {existingClosureDates.map((dateIso) => {
                    const isActive = dateIso === closureForm.date;
                    return (
                      <Button
                        key={dateIso}
                        type="button"
                        size="sm"
                        variant={isActive ? "default" : "outline"}
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                          setClosureForm((prev) => ({ ...prev, date: dateIso }));
                          setClosureTokensByCourtId({});
                        }}
                      >
                        {format(new Date(`${dateIso}T12:00:00`), "MMM d")}
                      </Button>
                    );
                  })}
                </div>
              ) : null}
            </div>
            <div className="space-y-3">
              <div>
                <Label>Court availability by timeslot *</Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  Loaded from the booking calendar surface. Blue toggles are unavailable closures
                  you can edit. Booked slots cannot be overridden.
                </p>
              </div>
              {closureGridLoading ? (
                <Skeleton className="h-24 w-full rounded-lg" />
              ) : (
                <div className="space-y-3">
                  {venueCourts.map((court) => {
                    const summary = closureTokenSummaryByCourtId.get(court.id);
                    const selected = new Set(
                      closureTokensByCourtId[court.id] ??
                        [...(summary?.existingCourtClosed ?? new Set<string>())],
                    );
                    const booked = summary?.booked ?? new Set<string>();
                    const venueClosed = summary?.venueClosed ?? new Set<string>();
                    const selectableTokens = closureTimeSlots.filter((time) => {
                      const isLocked = booked.has(time) || venueClosed.has(time);
                      const isPastOrCurrent = isBookableHourStartInPast(
                        time,
                        closureSelectedDate,
                      );
                      return !isLocked && !isPastOrCurrent;
                    });
                    const selectedSelectableCount = selectableTokens.filter((time) =>
                      selected.has(time),
                    ).length;
                    return (
                      <div
                        key={court.id}
                        className="rounded-lg border border-border/60 p-3"
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p className="text-sm font-medium text-foreground">{court.name}</p>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={selectableTokens.length === 0}
                            onClick={() =>
                              setClosureTokensByCourtId((prev) => ({
                                ...prev,
                                [court.id]:
                                  selectedSelectableCount === selectableTokens.length
                                    ? []
                                    : [...selectableTokens],
                              }))
                            }
                          >
                            {selectedSelectableCount === selectableTokens.length
                              ? "Unselect all"
                              : "Select all"}
                          </Button>
                        </div>
                        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                          {closureTimeSlots.map((time) => {
                            const isBooked = booked.has(time);
                            const isVenueClosed = venueClosed.has(time);
                            const isPastOrCurrent = isBookableHourStartInPast(
                              time,
                              closureSelectedDate,
                            );
                            const isLocked = isBooked || isVenueClosed || isPastOrCurrent;
                            const isSelected = selected.has(time) || isLocked;
                            const existing = summary?.existingClosureByHour.get(time);
                            const existingReasonTitle = existing
                              ? `Reason: ${formatClosureReason(existing.reason)}${
                                  existing.note ? ` — ${existing.note}` : ""
                                }`
                              : undefined;
                            return (
                              <Button
                                key={`${court.id}-${time}`}
                                type="button"
                                variant={isSelected ? "default" : "outline"}
                                size="sm"
                                disabled={isLocked}
                                className={cn(
                                  isBooked &&
                                    "border-amber-500/30 bg-amber-500/15 text-amber-900 hover:bg-amber-500/20 dark:text-amber-100",
                                  isVenueClosed &&
                                    "border-purple-500/30 bg-purple-500/15 text-purple-900 hover:bg-purple-500/20 dark:text-purple-100",
                                  isPastOrCurrent &&
                                    "border-slate-500/30 bg-slate-500/15 text-slate-700 hover:bg-slate-500/20 dark:text-slate-200",
                                )}
                                onClick={() =>
                                  setClosureTokensByCourtId((prev) => {
                                    const current = new Set(
                                      prev[court.id] ?? [
                                        ...(summary?.existingCourtClosed ??
                                          new Set<string>()),
                                      ],
                                    );
                                    if (current.has(time)) current.delete(time);
                                    else current.add(time);
                                    return {
                                      ...prev,
                                      [court.id]: [...current].sort((a, b) =>
                                        a.localeCompare(b),
                                      ),
                                    };
                                  })
                                }
                                title={
                                  isBooked
                                    ? "Booked slot (cannot override)"
                                    : isVenueClosed
                                      ? "Venue-level closure"
                                      : isPastOrCurrent
                                        ? "Past or current slot (cannot modify)"
                                      : existingReasonTitle
                                }
                              >
                                {formatBookableHourSlotRange(time)}
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div>
              <Label>Reason *</Label>
              <Select
                value={closureForm.reason}
                onValueChange={(v) =>
                  setClosureForm((prev) => ({ ...prev, reason: v }))
                }
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner_use">Owner use</SelectItem>
                  <SelectItem value="maintenance">Maintenance</SelectItem>
                  <SelectItem value="special_event">Special event</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Note (optional)</Label>
              <Textarea
                className="mt-1.5"
                value={closureForm.note}
                onChange={(e) =>
                  setClosureForm((prev) => ({ ...prev, note: e.target.value }))
                }
                placeholder="Internal note"
              />
            </div>
            <Button
              className="w-full font-heading font-semibold"
              type="button"
              onClick={() => saveClosureDraft.mutate()}
              disabled={saveClosureDraft.isPending}
            >
              {saveClosureDraft.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

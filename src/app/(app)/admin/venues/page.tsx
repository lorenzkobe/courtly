"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Building2, Loader2, Plus, RefreshCw, Trash2, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { type ChangeEvent, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { VenueMapPinPicker } from "@/components/admin/VenueMapPinPicker";
import { VenueTimeInput } from "@/components/admin/VenueTimeInput";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import PageHeader from "@/components/shared/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { apiErrorMessage } from "@/lib/api/api-error-message";
import { courtlyApi } from "@/lib/api/courtly-client";
import { queryKeys } from "@/lib/query/query-keys";
import { formatAmenityLabel } from "@/lib/format-amenity";
import { validateSocialUrl } from "@/lib/social-url";
import { validatePriceRangeFormRows } from "@/lib/venue-price-ranges";
import { validateVenuePaymentSettings } from "@/lib/venue-payment-methods";
import { formatStatusLabel } from "@/lib/utils";
import { optimizeVenuePhoto } from "@/lib/venues/optimize-venue-photo";
import { VENUE_PHOTO_MAX_COUNT, VENUE_PHOTO_MIN_COUNT } from "@/lib/venues/venue-photo-constraints";
import type { Venue } from "@/lib/types/courtly";

type PriceRangeRow = { start: string; end: string; rate: string };

const emptyRequestForm = {
  name: "",
  location: "",
  contact_phone: "",
  facebook_url: "",
  instagram_url: "",
  sport: "pickleball" as Venue["sport"],
  amenities: [] as string[],
  customAmenityDraft: "",
  photo_urls: [] as string[],
  hourly_rate_windows: [{ start: "07:00", end: "22:00", rate: "" }] as PriceRangeRow[],
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

function normAmenity(value: string) {
  return value.trim().toLowerCase();
}

export default function AdminVenuesPage() {
  const queryClient = useQueryClient();
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
  const [editingRequestStatus, setEditingRequestStatus] = useState<
    "pending" | "needs_update" | null
  >(null);
  const [form, setForm] = useState(emptyRequestForm);
  const [confirmCancelRequestId, setConfirmCancelRequestId] = useState<string | null>(null);
  const [confirmDeleteVenueId, setConfirmDeleteVenueId] = useState<string | null>(null);
  const [stagedPhotoUrls, setStagedPhotoUrls] = useState<string[]>([]);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: venueCards = [], isFetching: isFetchingVenues, refetch: refetchVenues } = useQuery({
    queryKey: ["admin-venues"],
    queryFn: async () => {
      const { data } = await courtlyApi.assignedVenues.list();
      return data;
    },
  });
  const { data: requestData, isLoading: isLoadingRequests, isFetching: isFetchingRequests, refetch: refetchRequests } = useQuery({
    queryKey: queryKeys.admin.venueRequests(),
    queryFn: async () => {
      const { data } = await courtlyApi.adminVenueRequests.list();
      return data;
    },
  });
  const myRequests = requestData?.requests ?? [];
  const isRefreshing = isFetchingVenues || isFetchingRequests;
  const actionableRequests = myRequests.filter(
    (request) =>
      request.request_status === "pending" || request.request_status === "needs_update",
  );

  const formRateValidation = useMemo(
    () => validatePriceRangeFormRows(form.hourly_rate_windows),
    [form.hourly_rate_windows],
  );
  const facebookUrlError = useMemo(
    () => validateSocialUrl(form.facebook_url, "facebook"),
    [form.facebook_url],
  );
  const instagramUrlError = useMemo(
    () => validateSocialUrl(form.instagram_url, "instagram"),
    [form.instagram_url],
  );
  const paymentValidation = useMemo(
    () =>
      validateVenuePaymentSettings(form, {
        requireAtLeastOne: true,
      }),
    [form],
  );

  const createRequest = useMutation({
    mutationFn: async () => {
      const parsed = validatePriceRangeFormRows(form.hourly_rate_windows);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      const payCheck = validateVenuePaymentSettings(form, { requireAtLeastOne: true });
      if (!payCheck.ok) {
        throw new Error(payCheck.error);
      }
      const body = {
        name: form.name.trim(),
        location: form.location.trim(),
        city: form.city.trim(),
        contact_phone: form.contact_phone.trim(),
        facebook_url: form.facebook_url.trim(),
        instagram_url: form.instagram_url.trim(),
        sport: form.sport,
        amenities: [...new Set(form.amenities.map((item) => item.trim()).filter(Boolean))],
        photo_urls: form.photo_urls,
        hourly_rate_windows: parsed.windows,
        map_latitude: form.map_latitude,
        map_longitude: form.map_longitude,
        accepts_gcash: form.accepts_gcash,
        gcash_account_name: form.gcash_account_name.trim(),
        gcash_account_number: form.gcash_account_number.trim(),
        accepts_maya: form.accepts_maya,
        maya_account_name: form.maya_account_name.trim(),
        maya_account_number: form.maya_account_number.trim(),
      };
      if (editingRequestId) {
        await courtlyApi.adminVenueRequests.update(editingRequestId, body);
        return "updated" as const;
      }
      await courtlyApi.adminVenueRequests.create(body);
      return "created" as const;
    },
    onSuccess: (mode) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.venueRequests() });
      if (mode === "updated" && editingRequestStatus === "needs_update") {
        toast.success("Venue request resent for review");
      } else {
        toast.success(mode === "updated" ? "Venue request updated" : "Venue request submitted");
      }
      setStagedPhotoUrls([]);
      setRequestDialogOpen(false);
      setForm(emptyRequestForm);
      setEditingRequestId(null);
      setEditingRequestStatus(null);
    },
    onError: (error: unknown) => {
      toast.error(apiErrorMessage(error, "Could not submit venue request"));
    },
  });

  const cancelRequest = useMutation({
    mutationFn: async (requestId: string) => {
      await courtlyApi.adminVenueRequests.cancel(requestId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.admin.venueRequests() });
      toast.success("Venue request cancelled");
    },
    onError: (error: unknown) => {
      toast.error(apiErrorMessage(error, "Could not cancel request"));
    },
  });

  const deleteVenue = useMutation({
    mutationFn: async (id: string) => {
      await courtlyApi.venues.remove(id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-venues"] });
      toast.success("Venue deleted");
    },
    onError: (error: unknown) => {
      toast.error(apiErrorMessage(error, "Could not delete venue"));
    },
  });

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
      setForm((prev) => ({ ...prev, photo_urls: [...prev.photo_urls, data.public_url] }));
    } catch (err) {
      setPhotoError(apiErrorMessage(err, "Could not upload photo"));
    } finally {
      setIsUploadingPhoto(false);
    }
  }

  function removePhoto(url: string) {
    setForm((prev) => ({ ...prev, photo_urls: prev.photo_urls.filter((u) => u !== url) }));
    if (stagedPhotoUrls.includes(url)) {
      setStagedPhotoUrls((prev) => prev.filter((u) => u !== url));
      void courtlyApi.venuePhotos.delete([url]);
    }
  }

  function cleanupStagedPhotos(currentPhotoUrls: string[]) {
    const orphaned = stagedPhotoUrls.filter((u) => !currentPhotoUrls.includes(u));
    if (orphaned.length > 0) {
      void courtlyApi.venuePhotos.delete(orphaned);
    }
    setStagedPhotoUrls([]);
  }

  const addCustomAmenity = () => {
    const nextValue = form.customAmenityDraft.trim();
    if (!nextValue) return;
    const exists = form.amenities.some((amenity) => normAmenity(amenity) === normAmenity(nextValue));
    if (exists) {
      setForm((prev) => ({ ...prev, customAmenityDraft: "" }));
      return;
    }
    setForm((prev) => ({
      ...prev,
      amenities: [...prev.amenities, nextValue],
      customAmenityDraft: "",
    }));
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 md:px-10">
      <ConfirmDialog
        open={!!confirmCancelRequestId}
        onOpenChange={(open) => {
          if (!open) setConfirmCancelRequestId(null);
        }}
        title="Cancel venue request?"
        description="You can cancel pending requests."
        confirmLabel="Cancel request"
        isPending={cancelRequest.isPending}
        onConfirm={() => {
          if (!confirmCancelRequestId) return;
          cancelRequest.mutate(confirmCancelRequestId);
          setConfirmCancelRequestId(null);
        }}
      />
      <ConfirmDialog
        open={!!confirmDeleteVenueId}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteVenueId(null);
        }}
        title="Delete venue?"
        description="This permanently removes the venue and all its data. You must remove all courts first. This cannot be undone."
        confirmLabel="Delete venue"
        countdownSeconds={5}
        isPending={deleteVenue.isPending}
        onConfirm={() => {
          if (!confirmDeleteVenueId) return;
          deleteVenue.mutate(confirmDeleteVenueId);
          setConfirmDeleteVenueId(null);
        }}
      />
      <PageHeader
        title="My venues"
        subtitle="Manage assigned venues and submit requests for new venues."
      >
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={async () => {
              await Promise.all([refetchVenues(), refetchRequests()]);
            }}
            disabled={isRefreshing}
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
          </Button>
          <Button
            onClick={() => {
              setEditingRequestId(null);
              setEditingRequestStatus(null);
              setForm(emptyRequestForm);
              setRequestDialogOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add new venue
          </Button>
        </div>
      </PageHeader>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <div className="space-y-6">
          {isFetchingVenues ? (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-48 rounded-xl" />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {venueCards.map((venue) => (
                <Card
                  key={venue.id}
                  className="overflow-hidden border-border/50 transition-shadow hover:shadow-md"
                >
                  {venue.image_url ? (
                    <div className="relative h-36 overflow-hidden">
                      <Image
                        src={venue.image_url}
                        alt={venue.name}
                        fill
                        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                        unoptimized
                        className="object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    </div>
                  ) : null}
                  <CardContent className="p-5">
                    <div className="mb-2">
                      <h3 className="font-heading font-bold text-foreground">
                        {venue.name}
                      </h3>
                    </div>
                    <div className="mb-4 space-y-1 text-sm text-muted-foreground">
                      <div>{venue.location}</div>
                      <div className="text-xs">
                        {venue.court_count}{" "}
                        {venue.court_count === 1 ? "court" : "courts"}
                        {venue.court_count === 0 ? " — add one from Manage courts" : ""}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button asChild variant="outline" className="flex-1">
                        <Link href={`/admin/venues/${venue.id}`}>
                          Manage courts <ChevronRight className="ml-1 h-4 w-4" />
                        </Link>
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        className="shrink-0 border-destructive/25 text-destructive hover:bg-destructive/5"
                        aria-label="Delete venue"
                        onClick={() => setConfirmDeleteVenueId(venue.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {!isFetchingVenues && venueCards.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
                <Building2 className="h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No assigned venues yet. Submit a venue request to get started.
                </p>
              </CardContent>
            </Card>
          ) : null}
        </div>

        {(isLoadingRequests || actionableRequests.length > 0) ? (
          <aside className="space-y-3">
            {!isLoadingRequests ? (
              <h2 className="font-heading text-lg font-semibold">Pending venue approval</h2>
            ) : null}
            {isFetchingRequests ? (
              <div className="space-y-3">
                {[1, 2].map((idx) => (
                  <Skeleton key={idx} className="h-28 rounded-xl" />
                ))}
              </div>
            ) : (
              <div className="space-y-3">
                {actionableRequests.map((request) => (
                  <Card key={request.id} className="border-border/60">
                    <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-heading font-semibold">{request.name}</h3>
                          <Badge variant="outline">
                            {formatStatusLabel(request.request_status)}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{request.location}</p>
                        {request.request_status === "needs_update" && request.review_note ? (
                          <p className="text-xs text-amber-700 dark:text-amber-200">
                            Update requested: {request.review_note}
                          </p>
                        ) : null}
                        <p className="text-xs text-muted-foreground">
                          Submitted {new Date(request.created_at).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setEditingRequestId(request.id);
                            setEditingRequestStatus(
                              request.request_status === "needs_update" ? "needs_update" : "pending",
                            );
                            setForm({
                              name: request.name,
                              location: request.location,
                              contact_phone: request.contact_phone,
                              facebook_url: request.facebook_url ?? "",
                              instagram_url: request.instagram_url ?? "",
                              sport: request.sport,
                              amenities: [...(request.amenities ?? [])],
                              customAmenityDraft: "",
                              photo_urls: request.photo_urls ?? [],
                              hourly_rate_windows:
                                request.hourly_rate_windows.length > 0
                                  ? request.hourly_rate_windows.map((window) => ({
                                      start: window.start,
                                      end: window.end,
                                      rate: String(window.hourly_rate),
                                    }))
                                  : [{ start: "07:00", end: "22:00", rate: "" }],
                              map_latitude: request.map_latitude ?? null,
                              map_longitude: request.map_longitude ?? null,
                              city: (request as { city?: string }).city ?? "",
                              accepts_gcash: request.accepts_gcash ?? false,
                              gcash_account_name: request.gcash_account_name ?? "",
                              gcash_account_number: request.gcash_account_number ?? "",
                              accepts_maya: request.accepts_maya ?? false,
                              maya_account_name: request.maya_account_name ?? "",
                              maya_account_number: request.maya_account_number ?? "",
                            });
                            setRequestDialogOpen(true);
                          }}
                        >
                          {request.request_status === "needs_update" ? "Update & resend" : "Edit"}
                        </Button>
                        {request.request_status === "pending" ? (
                          <Button
                            variant="outline"
                            onClick={() => setConfirmCancelRequestId(request.id)}
                          >
                            <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                            Cancel
                          </Button>
                        ) : null}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </aside>
        ) : null}
      </div>

      <Dialog
        open={requestDialogOpen}
        onOpenChange={(open) => {
          setRequestDialogOpen(open);
          if (!open) {
            cleanupStagedPhotos(form.photo_urls);
            setPhotoError(null);
            setEditingRequestId(null);
            setEditingRequestStatus(null);
            setForm(emptyRequestForm);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {editingRequestId
                ? editingRequestStatus === "needs_update"
                  ? "Update venue request"
                  : "Edit venue request"
                : "Add new venue"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Venue name *</Label>
              <Input
                className="mt-1.5"
                value={form.name}
                onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              />
            </div>
            <div>
              <Label>Location *</Label>
              <Input
                className="mt-1.5"
                value={form.location}
                onChange={(event) => setForm((prev) => ({ ...prev, location: event.target.value }))}
              />
            </div>
            <VenueMapPinPicker
              key="admin-venue-request"
              showPlaceSearch={true}
              value={
                form.map_latitude != null && form.map_longitude != null
                  ? { lat: form.map_latitude, lng: form.map_longitude }
                  : null
              }
              onChange={(next) =>
                setForm((prev) => ({
                  ...prev,
                  map_latitude: next?.lat ?? null,
                  map_longitude: next?.lng ?? null,
                }))
              }
              onPlaceDetails={({ city, address }) => {
                setForm((f) => ({
                  ...f,
                  city: city ?? f.city,
                  location: address ?? f.location,
                }));
              }}
            />
            <div>
              <Label>Contact number *</Label>
              <Input
                className="mt-1.5"
                value={form.contact_phone}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, contact_phone: event.target.value }))
                }
              />
            </div>
            <div>
              <Label>Facebook page link</Label>
              <Input
                className="mt-1.5"
                value={form.facebook_url}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, facebook_url: event.target.value }))
                }
              />
              {facebookUrlError ? (
                <p className="mt-1 text-xs text-destructive">{facebookUrlError}</p>
              ) : null}
            </div>
            <div>
              <Label>Instagram page link</Label>
              <Input
                className="mt-1.5"
                value={form.instagram_url}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, instagram_url: event.target.value }))
                }
              />
              {instagramUrlError ? (
                <p className="mt-1 text-xs text-destructive">{instagramUrlError}</p>
              ) : null}
            </div>
            <div className="space-y-3 rounded-xl border border-border/60 bg-muted/10 p-4">
              <div className="flex items-center justify-between gap-2">
                <Label>Price ranges *</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setForm((prev) => ({
                      ...prev,
                      hourly_rate_windows: [
                        ...prev.hourly_rate_windows,
                        { start: "07:00", end: "22:00", rate: "" },
                      ],
                    }))
                  }
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Add
                </Button>
              </div>
              {form.hourly_rate_windows.length > 0 && (
                <div className="space-y-3">
                {form.hourly_rate_windows.map((row, idx) => (
                  <div key={idx} className="rounded-xl border border-border/50 bg-background p-3">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        Range {idx + 1}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                        aria-label="Remove range"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            hourly_rate_windows: prev.hourly_rate_windows.filter(
                              (_, i) => i !== idx,
                            ),
                          }))
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <VenueTimeInput
                        value={row.start}
                        onChange={(value) =>
                          setForm((prev) => {
                            const next = [...prev.hourly_rate_windows];
                            next[idx] = { ...next[idx]!, start: value };
                            return { ...prev, hourly_rate_windows: next };
                          })
                        }
                      />
                      <VenueTimeInput
                        value={row.end}
                        onChange={(value) =>
                          setForm((prev) => {
                            const next = [...prev.hourly_rate_windows];
                            next[idx] = { ...next[idx]!, end: value };
                            return { ...prev, hourly_rate_windows: next };
                          })
                        }
                      />
                      <Input
                        type="number"
                        inputMode="decimal"
                        value={row.rate}
                        onChange={(event) =>
                          setForm((prev) => {
                            const next = [...prev.hourly_rate_windows];
                            next[idx] = { ...next[idx]!, rate: event.target.value };
                            return { ...prev, hourly_rate_windows: next };
                          })
                        }
                        placeholder="Rate (PHP / hr)"
                        className="sm:col-span-2"
                      />
                    </div>
                  </div>
                ))}
                </div>
              )}
            </div>
            <div>
              <Label className="mb-2 block">Payment methods *</Label>
              <div className="space-y-3 rounded-xl border border-border/60 bg-muted/10 p-4">
                <label className="flex items-center justify-between gap-2 rounded-lg border p-3">
                  <span>GCash</span>
                  <input
                    type="checkbox"
                    checked={form.accepts_gcash}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, accepts_gcash: event.target.checked }))
                    }
                  />
                </label>
                {form.accepts_gcash ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      value={form.gcash_account_name}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          gcash_account_name: event.target.value,
                        }))
                      }
                      placeholder="GCash account name"
                    />
                    <Input
                      value={form.gcash_account_number}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          gcash_account_number: event.target.value,
                        }))
                      }
                      placeholder="GCash account number"
                    />
                  </div>
                ) : null}
                <label className="flex items-center justify-between gap-2 rounded-lg border p-3">
                  <span>Maya</span>
                  <input
                    type="checkbox"
                    checked={form.accepts_maya}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, accepts_maya: event.target.checked }))
                    }
                  />
                </label>
                {form.accepts_maya ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Input
                      value={form.maya_account_name}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          maya_account_name: event.target.value,
                        }))
                      }
                      placeholder="Maya account name"
                    />
                    <Input
                      value={form.maya_account_number}
                      onChange={(event) =>
                        setForm((prev) => ({
                          ...prev,
                          maya_account_number: event.target.value,
                        }))
                      }
                      placeholder="Maya account number"
                    />
                  </div>
                ) : null}
              </div>
            </div>
            <div>
              <Label className="mb-2 block">Amenities</Label>
              <div className="mb-2 flex flex-wrap gap-2">
                {amenityOptions.map((amenity) => (
                  <button
                    key={amenity}
                    type="button"
                    className={`rounded-lg border px-3 py-1.5 text-xs ${
                      form.amenities.includes(amenity)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background"
                    }`}
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        amenities: prev.amenities.includes(amenity)
                          ? prev.amenities.filter((item) => item !== amenity)
                          : [...prev.amenities, amenity],
                      }))
                    }
                  >
                    {formatAmenityLabel(amenity)}
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  value={form.customAmenityDraft}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, customAmenityDraft: event.target.value }))
                  }
                  placeholder="Add custom amenity"
                />
                <Button type="button" variant="secondary" onClick={addCustomAmenity}>
                  Add
                </Button>
              </div>
            </div>
            <div>
              <Label>
                Photos *{" "}
                <span className="font-normal text-muted-foreground">
                  ({form.photo_urls.length}/{VENUE_PHOTO_MAX_COUNT} — at least {VENUE_PHOTO_MIN_COUNT} required)
                </span>
              </Label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {form.photo_urls.map((url, i) => (
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
                {form.photo_urls.length < VENUE_PHOTO_MAX_COUNT && (
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
          </div>
          {!formRateValidation.ok ? (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
              {formRateValidation.error}
            </p>
          ) : null}
          {!paymentValidation.ok ? (
            <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm">
              {paymentValidation.error}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRequestDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                createRequest.isPending ||
                isUploadingPhoto ||
                !form.name.trim() ||
                !form.location.trim() ||
                !form.contact_phone.trim() ||
                form.photo_urls.length < VENUE_PHOTO_MIN_COUNT ||
                !formRateValidation.ok ||
                !paymentValidation.ok ||
                Boolean(facebookUrlError) ||
                Boolean(instagramUrlError)
              }
              onClick={() => createRequest.mutate()}
            >
              {createRequest.isPending
                ? "Saving..."
                : editingRequestId
                  ? editingRequestStatus === "needs_update"
                    ? "Resend for review"
                    : "Save changes"
                  : "Submit request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Building2, Check, Loader2, Plus, RefreshCw, Trash2, UserPlus, X } from "lucide-react";
import { VenueMapPinPicker } from "@/components/admin/VenueMapPinPicker";
import { VenueTimeInput } from "@/components/admin/VenueTimeInput";
import { type ChangeEvent, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { apiErrorMessage } from "@/lib/api/api-error-message";
import { courtlyApi } from "@/lib/api/courtly-client";
import { normalizeBookingFee } from "@/lib/platform-fee";
import { queryKeys } from "@/lib/query/query-keys";
import { formatAmenityLabel } from "@/lib/format-amenity";
import { validateSocialUrl } from "@/lib/social-url";
import type { ManagedUser, Venue, VenueRequest } from "@/lib/types/courtly";
import { validatePriceRangeFormRows } from "@/lib/venue-price-ranges";
import { validateVenuePaymentSettings } from "@/lib/venue-payment-methods";
import { formatStatusLabel } from "@/lib/utils";
import { optimizeVenuePhoto } from "@/lib/venues/optimize-venue-photo";
import { VENUE_PHOTO_MAX_COUNT, VENUE_PHOTO_MIN_COUNT } from "@/lib/venues/venue-photo-constraints";

type PriceRangeRow = { start: string; end: string; rate: string };

const emptyForm = {
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
  hourly_rate_windows: [] as PriceRangeRow[],
  map_latitude: null as number | null,
  map_longitude: null as number | null,
  city: "",
  accepts_gcash: false,
  gcash_account_name: "",
  gcash_account_number: "",
  accepts_maya: false,
  maya_account_name: "",
  maya_account_number: "",
  booking_fee_override: "",
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

function adminDirectoryLabel(u: ManagedUser) {
  const fromParts = [u.first_name, u.last_name].filter(Boolean).join(" ").trim();
  const name = fromParts || u.full_name;
  return u.email ? `${name} (${u.email})` : name;
}

export default function SuperadminVenuesPage() {
  const PAGE_LIMIT = 20;
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingVenue, setEditingVenue] = useState<Venue | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [selectedAdminIds, setSelectedAdminIds] = useState<string[]>([]);
  const [adminToAdd, setAdminToAdd] = useState<string>("");
  const [reviewNoteByRequestId, setReviewNoteByRequestId] = useState<Record<string, string>>({});
  const [confirmRemoveVenueId, setConfirmRemoveVenueId] = useState<string | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [requestUpdateComposerOpen, setRequestUpdateComposerOpen] = useState(false);
  const [confirmApproveRequestId, setConfirmApproveRequestId] = useState<string | null>(null);
  const [confirmRejectRequestId, setConfirmRejectRequestId] = useState<string | null>(null);
  const [confirmRequestUpdateRequestId, setConfirmRequestUpdateRequestId] = useState<string | null>(null);
  const [bookingFeeInput, setBookingFeeInput] = useState("");
  const [bookingFeeTouched, setBookingFeeTouched] = useState(false);
  const [stagedPhotoUrls, setStagedPhotoUrls] = useState<string[]>([]);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    data: directoryPages,
    isFetching,
    isFetchingNextPage,
    fetchNextPage,
    refetch: refetchDirectory,
  } =
    useInfiniteQuery({
      queryKey: queryKeys.superadmin.directoryPaged(PAGE_LIMIT),
      queryFn: async ({ pageParam }) => {
        const { data } = await courtlyApi.superadmin.directory({
          limit: PAGE_LIMIT,
          users_cursor: pageParam.users_cursor,
          venues_cursor: pageParam.venues_cursor,
        });
        return data;
      },
      initialPageParam: {
        users_cursor: null as string | null,
        venues_cursor: null as string | null,
      },
      getNextPageParam: (lastPage) => ({
        users_cursor: lastPage.managed_users.next_cursor,
        venues_cursor: lastPage.venues.next_cursor,
      }),
    });
  const venues = useMemo(
    () => (directoryPages?.pages ?? []).flatMap((page) => page.venues.items),
    [directoryPages?.pages],
  );
  const managedUsers = useMemo(
    () =>
      (directoryPages?.pages ?? []).flatMap((page) => page.managed_users.items),
    [directoryPages?.pages],
  );
  const hasMoreVenues =
    directoryPages?.pages?.[directoryPages.pages.length - 1]?.venues.has_more ??
    false;

  const { data: requestData, isFetching: isFetchingRequests, refetch: refetchPendingRequests } = useQuery({
    queryKey: queryKeys.superadmin.venueRequests("pending"),
    queryFn: async () => {
      const { data } = await courtlyApi.superadminVenueRequests.list({
        status: "pending",
      });
      return data;
    },
  });
  const pendingRequests = requestData?.requests ?? [];
  const isRefreshing = isFetching || isFetchingRequests;
  const { data: bookingFeeSetting, isLoading: isLoadingBookingFee } = useQuery({
    queryKey: ["superadmin", "booking-fee-setting"],
    queryFn: async () => {
      const { data } = await courtlyApi.superadmin.bookingFee.get();
      return data;
    },
  });

  const serverBookingFeeStr = useMemo(() => {
    if (bookingFeeSetting == null) return "";
    const d = bookingFeeSetting.default_booking_fee ?? 0;
    return d === 0 ? "" : String(d);
  }, [bookingFeeSetting]);

  const bookingFeeFieldValue = bookingFeeTouched ? bookingFeeInput : serverBookingFeeStr;

  const saveBookingFeeSetting = useMutation({
    mutationFn: async () => {
      const displayForSave = bookingFeeTouched ? bookingFeeInput : serverBookingFeeStr;
      const raw =
        displayForSave.trim() ||
        String(bookingFeeSetting?.default_booking_fee ?? 0);
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error("Enter a non-negative whole-number booking fee (pesos).");
      }
      const normalized = normalizeBookingFee(parsed);
      await courtlyApi.superadmin.bookingFee.update(normalized);
      return normalized;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["superadmin", "booking-fee-setting"],
      });
      setBookingFeeTouched(false);
      setBookingFeeInput("");
      toast.success("Default booking fee updated.");
    },
    onError: (error: unknown) => {
      toast.error(apiErrorMessage(error, "Could not update booking fee setting."));
    },
  });
  const selectedRequest =
    pendingRequests.find((request) => request.id === selectedRequestId) ?? null;

  const adminOptions = managedUsers.filter(
    (managedUser) => managedUser.role === "admin",
  );

  const priceRangeFormValidation = useMemo(
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
  const paymentSettingsValidation = useMemo(
    () =>
      validateVenuePaymentSettings(form, {
        requireAtLeastOne: form.status === "active",
      }),
    [form],
  );

  const saveAccount = useMutation({
    mutationFn: async () => {
      const parsed = validatePriceRangeFormRows(form.hourly_rate_windows);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      const hasMapPin =
        form.map_latitude != null &&
        form.map_longitude != null &&
        Number.isFinite(form.map_latitude) &&
        Number.isFinite(form.map_longitude);
      const mapBody = hasMapPin
        ? { map_latitude: form.map_latitude!, map_longitude: form.map_longitude! }
        : editingVenue
          ? { map_latitude: null, map_longitude: null }
          : {};
      const beforeIds = new Set(
        managedUsers
          .filter(
            (managedUser) =>
              managedUser.role === "admin" &&
              ((managedUser as ManagedUser & { venue_ids?: string[] }).venue_ids ?? []).includes(
                editingVenue!.id,
              ),
          )
          .map((managedUser) => managedUser.id),
      );
      const afterIds = new Set(selectedAdminIds);
      const add_admin_user_ids = [...afterIds].filter((id) => !beforeIds.has(id));
      const remove_admin_user_ids = [...beforeIds].filter((id) => !afterIds.has(id));

      const body = {
        name: form.name.trim(),
        location: form.location.trim(),
        city: form.city.trim(),
        contact_phone: form.contact_phone.trim(),
        facebook_url: form.facebook_url.trim(),
        instagram_url: form.instagram_url.trim(),
        sport: form.sport,
        status: form.status,
        hourly_rate_windows: parsed.windows,
        amenities: [
          ...new Set(form.amenities.map((amenity) => amenity.trim()).filter(Boolean)),
        ],
        photo_urls: form.photo_urls,
        accepts_gcash: form.accepts_gcash,
        gcash_account_name: form.gcash_account_name.trim(),
        gcash_account_number: form.gcash_account_number.trim(),
        accepts_maya: form.accepts_maya,
        maya_account_name: form.maya_account_name.trim(),
        maya_account_number: form.maya_account_number.trim(),
        booking_fee_override: form.booking_fee_override.trim()
          ? normalizeBookingFee(Number.parseFloat(form.booking_fee_override))
          : null,
        add_admin_user_ids,
        remove_admin_user_ids,
        ...mapBody,
      };
      return courtlyApi.venues.update(editingVenue!.id, body);
    },
    onSuccess: async () => {
      await queryClient.refetchQueries({
        queryKey: queryKeys.superadmin.directoryPaged(PAGE_LIMIT),
      });
      toast.success("Venue updated");
      setStagedPhotoUrls([]);
      setDialogOpen(false);
      setEditingVenue(null);
      setForm(emptyForm);
      setSelectedAdminIds([]);
    },
    onError: (e: unknown) => {
      toast.error(apiErrorMessage(e, "Could not save venue"));
    },
  });

  const removeAccount = useMutation({
    mutationFn: async (id: string) => {
      await courtlyApi.venues.remove(id);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["superadmin", "directory", "paged"] });
      toast.success("Venue removed");
      setDialogOpen(false);
      setEditingVenue(null);
      setForm(emptyForm);
      setSelectedAdminIds([]);
    },
    onError: (err: unknown) => {
      toast.error(apiErrorMessage(err, "Could not remove account"));
    },
  });

  const approveRequest = useMutation({
    mutationFn: async (requestId: string) => {
      await courtlyApi.superadminVenueRequests.approve(requestId, {
        review_note: reviewNoteByRequestId[requestId]?.trim() || undefined,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.superadmin.venueRequests("pending") });
      void queryClient.invalidateQueries({ queryKey: ["superadmin", "directory", "paged"] });
      toast.success("Venue request approved");
      setSelectedRequestId(null);
    },
    onError: (error: unknown) => {
      toast.error(apiErrorMessage(error, "Could not approve request"));
    },
  });

  const rejectRequest = useMutation({
    mutationFn: async (requestId: string) => {
      await courtlyApi.superadminVenueRequests.reject(requestId, {
        review_note: reviewNoteByRequestId[requestId]?.trim() || undefined,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.superadmin.venueRequests("pending") });
      toast.success("Venue request rejected");
      setSelectedRequestId(null);
    },
    onError: (error: unknown) => {
      toast.error(apiErrorMessage(error, "Could not reject request"));
    },
  });

  const requestVenueUpdate = useMutation({
    mutationFn: async (requestId: string) => {
      const note = reviewNoteByRequestId[requestId]?.trim() ?? "";
      if (!note) {
        throw new Error("Please add a note before requesting updates.");
      }
      await courtlyApi.superadminVenueRequests.requestUpdate(requestId, {
        review_note: note,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: queryKeys.superadmin.venueRequests("pending"),
      });
      toast.success("Update request sent to admin");
      setSelectedRequestId(null);
    },
    onError: (error: unknown) => {
      toast.error(apiErrorMessage(error, "Could not request updates"));
    },
  });

  const openEdit = (a: Venue) => {
    const assignedAdminIds = managedUsers
      .filter(
        (u) =>
          u.role === "admin" &&
          ((u as ManagedUser & { venue_ids?: string[] }).venue_ids ?? []).includes(a.id),
      )
      .map((u) => u.id);
    setEditingVenue(a);
    setSelectedAdminIds(assignedAdminIds);
    setAdminToAdd("");
    setForm({
      name: a.name,
      location: a.location,
      contact_phone: a.contact_phone ?? "",
      facebook_url: a.facebook_url ?? "",
      instagram_url: a.instagram_url ?? "",
      sport: a.sport,
      status: a.status,
      amenities: [...(a.amenities ?? [])],
      customAmenityDraft: "",
      photo_urls: a.photo_urls ?? [],
      map_latitude:
        a.map_latitude != null && Number.isFinite(a.map_latitude)
          ? a.map_latitude
          : null,
      map_longitude:
        a.map_longitude != null && Number.isFinite(a.map_longitude)
          ? a.map_longitude
          : null,
      city: (a as { city?: string }).city ?? "",
      hourly_rate_windows:
        (a.hourly_rate_windows ?? []).length > 0
          ? (a.hourly_rate_windows ?? []).map((w) => ({
              start: w.start,
              end: w.end,
              rate: String(w.hourly_rate),
            }))
          : [{ start: "07:00", end: "22:00", rate: "" }],
      accepts_gcash: a.accepts_gcash ?? false,
      gcash_account_name: a.gcash_account_name ?? "",
      gcash_account_number: a.gcash_account_number ?? "",
      accepts_maya: a.accepts_maya ?? false,
      maya_account_name: a.maya_account_name ?? "",
      maya_account_number: a.maya_account_number ?? "",
      booking_fee_override:
        a.booking_fee_override != null && a.booking_fee_override !== undefined
          ? String(a.booking_fee_override)
          : "",
    });
    setDialogOpen(true);
  };

  const statusVariant =
    (s: Venue["status"]) =>
      s === "active"
        ? "bg-primary/10 text-primary"
        : "bg-destructive/10 text-destructive";

  const toggleAmenity = (amenity: string) => {
    setForm((prev) => ({
      ...prev,
      amenities: prev.amenities.includes(amenity)
        ? prev.amenities.filter((item) => item !== amenity)
        : [...prev.amenities, amenity],
    }));
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
    const next = form.customAmenityDraft.trim();
    if (!next) return;
    const exists = form.amenities.some(
      (item) => normAmenity(item) === normAmenity(next),
    );
    if (!exists) {
      setForm((prev) => ({
        ...prev,
        amenities: [...prev.amenities, next],
        customAmenityDraft: "",
      }));
      return;
    }
    setForm((prev) => ({ ...prev, customAmenityDraft: "" }));
  };

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 md:px-10">
      <ConfirmDialog
        open={!!confirmRemoveVenueId}
        onOpenChange={(open) => {
          if (!open) setConfirmRemoveVenueId(null);
        }}
        title="Delete venue?"
        description="This hides the venue from all listings and unassigns all admins. Booking history is preserved. Not allowed while there are pending, confirmed, or in-progress refund bookings."
        confirmLabel="Delete venue"
        countdownSeconds={5}
        isPending={removeAccount.isPending}
        onConfirm={() => {
          if (!confirmRemoveVenueId) return;
          removeAccount.mutate(confirmRemoveVenueId);
          setConfirmRemoveVenueId(null);
        }}
      />
      <ConfirmDialog
        open={!!confirmApproveRequestId}
        onOpenChange={(open) => {
          if (!open) setConfirmApproveRequestId(null);
        }}
        title="Approve venue request?"
        description="This will create the venue and assign the requester as a venue admin."
        confirmLabel="Approve"
        isPending={approveRequest.isPending}
        onConfirm={() => {
          if (!confirmApproveRequestId) return;
          approveRequest.mutate(confirmApproveRequestId);
          setConfirmApproveRequestId(null);
        }}
      />
      <ConfirmDialog
        open={!!confirmRejectRequestId}
        onOpenChange={(open) => {
          if (!open) setConfirmRejectRequestId(null);
        }}
        title="Reject venue request?"
        description="Rejecting permanently removes this request."
        confirmLabel="Reject"
        isPending={rejectRequest.isPending}
        onConfirm={() => {
          if (!confirmRejectRequestId) return;
          rejectRequest.mutate(confirmRejectRequestId);
          setConfirmRejectRequestId(null);
        }}
      />
      <ConfirmDialog
        open={!!confirmRequestUpdateRequestId}
        onOpenChange={(open) => {
          if (!open) setConfirmRequestUpdateRequestId(null);
        }}
        title="Send update request?"
        description="This will send your note to the admin and mark the request as needs update."
        confirmLabel="Send update request"
        isPending={requestVenueUpdate.isPending}
        onConfirm={() => {
          if (!confirmRequestUpdateRequestId) return;
          requestVenueUpdate.mutate(confirmRequestUpdateRequestId, {
            onSuccess: () => {
              setConfirmRequestUpdateRequestId(null);
              setRequestUpdateComposerOpen(false);
            },
          });
        }}
      />
      <PageHeader
        title="Venues"
        subtitle="Review pending venue requests, approve or reject them, and manage venue admins."
      >
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={async () => {
            await Promise.all([refetchDirectory(), refetchPendingRequests()]);
          }}
          disabled={isRefreshing}
        >
          <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
        </Button>
      </PageHeader>

      <div className="mb-8 grid gap-6 lg:grid-cols-3 lg:items-start">
        <Card className="border-border/60 lg:col-span-3">
          <CardContent className="space-y-2 p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:gap-4">
              <div className="min-w-0 flex-1 space-y-1.5">
                <Label htmlFor="superadmin-default-booking-fee">Default booking fee</Label>
                {isLoadingBookingFee ? (
                  <Skeleton className="h-11 w-full rounded-md" />
                ) : (
                  <Input
                    id="superadmin-default-booking-fee"
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="0"
                    value={bookingFeeFieldValue}
                    onChange={(event) => {
                      setBookingFeeTouched(true);
                      const digitsOnly = event.target.value.replace(/\D/g, "");
                      setBookingFeeInput(digitsOnly);
                    }}
                    className="h-11 tabular-nums"
                  />
                )}
              </div>
              <Button
                type="button"
                className="h-11 w-full shrink-0 sm:w-auto"
                onClick={() => saveBookingFeeSetting.mutate()}
                disabled={saveBookingFeeSetting.isPending || isLoadingBookingFee}
              >
                {saveBookingFeeSetting.isPending ? "Saving..." : "Save booking fee"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Venue-level overrides still take precedence when set.
            </p>
          </CardContent>
        </Card>
        <section className="space-y-3 lg:col-span-2">
          <h2 className="font-heading text-lg font-semibold">Active venues</h2>
          {isFetching ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          ) : venues.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center gap-4 py-12 text-center">
                <Building2 className="h-10 w-10 text-muted-foreground" />
                <p className="max-w-md text-sm text-muted-foreground">
                  No venues yet. Approved requests will appear here.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {venues.map((venue) => (
                <Card
                  key={venue.id}
                  className="cursor-pointer border-border/60 transition-shadow hover:shadow-sm"
                  onClick={() => openEdit(venue)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openEdit(venue);
                    }
                  }}
                >
                  <CardContent className="flex min-h-24 items-center justify-between gap-3 p-5">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-heading font-bold text-foreground">
                          {venue.name}
                        </h3>
                        <Badge
                          variant="outline"
                          className={statusVariant(venue.status)}
                        >
                          {formatStatusLabel(venue.status)}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{venue.location}</p>
                    </div>
                    <div className="shrink-0 text-xs text-muted-foreground">Click to edit</div>
                  </CardContent>
                </Card>
              ))}
              {hasMoreVenues ? (
                <div className="flex justify-center pt-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isFetchingNextPage}
                    onClick={() => void fetchNextPage()}
                  >
                    {isFetchingNextPage ? "Loading..." : "Load more"}
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </section>

        <aside className="space-y-3 lg:col-span-1">
          <h2 className="font-heading text-lg font-semibold">Pending venue requests</h2>
          {isFetchingRequests ? (
            <div className="space-y-3">
              {[1, 2].map((idx) => (
                <Skeleton key={idx} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : pendingRequests.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                No pending venue requests.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {pendingRequests.map((request) => (
                <VenueRequestCard
                  key={request.id}
                  request={request}
                  onOpen={() => setSelectedRequestId(request.id)}
                />
              ))}
            </div>
          )}
        </aside>
      </div>

      <Dialog
        open={!!selectedRequest}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedRequestId(null);
            setRequestUpdateComposerOpen(false);
          }
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">
              {requestUpdateComposerOpen ? "Request venue update" : "Venue request details"}
            </DialogTitle>
          </DialogHeader>
          {selectedRequest ? (
            requestUpdateComposerOpen ? (
              <>
                <div className="space-y-2">
                  <Label htmlFor="venue-request-update-note">Required note</Label>
                  <Textarea
                    id="venue-request-update-note"
                    value={reviewNoteByRequestId[selectedRequest.id] ?? ""}
                    onChange={(event) =>
                      setReviewNoteByRequestId((prev) => ({
                        ...prev,
                        [selectedRequest.id]: event.target.value,
                      }))
                    }
                    placeholder="Describe exactly what the admin should update before resubmitting."
                  />
                </div>
                <DialogFooter className="mt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setRequestUpdateComposerOpen(false)}
                  >
                    Back
                  </Button>
                  <Button
                    type="button"
                    disabled={requestVenueUpdate.isPending}
                    onClick={() => setConfirmRequestUpdateRequestId(selectedRequest.id)}
                  >
                    {requestVenueUpdate.isPending ? "Sending..." : "Send update request"}
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-heading text-lg font-semibold">{selectedRequest.name}</h3>
                    <p className="text-sm text-muted-foreground">{selectedRequest.location}</p>
                  </div>
                  <Badge
                    variant="outline"
                    className="bg-amber-500/10 text-amber-800 dark:text-amber-100"
                  >
                    Pending
                  </Badge>
                </div>

                <div className="grid gap-3 rounded-xl border border-border/60 bg-muted/10 p-4 text-sm sm:grid-cols-2">
                  <p>
                    <span className="font-medium">Contact:</span> {selectedRequest.contact_phone}
                  </p>
                  <p>
                    <span className="font-medium">Sport:</span> {formatStatusLabel(selectedRequest.sport)}
                  </p>
                  <p>
                    <span className="font-medium">Submitted:</span>{" "}
                    {new Date(selectedRequest.created_at).toLocaleString()}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Amenities</Label>
                  {selectedRequest.amenities.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {selectedRequest.amenities.map((amenity) => (
                        <Badge key={amenity} variant="outline">
                          {formatAmenityLabel(amenity)}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No amenities listed.</p>
                  )}
                </div>

                <div className="space-y-2">
                  <Label>Price ranges</Label>
                  <div className="space-y-2">
                    {selectedRequest.hourly_rate_windows.map((window, index) => (
                      <div
                        key={`${selectedRequest.id}-window-${index}`}
                        className="rounded-md border border-border/60 px-3 py-2 text-sm"
                      >
                        {window.start} - {window.end}: PHP {window.hourly_rate}/hr
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Location</Label>
                  <p className="text-sm text-muted-foreground">{selectedRequest.location}</p>
                  <VenueMapPinPicker
                    key={`request-map-${selectedRequest.id}`}
                    showPlaceSearch={false}
                    readOnly
                    value={
                      selectedRequest.map_latitude != null &&
                      selectedRequest.map_longitude != null
                        ? {
                            lat: selectedRequest.map_latitude,
                            lng: selectedRequest.map_longitude,
                          }
                        : null
                    }
                    onChange={() => {
                      // Read-only preview in superadmin request review.
                    }}
                  />
                  <p className="text-xs text-muted-foreground">
                    Coordinates:{" "}
                    {selectedRequest.map_latitude != null &&
                    selectedRequest.map_longitude != null
                      ? `${selectedRequest.map_latitude.toFixed(6)}, ${selectedRequest.map_longitude.toFixed(6)}`
                      : "Not set"}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Payment methods</Label>
                  <div className="grid gap-2 rounded-xl border border-border/60 bg-muted/10 p-3 text-sm sm:grid-cols-2">
                    <div>
                      <p className="font-medium">GCash</p>
                      <p className="text-muted-foreground">
                        {selectedRequest.accepts_gcash
                          ? `${selectedRequest.gcash_account_name ?? "-"} / ${selectedRequest.gcash_account_number ?? "-"}`
                          : "Disabled"}
                      </p>
                    </div>
                    <div>
                      <p className="font-medium">Maya</p>
                      <p className="text-muted-foreground">
                        {selectedRequest.accepts_maya
                          ? `${selectedRequest.maya_account_name ?? "-"} / ${selectedRequest.maya_account_number ?? "-"}`
                          : "Disabled"}
                      </p>
                    </div>
                  </div>
                </div>

              </div>

              <DialogFooter className="mt-4 flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => setConfirmApproveRequestId(selectedRequest.id)}
                  disabled={approveRequest.isPending || rejectRequest.isPending || requestVenueUpdate.isPending}
                >
                  <Check className="mr-1.5 h-4 w-4" />
                  {approveRequest.isPending ? "Approving..." : "Approve"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmRejectRequestId(selectedRequest.id)}
                  disabled={approveRequest.isPending || rejectRequest.isPending || requestVenueUpdate.isPending}
                >
                  {rejectRequest.isPending ? "Rejecting..." : "Reject"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setRequestUpdateComposerOpen(true)}
                  disabled={
                    approveRequest.isPending ||
                    rejectRequest.isPending ||
                    requestVenueUpdate.isPending
                  }
                >
                  Request update
                </Button>
              </DialogFooter>
              </>
            )
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            cleanupStagedPhotos(form.photo_urls);
            setPhotoError(null);
          }
          setDialogOpen(open);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-heading">Edit venue</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Venue name *</Label>
              <Input
                className="mt-1.5"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. BGC Makati Sports Center"
              />
            </div>
            <div>
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(value) =>
                  setForm({ ...form, status: value as Venue["status"] })
                }
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="closed">Inactive (closed)</SelectItem>
                </SelectContent>
              </Select>
              {form.status === "closed" ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Inactive venues stop accepting new bookings. Existing confirmed bookings are not automatically cancelled — contact players directly if their bookings will be affected.
                </p>
              ) : null}
            </div>
            <div>
              <Label>Location *</Label>
              <Input
                className="mt-1.5"
                value={form.location}
                onChange={(e) =>
                  setForm({ ...form, location: e.target.value })
                }
              />
            </div>
            <div>
              <VenueMapPinPicker
                key={editingVenue?.id ?? "edit-venue"}
                showPlaceSearch={true}
                value={
                  form.map_latitude != null &&
                  form.map_longitude != null &&
                  Number.isFinite(form.map_latitude) &&
                  Number.isFinite(form.map_longitude)
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
            </div>
            <div>
              <Label>Contact number *</Label>
              <Input
                className="mt-1.5"
                value={form.contact_phone}
                onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                placeholder="+63 9XX XXX XXXX or landline"
              />
            </div>
            <div>
              <Label>Venue booking fee override</Label>
              <Input
                className="mt-1.5"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={form.booking_fee_override}
                onChange={(e) =>
                  setForm({ ...form, booking_fee_override: e.target.value })
                }
                placeholder="Leave blank to use default booking fee"
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Optional. When set, this venue-specific fee overrides the superadmin default.
              </p>
            </div>
            <div>
              <Label>Facebook page link</Label>
              <Input
                className="mt-1.5"
                value={form.facebook_url}
                onChange={(e) => setForm({ ...form, facebook_url: e.target.value })}
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
                value={form.instagram_url}
                onChange={(e) => setForm({ ...form, instagram_url: e.target.value })}
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
            <div className="space-y-3 rounded-xl border border-border/60 bg-muted/10 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <Label>Price ranges *</Label>
                  <p className="mt-1 max-w-prose text-xs text-muted-foreground">
                    Ranges must not overlap (each hour belongs to at most one range).
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 self-start"
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
              {form.hourly_rate_windows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Add at least one time range and rate.
                </p>
              ) : (
                <div className="space-y-4">
                  {form.hourly_rate_windows.map((row, i) => (
                    <div
                      key={i}
                      className="rounded-xl border border-border/50 bg-background p-4 shadow-sm"
                    >
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:items-end">
                        <div className="min-w-0 space-y-1.5">
                          <Label
                            className="text-xs text-muted-foreground"
                            htmlFor={`superadmin-range-start-${i}`}
                          >
                            Start
                          </Label>
                          <VenueTimeInput
                            id={`superadmin-range-start-${i}`}
                            value={row.start}
                            onChange={(value) =>
                              setForm((prev) => {
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
                            htmlFor={`superadmin-range-end-${i}`}
                          >
                            End
                          </Label>
                          <VenueTimeInput
                            id={`superadmin-range-end-${i}`}
                            value={row.end}
                            onChange={(value) =>
                              setForm((prev) => {
                                const next = [...prev.hourly_rate_windows];
                                next[i] = { ...next[i]!, end: value };
                                return { ...prev, hourly_rate_windows: next };
                              })
                            }
                          />
                        </div>
                        <div className="min-w-0 space-y-1.5 sm:col-span-2">
                          <Label
                            className="text-xs text-muted-foreground"
                            htmlFor={`superadmin-range-rate-${i}`}
                          >
                            Rate (PHP / hr)
                          </Label>
                          <Input
                            id={`superadmin-range-rate-${i}`}
                            type="number"
                            inputMode="decimal"
                            className="h-11 w-full"
                            value={row.rate}
                            onChange={(e) =>
                              setForm((prev) => {
                                const next = [...prev.hourly_rate_windows];
                                next[i] = { ...next[i]!, rate: e.target.value };
                                return { ...prev, hourly_rate_windows: next };
                              })
                            }
                            placeholder="e.g. 450"
                          />
                        </div>
                        <div className="flex justify-end sm:col-span-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-11 w-11 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            aria-label="Remove range"
                            onClick={() =>
                              setForm((prev) => ({
                                ...prev,
                                hourly_rate_windows: prev.hourly_rate_windows.filter(
                                  (_, idx) => idx !== i,
                                ),
                              }))
                            }
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Label className="mb-2 block">Payment methods *</Label>
              <p className="mb-2 text-xs text-muted-foreground">
                Add at least one method. Only enabled methods appear in checkout.
              </p>
              <div className="space-y-3 rounded-xl border border-border/60 bg-muted/10 p-4">
                <label
                  className={`block rounded-lg border p-3 transition-colors ${
                    form.accepts_gcash
                      ? "border-primary/40 bg-primary/5"
                      : "border-border/60 bg-background"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">GCash</span>
                    <input
                      type="checkbox"
                      checked={form.accepts_gcash}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, accepts_gcash: e.target.checked }))
                      }
                    />
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Mobile wallet transfer details shown to players.
                  </span>
                  {form.accepts_gcash ? (
                    <span className="mt-3 grid gap-2 sm:grid-cols-2">
                      <Input
                        value={form.gcash_account_name}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, gcash_account_name: e.target.value }))
                        }
                        placeholder="Account name"
                      />
                      <Input
                        value={form.gcash_account_number}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, gcash_account_number: e.target.value }))
                        }
                        placeholder="Account number"
                      />
                    </span>
                  ) : null}
                </label>
                <label
                  className={`block rounded-lg border p-3 transition-colors ${
                    form.accepts_maya
                      ? "border-primary/40 bg-primary/5"
                      : "border-border/60 bg-background"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">Maya</span>
                    <input
                      type="checkbox"
                      checked={form.accepts_maya}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, accepts_maya: e.target.checked }))
                      }
                    />
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    Wallet transfer details shown to players.
                  </span>
                  {form.accepts_maya ? (
                    <span className="mt-3 grid gap-2 sm:grid-cols-2">
                      <Input
                        value={form.maya_account_name}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, maya_account_name: e.target.value }))
                        }
                        placeholder="Account name"
                      />
                      <Input
                        value={form.maya_account_number}
                        onChange={(e) =>
                          setForm((prev) => ({ ...prev, maya_account_number: e.target.value }))
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
                      form.amenities.includes(amenity)
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-background text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    {formatAmenityLabel(amenity)}
                  </button>
                ))}
              </div>
              {form.amenities.filter((item) => !amenityOptions.includes(item)).length >
              0 ? (
                <div className="mb-3 flex flex-wrap gap-2">
                  {form.amenities
                    .filter((item) => !amenityOptions.includes(item))
                    .map((customAmenity) => (
                      <Badge
                        key={customAmenity}
                        variant="outline"
                        className="cursor-pointer"
                        onClick={() =>
                          setForm((prev) => ({
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
                  value={form.customAmenityDraft}
                  onChange={(e) => setForm({ ...form, customAmenityDraft: e.target.value })}
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
            <div>
              <Label>Venue admins</Label>
              <p className="mb-1.5 text-xs text-muted-foreground">
                Add or remove court admins. Only users with Court admin role are allowed.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {selectedAdminIds.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No assigned admins.</p>
                ) : (
                  selectedAdminIds.map((adminId) => {
                    const adminUser = adminOptions.find((option) => option.id === adminId);
                    if (!adminUser) return null;
                    return (
                      <Badge
                        key={adminId}
                        variant="outline"
                        className="gap-1.5 border-primary/30 bg-primary/10 py-1 text-primary"
                      >
                        <span>{adminDirectoryLabel(adminUser)}</span>
                        <button
                          type="button"
                          aria-label={`Remove ${adminDirectoryLabel(adminUser)}`}
                          onClick={() =>
                            setSelectedAdminIds((prev) => prev.filter((id) => id !== adminId))
                          }
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </Badge>
                    );
                  })
                )}
              </div>
              <div className="flex gap-2">
                <Select value={adminToAdd} onValueChange={setAdminToAdd}>
                  <SelectTrigger className="mt-2 flex-1">
                    <SelectValue placeholder="Select court admin" />
                  </SelectTrigger>
                  <SelectContent>
                    {adminOptions
                      .filter((adminUser) => !selectedAdminIds.includes(adminUser.id))
                      .map((adminUser) => (
                        <SelectItem key={adminUser.id} value={adminUser.id}>
                          {adminDirectoryLabel(adminUser)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-2"
                  onClick={() => {
                    if (!adminToAdd) return;
                    setSelectedAdminIds((prev) => [...prev, adminToAdd]);
                    setAdminToAdd("");
                  }}
                  disabled={!adminToAdd}
                >
                  <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                  Add
                </Button>
              </div>
            </div>
          </div>
          {!priceRangeFormValidation.ok ? (
            <p
              className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-950 dark:text-amber-100"
              role="alert"
            >
              {priceRangeFormValidation.error}
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
          <DialogFooter className="gap-2 sm:gap-0">
            {editingVenue ? (
              <Button
                type="button"
                variant="outline"
                className="border-destructive/25 text-destructive hover:bg-destructive/5"
                onClick={() => setConfirmRemoveVenueId(editingVenue.id)}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Delete
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="font-heading font-semibold"
              disabled={
                saveAccount.isPending ||
                isUploadingPhoto ||
                !form.name.trim() ||
                !form.location.trim() ||
                !form.contact_phone.trim() ||
                form.photo_urls.length < VENUE_PHOTO_MIN_COUNT ||
                !priceRangeFormValidation.ok ||
                !paymentSettingsValidation.ok ||
                Boolean(facebookUrlError) ||
                Boolean(instagramUrlError)
              }
              onClick={() => saveAccount.mutate()}
            >
              {saveAccount.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function VenueRequestCard({
  request,
  onOpen,
}: {
  request: VenueRequest;
  onOpen: () => void;
}) {
  return (
    <Card
      className="cursor-pointer border-border/60 transition-shadow hover:shadow-sm"
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
    >
      <CardContent className="space-y-3 p-4">
        <div className="min-w-0">
          <h3 className="font-heading text-base font-semibold">
            {request.name}
          </h3>
          <p className="truncate text-sm text-muted-foreground">
            {request.location}
          </p>
          <p className="text-sm text-muted-foreground">
            By: {request.requested_by_name ?? request.requested_by}
          </p>
          <p className="shrink-0 text-xs text-muted-foreground">
            Submitted {new Date(request.created_at).toLocaleString()}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

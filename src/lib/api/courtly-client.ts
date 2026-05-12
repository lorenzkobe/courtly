import { http } from "@/lib/http-client";
import type {
  AdminVenueWorkspaceResponse,
  BookingAdminNote,
  Booking,
  BookingCheckoutResponse,
  BookingDetailContextResponse,
  BookingDetailGroupResponse,
  CourtBookingSurfaceResponse,
  CursorPage,
  CourtDayAvailability,
  CourtDetailContextResponse,
  Court,
  CourtClosure,
  CourtReview,
  DashboardOverviewResponse,
  ManagedUser,
  OpenPlayComment,
  OpenPlayCreateResponse,
  OpenPlayDetailResponse,
  OpenPlayJoinRequest,
  OpenPlaySession,
  MyBookingsOverviewResponse,
  RevenueSummaryResponse,
  AdminVenueRequestsResponse,
  SessionUser,
  SuperadminDirectoryPagedResponse,
  SuperadminVenueRequestsResponse,
  Tournament,
  TournamentRegistration,
  Venue,
  VenueRequest,
  VenueClosure,
  VenueDetailResponse,
} from "@/lib/types/courtly";

/** API accepts explicit null to clear nullable map columns on PATCH. */
export type VenueWritePayload = Omit<Partial<Venue>, "map_latitude" | "map_longitude"> & {
  map_latitude?: number | null;
  map_longitude?: number | null;
  add_admin_user_ids?: string[];
  remove_admin_user_ids?: string[];
};
import type { NotificationsListResponse } from "@/lib/notifications/types";

export type AdminAssignedVenueSummary = {
  id: string;
  name: string;
  location: string;
  image_url: string;
  court_count: number;
};

export const courtlyApi = {
  auth: {
    session: () =>
      http.get<{ user: import("@/lib/types/courtly").SessionUser | null }>(
        "/api/auth/session",
      ),
    login: (body: { email: string; password: string }) =>
      http.post<{ user: SessionUser | null }>("/api/auth/login", body),
    signup: (body: {
      email: string;
      firstName: string;
      lastName: string;
      birthdate: string;
      mobileNumber: string;
      password: string;
      confirmPassword: string;
    }) => http.post("/api/auth/signup", body),
    setPassword: (body: { password: string; confirmPassword: string }) =>
      http.post<{ ok: boolean }>("/api/auth/set-password", body),
    forgotPassword: (body: { email: string }) =>
      http.post<{ ok: boolean; message?: string }>("/api/auth/forgot-password", body),
    logout: () => http.post("/api/auth/logout"),
  },

  courts: {
    list: (params?: {
      status?: string;
      manageable?: boolean;
      sport?: string;
    }) => http.get<Court[]>("/api/courts", { params }),
    get: (id: string) => http.get<Court>(`/api/courts/${id}`),
    getWithContext: (id: string) =>
      http.get<CourtDetailContextResponse>(`/api/courts/${id}`, {
        params: { include_context: true },
      }),
    bookingSurface: (id: string, params: { date: string }) =>
      http.get<CourtBookingSurfaceResponse>(`/api/courts/${id}/booking-surface`, {
        params,
      }),
    create: (data: Partial<Court>) => http.post<Court>("/api/courts", data),
    update: (id: string, data: Partial<Court>) =>
      http.patch<Court>(`/api/courts/${id}`, data),
    remove: (id: string) => http.delete(`/api/courts/${id}`),
    availability: (id: string, params: { date: string }) =>
      http.get<CourtDayAvailability>(`/api/courts/${id}/availability`, {
        params,
      }),
  },

  courtClosures: {
    list: (courtId: string, params?: { date?: string }) =>
      http.get<CourtClosure[]>(`/api/courts/${courtId}/closures`, {
        params: params?.date ? { date: params.date } : {},
      }),
    create: (courtId: string, data: Partial<CourtClosure>) =>
      http.post<CourtClosure>(`/api/courts/${courtId}/closures`, data),
    update: (
      courtId: string,
      closureId: string,
      data: Partial<CourtClosure>,
    ) =>
      http.patch<CourtClosure>(
        `/api/courts/${courtId}/closures/${closureId}`,
        data,
      ),
    remove: (courtId: string, closureId: string) =>
      http.delete(`/api/courts/${courtId}/closures/${closureId}`),
  },

  venueReviews: {
    bundle: (venueId: string) =>
      http.get<{ court: Court | null; reviews: CourtReview[] }>(
        `/api/venues/${venueId}/reviews`,
      ),
    create: (
      venueId: string,
      body: { booking_id: string; rating: number; comment?: string },
    ) => http.post<CourtReview>(`/api/venues/${venueId}/reviews`, body),
    update: (
      venueId: string,
      reviewId: string,
      body: Partial<{
        rating: number;
        comment: string;
        clear_flag: boolean;
      }>,
    ) =>
      http.patch<CourtReview>(
        `/api/venues/${venueId}/reviews/${reviewId}`,
        body,
      ),
    remove: (venueId: string, reviewId: string) =>
      http.delete(`/api/venues/${venueId}/reviews/${reviewId}`),
    flag: (
      venueId: string,
      reviewId: string,
      body?: { reason?: string },
    ) =>
      http.post<CourtReview>(
        `/api/venues/${venueId}/reviews/${reviewId}/flag`,
        body ?? {},
      ),
  },

  venueClosures: {
    list: (venueId: string, params?: { date?: string }) =>
      http.get<VenueClosure[]>(`/api/venues/${venueId}/closures`, {
        params: params?.date ? { date: params.date } : {},
      }),
    create: (venueId: string, data: Partial<VenueClosure>) =>
      http.post<VenueClosure>(`/api/venues/${venueId}/closures`, data),
    update: (
      venueId: string,
      closureId: string,
      data: Partial<VenueClosure>,
    ) =>
      http.patch<VenueClosure>(
        `/api/venues/${venueId}/closures/${closureId}`,
        data,
      ),
    remove: (venueId: string, closureId: string) =>
      http.delete(`/api/venues/${venueId}/closures/${closureId}`),
  },

  bookings: {
    list: (params?: {
      court_id?: string;
      date?: string;
      player_email?: string;
      manageable?: boolean;
      sport?: string;
      booking_group_id?: string;
    }) => http.get<Booking[]>("/api/bookings", { params }),
    listPaged: (params?: {
      court_id?: string;
      date?: string;
      player_email?: string;
      manageable?: boolean;
      sport?: string;
      booking_group_id?: string;
      cursor?: string | null;
      limit?: number;
    }) =>
      http.get<CursorPage<Booking>>("/api/bookings", {
        params,
      }),
    get: (id: string) => http.get<Booking>(`/api/bookings/${id}`),
    getWithGroup: (id: string) =>
      http.get<BookingDetailGroupResponse>(`/api/bookings/${id}`, {
        params: { include_group: true },
      }),
    getDetailContext: (id: string) =>
      http.get<BookingDetailContextResponse>(`/api/bookings/${id}`, {
        params: { include_group: true, include_context: true },
      }),
    create: (data: Partial<Booking>) =>
      http.post<Booking>("/api/bookings", data),
    createMany: (items: Partial<Booking>[]) =>
      http.post<Booking[]>("/api/bookings", { items }),
    checkout: (items: Partial<Booking>[]) =>
      http.post<BookingCheckoutResponse>("/api/bookings/checkout", { items }),
    submitPaymentProof: (
      id: string,
      body: {
        payment_method: "gcash" | "maya";
        payment_proof_data_url: string;
        payment_proof_mime_type: "image/jpeg";
        payment_proof_bytes: number;
        payment_proof_width: number;
        payment_proof_height: number;
      },
    ) =>
      http.post<{ ok: boolean; status: Booking["status"] }>(
        `/api/bookings/${id}/submit-proof`,
        body,
      ),
    cancelPending: (body: { booking_id?: string; booking_group_id?: string }) =>
      http.post<{ ok: boolean; deleted_booking_ids: string[] }>(
        "/api/bookings/cancel-pending",
        body,
      ),
    update: (id: string, data: Partial<Booking>) =>
      http.patch<Booking>(`/api/bookings/${id}`, data),
    setAdminNote: (
      id: string,
      body: { admin_note?: string; clear_admin_note?: boolean },
    ) => http.patch<Booking>(`/api/bookings/${id}`, body),
  },

  tournaments: {
    list: (params?: {
      status?: string;
      limit?: number;
      sort?: string;
      sport?: string;
    }) => http.get<Tournament[]>("/api/tournaments", { params }),
    get: (id: string, params?: { sport?: string }) =>
      http.get<Tournament>(`/api/tournaments/${id}`, { params }),
    update: (id: string, data: Partial<Tournament>) =>
      http.patch<Tournament>(`/api/tournaments/${id}`, data),
    register: (
      id: string,
      body: {
        player_name: string;
        player_email: string;
        partner_name?: string;
        skill_level: string;
      },
    ) => http.post(`/api/tournaments/${id}/register`, body),
  },

  openPlay: {
    list: (params?: {
      status?: string;
      limit?: number;
      sport?: string;
      booking_group_id?: string;
      hosted_by_me?: boolean;
    }) => http.get<OpenPlaySession[]>("/api/open-play", { params }),
    create: (body: {
      booking_group_id: string;
      court_ids?: string[];
      title: string;
      max_players: number;
      price_per_player: number;
      dupr_min: number;
      dupr_max: number;
      description?: string;
      accepts_gcash: boolean;
      gcash_account_name?: string;
      gcash_account_number?: string;
      accepts_maya: boolean;
      maya_account_name?: string;
      maya_account_number?: string;
    }) => http.post<OpenPlayCreateResponse>("/api/open-play", body),
    get: (id: string) => http.get<OpenPlayDetailResponse>(`/api/open-play/${id}`),
    join: (id: string, body?: { join_note?: string }) =>
      http.post<{
        result: "locked" | "full" | "already_active" | "not_found";
        request: OpenPlayJoinRequest | null;
      }>(`/api/open-play/${id}/join`, body ?? {}),
    submitProof: (
      id: string,
      body: {
        payment_method: "gcash" | "maya";
        payment_proof_data_url: string;
        payment_proof_mime_type: "image/jpeg";
        payment_proof_bytes: number;
        payment_proof_width: number;
        payment_proof_height: number;
        join_note?: string;
      },
    ) =>
      http.post<{ request: OpenPlayJoinRequest }>(`/api/open-play/${id}/submit-proof`, body),
    approveRequest: (id: string, requestId: string, body?: { organizer_note?: string }) =>
      http.post<{ request: OpenPlayJoinRequest }>(
        `/api/open-play/${id}/requests/${requestId}/approve`,
        body ?? {},
      ),
    denyRequest: (id: string, requestId: string, body?: { organizer_note?: string }) =>
      http.post<{ request: OpenPlayJoinRequest }>(
        `/api/open-play/${id}/requests/${requestId}/deny`,
        body ?? {},
      ),
    cancelRequest: (id: string, requestId: string) =>
      http.post<{ request: OpenPlayJoinRequest }>(
        `/api/open-play/${id}/requests/${requestId}/cancel`,
        {},
      ),
    addComment: (id: string, body: { comment: string }) =>
      http.post<{ comment: OpenPlayComment }>(`/api/open-play/${id}/comments`, body),
    updateComment: (sessionId: string, commentId: string, body: { comment: string }) =>
      http.patch<{ comment: OpenPlayComment }>(
        `/api/open-play/${sessionId}/comments/${commentId}`,
        body,
      ),
    update: (id: string, data: Partial<OpenPlaySession>) =>
      http.patch<OpenPlaySession>(`/api/open-play/${id}`, data),
    delete: (id: string) => http.delete<{ ok: boolean }>(`/api/open-play/${id}`),
  },

  registrations: {
    list: (params?: { player_email?: string }) =>
      http.get<TournamentRegistration[]>("/api/tournament-registrations", {
        params,
      }),
  },

  venuePhotos: {
    upload: (dataUrl: string) =>
      http.post<{ public_url: string }>("/api/admin/venue-photos", { data_url: dataUrl }),
    delete: (publicUrls: string[]) =>
      http.delete("/api/admin/venue-photos", { data: { public_urls: publicUrls } }),
  },

  venues: {
    list: () => http.get<Venue[]>("/api/venues"),
    get: (id: string) =>
      http.get<VenueDetailResponse>(`/api/venues/${id}`),
    update: (id: string, data: VenueWritePayload) =>
      http.patch<Venue>(`/api/venues/${id}`, data),
    remove: (id: string) => http.delete(`/api/venues/${id}`),
  },

  adminVenueRequests: {
    list: () => http.get<AdminVenueRequestsResponse>("/api/admin/venue-requests"),
    create: (data: VenueWritePayload) =>
      http.post<VenueRequest>("/api/admin/venue-requests", data),
    update: (id: string, data: VenueWritePayload) =>
      http.patch<VenueRequest>(`/api/admin/venue-requests/${id}`, data),
    cancel: (id: string) =>
      http.patch<VenueRequest>(`/api/admin/venue-requests/${id}`, {
        cancel_request: true,
      }),
  },

  superadminVenueRequests: {
    list: (params?: { status?: string }) =>
      http.get<SuperadminVenueRequestsResponse>("/api/superadmin/venue-requests", { params }),
    approve: (id: string, body?: { review_note?: string }) =>
      http.post<{ request: VenueRequest; venue: Venue }>(
        `/api/superadmin/venue-requests/${id}/approve`,
        body ?? {},
      ),
    reject: (id: string, body?: { review_note?: string }) =>
      http.post<{ ok: boolean }>(
        `/api/superadmin/venue-requests/${id}/reject`,
        body ?? {},
      ),
    requestUpdate: (id: string, body: { review_note: string }) =>
      http.post<VenueRequest>(
        `/api/superadmin/venue-requests/${id}/request-update`,
        body,
      ),
    remove: (id: string) => http.delete<{ ok: boolean }>(`/api/superadmin/venue-requests/${id}`),
  },

  adminVenues: {
    workspace: (venueId: string) =>
      http.get<AdminVenueWorkspaceResponse>(`/api/admin/venues/${venueId}/workspace`),
    applyClosures: (
      venueId: string,
      body: {
        date: string;
        reason: string;
        note?: string;
        court_ids: string[];
        ranges: Array<{ start_time: string; end_time: string }>;
      },
    ) => http.post<{ ok: boolean }>(`/api/admin/venues/${venueId}/closures/bulk`, body),
  },

  adminBookings: {
    bulkStatus: (updates: Array<{ id: string; status: Booking["status"] }>) =>
      http.patch<{ updates: Booking[] }>("/api/admin/bookings/bulk-status", { updates }),
    listNotes: (bookingId: string) =>
      http.get<{ notes: BookingAdminNote[] }>(`/api/admin/bookings/${bookingId}/notes`),
    addNote: (bookingId: string, note: string) =>
      http.post<{ note: BookingAdminNote }>(`/api/admin/bookings/${bookingId}/notes`, { note }),
  },

  superadmin: {
    directory: (params?: {
      users_cursor?: string | null;
      venues_cursor?: string | null;
      limit?: number;
    }) => http.get<SuperadminDirectoryPagedResponse>("/api/superadmin/directory", { params }),
    bookingFee: {
      get: () =>
        http.get<{ default_booking_fee: number }>("/api/superadmin/settings/booking-fee"),
      update: (defaultBookingFee: number) =>
        http.patch<{ ok: boolean; default_booking_fee: number }>(
          "/api/superadmin/settings/booking-fee",
          { default_booking_fee: defaultBookingFee },
        ),
    },
  },

  assignedVenues: {
    list: () =>
      http.get<AdminAssignedVenueSummary[]>("/api/admin/assigned-venues"),
  },

  managedUsers: {
    list: () => http.get<ManagedUser[]>("/api/admin/managed-users"),
    create: (data: Partial<ManagedUser>) =>
      http.post<ManagedUser>("/api/admin/managed-users", data),
    update: (id: string, data: Partial<ManagedUser>) =>
      http.patch<ManagedUser>(`/api/admin/managed-users/${id}`, data),
    audits: (
      id: string,
      params?: { cursor?: string | null; limit?: number | null },
    ) =>
      http.get<{
        items: Array<{
          id: string;
          actor_user_id: string;
          target_user_id: string;
          changed_fields: Record<string, { before: unknown; after: unknown }>;
          created_at: string;
        }>;
        has_more: boolean;
        next_cursor: string | null;
      }>(`/api/admin/managed-users/${id}/audits`, {
        params: {
          ...(params?.cursor ? { cursor: params.cursor } : {}),
          ...(params?.limit != null ? { limit: String(params.limit) } : {}),
        },
      }),
    remove: (id: string) => http.delete(`/api/admin/managed-users/${id}`),
    resendInvite: (id: string) =>
      http.post<{
        emailed: boolean;
        action_link?: string;
        message?: string;
      }>(`/api/admin/managed-users/${id}/resend-invite`),
  },

  revenue: {
    summary: (params?: {
      from?: string | null;
      to?: string | null;
      venue_id?: string | null;
    }) =>
      http.get<RevenueSummaryResponse>("/api/admin/revenue", {
        params: {
          ...(params?.from ? { from: params.from } : {}),
          ...(params?.to ? { to: params.to } : {}),
          ...(params?.venue_id ? { venue_id: params.venue_id } : {}),
        },
      }),
  },

  flaggedReviews: {
    list: (params?: { cursor?: string | null; limit?: number }) =>
      http.get<
        CursorPage<
          CourtReview & {
            court_name: string;
            venue_name: string;
          }
        >
      >("/api/admin/flagged-reviews", { params }),
  },

  notifications: {
    list: (params?: { cursor?: string | null; limit?: number }) =>
      http.get<NotificationsListResponse>("/api/notifications", { params }),
    markAllRead: () => http.patch<{ ok: boolean }>("/api/notifications"),
    markRead: (id: string) => http.patch<{ ok: boolean }>(`/api/notifications/${id}`),
  },

  favoriteVenues: {
    list: () => http.get<{ venue_ids: string[] }>("/api/favorite-venues"),
    set: (venueId: string, favorite: boolean) =>
      http.patch<{ ok: boolean }>("/api/favorite-venues", {
        venue_id: venueId,
        favorite,
      }),
  },

  dashboard: {
    overview: (params?: { sport?: string; date?: string }) =>
      http.get<DashboardOverviewResponse>("/api/dashboard/overview", { params }),
  },

  me: {
    bookingsOverview: (params?: {
      sport?: string;
      bookings_cursor?: string | null;
      registrations_cursor?: string | null;
      limit?: number;
    }) => http.get<MyBookingsOverviewResponse>("/api/me/bookings-overview", { params }),
  },

  superadminBilling: {
    summary: (params?: { venue_id?: string }) =>
      http.get<import("@/lib/types/courtly").BillingSummaryResponse>(
        "/api/superadmin/billing/summary",
        { params },
      ),
    generateMonthly: (body: {
      year?: number;
      month?: number;
      mode: "backfill" | "replace_unsettled";
    }) =>
      http.post<import("@/lib/types/courtly").GenerateBillingResult>(
        "/api/superadmin/billing/generate-monthly",
        body,
      ),
    getCycleDetail: (cycleId: string) =>
      http.get<import("@/lib/types/courtly").BillingCycleDetailResponse>(
        `/api/superadmin/billing/cycles/${cycleId}`,
      ),
    markPaid: (cycleId: string) =>
      http.post<{ ok: boolean }>(
        `/api/superadmin/billing/cycles/${cycleId}/mark-paid`,
        {},
      ),
    getProofUrl: (cycleId: string) =>
      http.get<{ url: string }>(
        `/api/superadmin/billing/cycles/${cycleId}/payment-proof-url`,
      ),
    rejectProof: (cycleId: string, note?: string) =>
      http.post<{ ok: boolean }>(
        `/api/superadmin/billing/cycles/${cycleId}/reject-proof`,
        { note: note ?? null },
      ),
    listPaymentMethods: () =>
      http.get<{ methods: import("@/lib/types/courtly").PlatformPaymentMethod[] }>(
        "/api/superadmin/billing/payment-methods",
      ),
    createPaymentMethod: (body: {
      method: "gcash" | "maya";
      account_name: string;
      account_number: string;
    }) =>
      http.post<{ method: import("@/lib/types/courtly").PlatformPaymentMethod }>(
        "/api/superadmin/billing/payment-methods",
        body,
      ),
    updatePaymentMethod: (
      id: string,
      body: { account_name?: string; account_number?: string; is_active?: boolean },
    ) =>
      http.patch<{ method: import("@/lib/types/courtly").PlatformPaymentMethod }>(
        `/api/superadmin/billing/payment-methods/${id}`,
        body,
      ),
    deletePaymentMethod: (id: string) =>
      http.delete<{ ok: boolean }>(`/api/superadmin/billing/payment-methods/${id}`),
  },

  adminBilling: {
    list: (params?: { status?: string }) =>
      http.get<import("@/lib/types/courtly").AdminBillingListResponse>(
        "/api/admin/billing",
        { params },
      ),
    getCycle: (cycleId: string) =>
      http.get<import("@/lib/types/courtly").BillingCycleDetailResponse>(
        `/api/admin/billing/${cycleId}`,
      ),
    getPaymentMethods: () =>
      http.get<{ methods: import("@/lib/types/courtly").PlatformPaymentMethod[] }>(
        "/api/admin/billing/payment-methods",
      ),
    submitProof: (
      cycleId: string,
      body: {
        payment_method: "gcash" | "maya";
        payment_proof_data_url: string;
        payment_proof_mime_type: "image/jpeg";
        payment_proof_bytes: number;
        payment_proof_width: number;
        payment_proof_height: number;
      },
    ) => http.post<{ ok: boolean }>(`/api/admin/billing/${cycleId}/submit-proof`, body),
    getProofUrl: (cycleId: string) =>
      http.get<{ url: string }>(`/api/admin/billing/${cycleId}/payment-proof-url`),
  },
};

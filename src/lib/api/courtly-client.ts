import { http } from "@/lib/http-client";
import type {
  AdminVenueWorkspaceResponse,
  Booking,
  BookingDetailContextResponse,
  BookingDetailGroupResponse,
  CourtBookingSurfaceResponse,
  CourtDayAvailability,
  CourtDetailContextResponse,
  Court,
  CourtClosure,
  CourtReview,
  DashboardOverviewResponse,
  ManagedUser,
  OpenPlaySession,
  RevenueSummaryResponse,
  SessionUser,
  SuperadminDirectoryResponse,
  Tournament,
  TournamentRegistration,
  Venue,
  VenueClosure,
  VenueDetailResponse,
} from "@/lib/types/courtly";

/** API accepts explicit null to clear nullable map columns on PATCH. */
export type VenueWritePayload = Omit<Partial<Venue>, "map_latitude" | "map_longitude"> & {
  map_latitude?: number | null;
  map_longitude?: number | null;
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
    list: (params?: { status?: string; limit?: number; sport?: string }) =>
      http.get<OpenPlaySession[]>("/api/open-play", { params }),
    update: (id: string, data: Partial<OpenPlaySession>) =>
      http.patch<OpenPlaySession>(`/api/open-play/${id}`, data),
  },

  registrations: {
    list: (params?: { player_email?: string }) =>
      http.get<TournamentRegistration[]>("/api/tournament-registrations", {
        params,
      }),
  },

  venues: {
    list: () => http.get<Venue[]>("/api/venues"),
    create: (data: VenueWritePayload) => http.post<Venue>("/api/venues", data),
    get: (id: string) =>
      http.get<VenueDetailResponse>(`/api/venues/${id}`),
    update: (id: string, data: VenueWritePayload) =>
      http.patch<Venue>(`/api/venues/${id}`, data),
    remove: (id: string) => http.delete(`/api/venues/${id}`),
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

  superadmin: {
    directory: () => http.get<SuperadminDirectoryResponse>("/api/superadmin/directory"),
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
    list: () =>
      http.get<{
        reviews: (CourtReview & { court_name: string })[];
      }>("/api/admin/flagged-reviews"),
  },

  notifications: {
    list: () => http.get<NotificationsListResponse>("/api/notifications"),
    markAllRead: () => http.patch<{ ok: boolean }>("/api/notifications"),
    markRead: (id: string) => http.patch<{ ok: boolean }>(`/api/notifications/${id}`),
  },

  dashboard: {
    overview: (params?: { sport?: string; date?: string }) =>
      http.get<DashboardOverviewResponse>("/api/dashboard/overview", { params }),
  },

  me: {
    bookingsOverview: (params?: { sport?: string }) =>
      http.get<{
        bookings: Booking[];
        registrations: TournamentRegistration[];
      }>("/api/me/bookings-overview", { params }),
  },
};

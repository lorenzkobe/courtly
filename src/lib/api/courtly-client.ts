import { http } from "@/lib/http-client";
import type {
  Booking,
  Court,
  CourtClosure,
  CourtReview,
  ManagedUser,
  OpenPlaySession,
  RevenueSummaryResponse,
  Tournament,
  TournamentRegistration,
  Venue,
  VenueClosure,
  VenueDetailResponse,
} from "@/lib/types/courtly";
import type { NotificationsListResponse } from "@/lib/notifications/types";

export const courtlyApi = {
  auth: {
    session: () =>
      http.get<{ user: import("@/lib/types/courtly").SessionUser | null }>(
        "/api/auth/session",
      ),
    login: (body: { role?: "user" | "admin" | "superadmin" }) =>
      http.post("/api/auth/login", body),
    logout: () => http.post("/api/auth/logout"),
  },

  courts: {
    list: (params?: {
      status?: string;
      manageable?: boolean;
      sport?: string;
    }) => http.get<Court[]>("/api/courts", { params }),
    get: (id: string) => http.get<Court>(`/api/courts/${id}`),
    create: (data: Partial<Court>) => http.post<Court>("/api/courts", data),
    update: (id: string, data: Partial<Court>) =>
      http.patch<Court>(`/api/courts/${id}`, data),
    remove: (id: string) => http.delete(`/api/courts/${id}`),
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
    create: (data: Partial<Booking>) =>
      http.post<Booking>("/api/bookings", data),
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
    create: (data: Partial<Venue>) => http.post<Venue>("/api/venues", data),
    get: (id: string) =>
      http.get<VenueDetailResponse>(`/api/venues/${id}`),
    update: (id: string, data: Partial<Venue>) =>
      http.patch<Venue>(`/api/venues/${id}`, data),
    remove: (id: string) => http.delete(`/api/venues/${id}`),
  },

  managedUsers: {
    list: () => http.get<ManagedUser[]>("/api/admin/managed-users"),
    create: (data: Partial<ManagedUser>) =>
      http.post<ManagedUser>("/api/admin/managed-users", data),
    update: (id: string, data: Partial<ManagedUser>) =>
      http.patch<ManagedUser>(`/api/admin/managed-users/${id}`, data),
    remove: (id: string) => http.delete(`/api/admin/managed-users/${id}`),
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
    markAllRead: () => http.patch("/api/notifications"),
    markRead: (id: string) => http.patch(`/api/notifications/${id}`),
  },
};

import { http } from "@/lib/http-client";
import type {
  Booking,
  Court,
  CourtAccount,
  CourtAccountDetailResponse,
  ManagedUser,
  OpenPlaySession,
  RevenueSummaryResponse,
  Tournament,
  TournamentRegistration,
} from "@/lib/types/courtly";

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

  courtAccounts: {
    list: () => http.get<CourtAccount[]>("/api/court-accounts"),
    create: (data: Partial<CourtAccount>) =>
      http.post<CourtAccount>("/api/court-accounts", data),
    get: (id: string) =>
      http.get<CourtAccountDetailResponse>(`/api/court-accounts/${id}`),
    update: (id: string, data: Partial<CourtAccount>) =>
      http.patch<CourtAccount>(`/api/court-accounts/${id}`, data),
    remove: (id: string) => http.delete(`/api/court-accounts/${id}`),
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
      court_account_id?: string | null;
    }) =>
      http.get<RevenueSummaryResponse>("/api/admin/revenue", {
        params: {
          ...(params?.from ? { from: params.from } : {}),
          ...(params?.to ? { to: params.to } : {}),
          ...(params?.court_account_id
            ? { court_account_id: params.court_account_id }
            : {}),
        },
      }),
  },
};

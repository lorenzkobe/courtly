import { http } from "@/lib/http-client";
import type {
  Booking,
  Court,
  OpenPlaySession,
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
    list: (params?: { status?: string; manageable?: boolean }) =>
      http.get<Court[]>("/api/courts", { params }),
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
    }) => http.get<Booking[]>("/api/bookings", { params }),
    create: (data: Partial<Booking>) =>
      http.post<Booking>("/api/bookings", data),
    update: (id: string, data: Partial<Booking>) =>
      http.patch<Booking>(`/api/bookings/${id}`, data),
  },

  tournaments: {
    list: (params?: { status?: string; limit?: number; sort?: string }) =>
      http.get<Tournament[]>("/api/tournaments", { params }),
    get: (id: string) => http.get<Tournament>(`/api/tournaments/${id}`),
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
    list: (params?: { status?: string; limit?: number }) =>
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
};

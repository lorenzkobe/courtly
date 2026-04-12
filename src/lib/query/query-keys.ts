type NullableString = string | null | undefined;

function normalized(value: NullableString) {
  return value ?? null;
}

export const queryKeys = {
  courts: {
    all: () => ["courts"] as const,
    list: (params?: {
      status?: string;
      manageable?: boolean;
      sport?: string;
    }) =>
      [
        "courts",
        "list",
        {
          status: normalized(params?.status),
          manageable: params?.manageable ?? false,
          sport: normalized(params?.sport),
        },
      ] as const,
    detail: (courtId: NullableString) =>
      ["courts", "detail", normalized(courtId)] as const,
  },
  bookings: {
    all: () => ["bookings"] as const,
    list: (params?: {
      court_id?: string;
      date?: string;
      player_email?: string;
      manageable?: boolean;
      sport?: string;
      booking_group_id?: string;
    }) =>
      [
        "bookings",
        "list",
        {
          court_id: normalized(params?.court_id),
          date: normalized(params?.date),
          player_email: normalized(params?.player_email),
          manageable: params?.manageable ?? false,
          sport: normalized(params?.sport),
          booking_group_id: normalized(params?.booking_group_id),
        },
      ] as const,
    my: (email: NullableString, sport?: NullableString) =>
      [
        "bookings",
        "my",
        { email: normalized(email), sport: normalized(sport) },
      ] as const,
  },
  tournaments: {
    all: () => ["tournaments"] as const,
    detail: (tournamentId: NullableString, sport?: NullableString) =>
      [
        "tournaments",
        "detail",
        { id: normalized(tournamentId), sport: normalized(sport) },
      ] as const,
  },
  openPlay: {
    all: () => ["open-play"] as const,
    list: (params?: {
      status?: string;
      limit?: number;
      sport?: string;
      booking_group_id?: string;
      hosted_by_me?: boolean;
    }) =>
      [
        "open-play",
        "list",
        {
          status: normalized(params?.status),
          limit: params?.limit ?? null,
          sport: normalized(params?.sport),
          booking_group_id: normalized(params?.booking_group_id),
          hosted_by_me: params?.hosted_by_me ?? null,
        },
      ] as const,
    detail: (sessionId: NullableString) =>
      ["open-play", "detail", normalized(sessionId)] as const,
  },
  registrations: {
    all: () => ["registrations"] as const,
  },
  notifications: {
    all: () => ["notifications"] as const,
  },
  me: {
    bookingsOverview: (
      email: NullableString,
      sport?: NullableString,
      limit?: number,
    ) =>
      [
        "me",
        "bookings-overview",
        { email: normalized(email), sport: normalized(sport), limit: limit ?? null },
      ] as const,
  },
  admin: {
    venueWorkspace: (venueId: NullableString) =>
      ["admin", "venue-workspace", normalized(venueId)] as const,
  },
  superadmin: {
    directoryPaged: (limit?: number) =>
      ["superadmin", "directory", "paged", { limit: limit ?? null }] as const,
  },
  bookingSurface: {
    courtDay: (courtId: NullableString, date: NullableString) =>
      [
        "booking-surface",
        "court-day",
        { courtId: normalized(courtId), date: normalized(date) },
      ] as const,
  },
  reviews: {
    venue: (venueId: NullableString) =>
      ["reviews", "venue", normalized(venueId)] as const,
    flagged: () => ["reviews", "flagged"] as const,
  },
};

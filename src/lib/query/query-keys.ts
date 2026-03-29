type NullableString = string | null | undefined;

function normalized(value: NullableString) {
  return value ?? null;
}

export const queryKeys = {
  auth: {
    session: () => ["auth", "session"] as const,
  },
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
    byVenue: (venueId: NullableString, sport?: NullableString) =>
      [
        "courts",
        "by-venue",
        { venueId: normalized(venueId), sport: normalized(sport) },
      ] as const,
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
    detail: (bookingId: NullableString) =>
      ["bookings", "detail", normalized(bookingId)] as const,
    my: (email: NullableString, sport?: NullableString) =>
      [
        "bookings",
        "my",
        { email: normalized(email), sport: normalized(sport) },
      ] as const,
    byGroup: (bookingGroupId: NullableString, email?: NullableString) =>
      [
        "bookings",
        "group",
        {
          booking_group_id: normalized(bookingGroupId),
          email: normalized(email),
        },
      ] as const,
    forCourt: (courtId: NullableString, date: NullableString) =>
      [
        "bookings",
        "court-day",
        { courtId: normalized(courtId), date: normalized(date) },
      ] as const,
  },
  tournaments: {
    all: () => ["tournaments"] as const,
    list: (params?: {
      status?: string;
      limit?: number;
      sort?: string;
      sport?: string;
    }) =>
      [
        "tournaments",
        "list",
        {
          status: normalized(params?.status),
          limit: params?.limit ?? null,
          sort: normalized(params?.sort),
          sport: normalized(params?.sport),
        },
      ] as const,
    detail: (tournamentId: NullableString, sport?: NullableString) =>
      [
        "tournaments",
        "detail",
        { id: normalized(tournamentId), sport: normalized(sport) },
      ] as const,
  },
  openPlay: {
    all: () => ["open-play"] as const,
    list: (params?: { status?: string; limit?: number; sport?: string }) =>
      [
        "open-play",
        "list",
        {
          status: normalized(params?.status),
          limit: params?.limit ?? null,
          sport: normalized(params?.sport),
        },
      ] as const,
  },
  registrations: {
    all: () => ["registrations"] as const,
    my: (email: NullableString) =>
      ["registrations", "my", { email: normalized(email) }] as const,
  },
  notifications: {
    all: () => ["notifications"] as const,
  },
  closures: {
    court: (courtId: NullableString, date?: NullableString) =>
      [
        "closures",
        "court",
        { courtId: normalized(courtId), date: normalized(date) },
      ] as const,
    venue: (venueId: NullableString, date?: NullableString) =>
      [
        "closures",
        "venue",
        { venueId: normalized(venueId), date: normalized(date) },
      ] as const,
  },
  availability: {
    courtDay: (courtId: NullableString, date: NullableString) =>
      [
        "availability",
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

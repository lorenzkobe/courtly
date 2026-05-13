export type GuestHoldState = {
  booking_id: string;
  booking_group_id: string;
  booking_number: string;
  hold_expires_at: string;
  total_due: number;
  payment_methods: Array<{
    method: "gcash" | "maya";
    account_name: string;
    account_number: string;
  }>;
  player_first_name: string;
  player_last_name: string;
  player_email: string;
  player_phone: string;
};

const STORAGE_KEY = "courtly_guest_hold";

export function saveGuestHold(state: GuestHoldState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore QuotaExceededError or private-browsing restrictions
  }
}

export function loadGuestHold(): GuestHoldState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GuestHoldState;
    if (new Date(parsed.hold_expires_at).getTime() <= Date.now()) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function clearGuestHold(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

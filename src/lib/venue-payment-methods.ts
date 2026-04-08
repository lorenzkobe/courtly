import type {
  Venue,
  VenuePaymentMethodDetails,
} from "@/lib/types/courtly";

export type VenuePaymentSettings = Pick<
  Venue,
  | "accepts_gcash"
  | "gcash_account_name"
  | "gcash_account_number"
  | "accepts_maya"
  | "maya_account_name"
  | "maya_account_number"
>;

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export function normalizeVenuePaymentSettings(
  input: Partial<VenuePaymentSettings>,
): VenuePaymentSettings {
  return {
    accepts_gcash: Boolean(input.accepts_gcash),
    gcash_account_name: clean(input.gcash_account_name),
    gcash_account_number: clean(input.gcash_account_number),
    accepts_maya: Boolean(input.accepts_maya),
    maya_account_name: clean(input.maya_account_name),
    maya_account_number: clean(input.maya_account_number),
  };
}

export function validateVenuePaymentSettings(
  input: Partial<VenuePaymentSettings>,
  opts: { requireAtLeastOne: boolean },
): { ok: true; value: VenuePaymentSettings } | { ok: false; error: string } {
  const value = normalizeVenuePaymentSettings(input);
  if (opts.requireAtLeastOne && !value.accepts_gcash && !value.accepts_maya) {
    return { ok: false, error: "Add at least one payment method (GCash or Maya)." };
  }
  if (value.accepts_gcash && (!value.gcash_account_name || !value.gcash_account_number)) {
    return {
      ok: false,
      error: "GCash account name and account number are required when GCash is enabled.",
    };
  }
  if (value.accepts_maya && (!value.maya_account_name || !value.maya_account_number)) {
    return {
      ok: false,
      error: "Maya account name and account number are required when Maya is enabled.",
    };
  }
  return { ok: true, value };
}

export function venuePaymentMethodsForCheckout(
  venue: Partial<VenuePaymentSettings>,
): VenuePaymentMethodDetails[] {
  const settings = normalizeVenuePaymentSettings(venue);
  const methods: VenuePaymentMethodDetails[] = [];
  if (settings.accepts_gcash && settings.gcash_account_name && settings.gcash_account_number) {
    methods.push({
      method: "gcash",
      account_name: settings.gcash_account_name,
      account_number: settings.gcash_account_number,
    });
  }
  if (settings.accepts_maya && settings.maya_account_name && settings.maya_account_number) {
    methods.push({
      method: "maya",
      account_name: settings.maya_account_name,
      account_number: settings.maya_account_number,
    });
  }
  return methods;
}

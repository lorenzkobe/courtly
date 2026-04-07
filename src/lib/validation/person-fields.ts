/** Shared validation for signup and superadmin-managed person records. */

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PERSON_NAME_PART_REGEX = /^[A-Za-z]+(?:[ '-][A-Za-z]+)*$/;
export const PH_MOBILE_REGEX = /^(?:\+63|0)9\d{9}$/;

export function isValidPersonName(value: string) {
  const trimmed = value.trim();
  if (!PERSON_NAME_PART_REGEX.test(trimmed)) return false;
  const letterCount = trimmed.replace(/[^A-Za-z]/g, "").length;
  return letterCount >= 2;
}

export function isValidBirthdateIso(value: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed <= new Date();
}

export function buildFullName(firstName: string, lastName: string) {
  return `${firstName.trim()} ${lastName.trim()}`.trim();
}

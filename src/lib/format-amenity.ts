/** Title case for amenity tokens (snake_case or free text). */
export function formatAmenityLabel(value: string): string {
  const cleaned = value.replace(/_/g, " ").trim();
  if (!cleaned) return "";
  return cleaned
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

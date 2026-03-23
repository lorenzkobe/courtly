export const COURTLY_DEFAULT_PALETTE = "emerald-charcoal" as const;

export const courtlyPalette = {
  id: COURTLY_DEFAULT_PALETTE,
  name: "Emerald + Charcoal",
  pageBackground: "bg-zinc-100",
  textPrimary: "text-zinc-900",
  textSecondary: "text-zinc-700",
  heroContainer:
    "rounded-3xl border border-emerald-300 bg-gradient-to-br from-zinc-100 via-zinc-50 to-emerald-50 shadow-sm",
  badge: "bg-zinc-900 text-emerald-200 ring-1 ring-zinc-700",
  primaryButton: "bg-emerald-600 text-white hover:bg-emerald-700",
  secondaryButton:
    "border border-zinc-400 bg-white text-zinc-800 hover:bg-zinc-100",
  statCard: "bg-white ring-1 ring-zinc-200 text-zinc-900",
  featureCard: "bg-white/90 ring-1 ring-zinc-200 text-zinc-800",
} as const;

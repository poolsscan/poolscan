import type { FactorStatus, SafetyTier } from "./types";

export const TIER_UI: Record<
  SafetyTier,
  { label: string; short: string; color: string; glow: string; wash: string }
> = {
  deep: {
    label: "Deep water",
    short: "DEEP",
    color: "var(--color-depth-deep)",
    glow: "color-mix(in srgb, var(--color-depth-deep) 28%, transparent)",
    wash: "color-mix(in srgb, var(--color-depth-deep) 12%, transparent)",
  },
  wading: {
    label: "Wading",
    short: "WADE",
    color: "var(--color-depth-wade)",
    glow: "color-mix(in srgb, var(--color-depth-wade) 28%, transparent)",
    wash: "color-mix(in srgb, var(--color-depth-wade) 12%, transparent)",
  },
  shallow: {
    label: "Shallow",
    short: "SHALLOW",
    color: "var(--color-depth-shallow)",
    glow: "color-mix(in srgb, var(--color-depth-shallow) 28%, transparent)",
    wash: "color-mix(in srgb, var(--color-depth-shallow) 12%, transparent)",
  },
  puddle: {
    label: "Puddle",
    short: "PUDDLE",
    color: "var(--color-depth-puddle)",
    glow: "color-mix(in srgb, var(--color-depth-puddle) 28%, transparent)",
    wash: "color-mix(in srgb, var(--color-depth-puddle) 12%, transparent)",
  },
};

export function factorColor(status: FactorStatus): string {
  return status === "good"
    ? "var(--color-depth-deep)"
    : status === "warn"
      ? "var(--color-depth-wade)"
      : "var(--color-depth-puddle)";
}

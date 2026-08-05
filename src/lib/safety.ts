import type {
  FactorStatus,
  SafetyFactor,
  SafetyReport,
  SafetyTier,
  TokenMetrics,
} from "./types";

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n));

/** Linear map value in [a,b] -> [0,1], clamped. Handles inverted ranges. */
function lin(value: number, a: number, b: number): number {
  if (a === b) return value >= a ? 1 : 0;
  return clamp((value - a) / (b - a));
}

const TIERS: Record<SafetyTier, { label: string; min: number }> = {
  deep: { label: "Deep water", min: 80 },
  wading: { label: "Wading", min: 55 },
  shallow: { label: "Shallow", min: 30 },
  puddle: { label: "Puddle", min: 0 },
};

export function tierFor(score: number): SafetyTier {
  if (score >= TIERS.deep.min) return "deep";
  if (score >= TIERS.wading.min) return "wading";
  if (score >= TIERS.shallow.min) return "shallow";
  return "puddle";
}

export function tierLabel(tier: SafetyTier): string {
  return TIERS[tier].label;
}

const SUMMARY: Record<SafetyTier, string> = {
  deep: "Solid footing. Liquidity is secured and ownership looks clean — the usual rug levers are off the table.",
  wading:
    "Wade in carefully. A couple of risk signals are raised; size your position for the ones that could bite.",
  shallow:
    "Shallow and choppy. Multiple red flags — concentrated supply or unsecured liquidity. Easy to get stuck.",
  puddle:
    "Barely wet. This has the shape of a classic rug — unsecured LP, live mint, or supply stacked in a few wallets.",
};

/**
 * Compute a 0..100 "depth" (safety) score from on-chain metrics.
 * Higher = deeper = safer. Every factor maps to a plain-language line
 * so the detail page can show exactly why a token scored the way it did.
 */
export function computeSafety(
  metrics: TokenMetrics,
  liquidityUsd: number | null,
): SafetyReport {
  const factors: SafetyFactor[] = [];

  const push = (
    key: string,
    label: string,
    detail: string,
    weight: number,
    frac: number,
    status: FactorStatus,
  ) => {
    factors.push({
      key,
      label,
      detail,
      weight,
      points: Math.round(weight * clamp(frac) * 10) / 10,
      status,
    });
  };

  /** A signal we can't read yet — reported plainly and left out of the score. */
  const unknown = (key: string, label: string, weight: number, detail = "Not measured yet") =>
    factors.push({ key, label, detail, weight, points: 0, status: "unknown" });

  // Liquidity secured — the single biggest rug lever (weight 28)
  if (metrics.lpStatus === "burned") {
    push("lp", "Liquidity", "LP burned — can't be pulled", 28, 1, "good");
  } else if (metrics.lpStatus === "locked") {
    const days = metrics.lpUnlockDays ?? 0;
    const frac = 0.4 + 0.6 * lin(days, 7, 180);
    const status: FactorStatus = days >= 30 ? "good" : "warn";
    push("lp", "Liquidity", `LP locked ${days}d`, 28, frac, status);
  } else if (metrics.lpStatus === "unlocked") {
    push("lp", "Liquidity", "LP unlocked — can be pulled anytime", 28, 0, "bad");
  } else {
    unknown("lp", "Liquidity", 28, "LP status not read yet");
  }

  // Owner permissions renounced (weight 14)
  if (metrics.contractRenounced === null) {
    unknown("renounce", "Ownership", 14, "Owner powers not read yet");
  } else {
    push(
      "renounce",
      "Ownership",
      metrics.contractRenounced ? "Ownerless — no owner powers in the contract" : "Owner keys still active",
      14,
      metrics.contractRenounced ? 1 : 0,
      metrics.contractRenounced ? "good" : "bad",
    );
  }

  // Supply mintable (weight 8)
  if (metrics.mintable === null) {
    unknown("mint", "Supply", 8, "Mint capability not read yet");
  } else {
    push(
      "mint",
      "Supply",
      metrics.mintable ? "Mint function is live" : "Fixed supply — no mint function",
      8,
      metrics.mintable ? 0 : 1,
      metrics.mintable ? "bad" : "good",
    );
  }

  // Dev holdings (weight 18): 3% ideal, 20%+ is zero
  if (metrics.devHoldingPct === null) {
    unknown("dev", "Dev wallet", 18);
  } else {
    const dev = metrics.devHoldingPct;
    const frac = 1 - lin(dev, 3, 20);
    const status: FactorStatus = dev < 5 ? "good" : dev < 12 ? "warn" : "bad";
    push("dev", "Dev wallet", `Deployer holds ${dev.toFixed(1)}%`, 18, frac, status);
  }

  // Top-10 concentration (weight 14): 25% good, 70%+ zero
  if (metrics.top10Pct === null) {
    unknown("top10", "Distribution", 14);
  } else {
    const top = metrics.top10Pct;
    const frac = 1 - lin(top, 25, 70);
    const status: FactorStatus = top < 40 ? "good" : top < 60 ? "warn" : "bad";
    push("top10", "Distribution", `Top 10 hold ${top.toFixed(0)}%`, 14, frac, status);
  }

  // Sniper load in launch block (weight 12): 5% good, 40%+ zero
  if (metrics.sniperPct === null) {
    unknown("snipe", "Snipers", 12, "Launch-block buys not analysed yet");
  } else {
    const snipe = metrics.sniperPct;
    const frac = 1 - lin(snipe, 5, 40);
    const status: FactorStatus = snipe < 10 ? "good" : snipe < 25 ? "warn" : "bad";
    push("snipe", "Snipers", `${snipe.toFixed(0)}% taken at launch`, 12, frac, status);
  }

  // Liquidity depth (weight 6): $8k thin, $50k+ deep
  if (liquidityUsd === null || liquidityUsd <= 0) {
    unknown("depth", "Pool depth", 6, "No indexed pool yet");
  } else {
    const frac = lin(liquidityUsd, 8_000, 50_000);
    const status: FactorStatus =
      liquidityUsd >= 25_000 ? "good" : liquidityUsd >= 8_000 ? "warn" : "bad";
    push("depth", "Pool depth", `$${Math.round(liquidityUsd / 1000)}K in the pool`, 6, frac, status);
  }

  // Score over what we could actually measure, so an unmeasured signal never
  // silently reads as a failing one. Coverage tells the reader how much is known.
  const measuredWeight = factors
    .filter((f) => f.status !== "unknown")
    .reduce((s, f) => s + f.weight, 0);
  const totalWeight = factors.reduce((s, f) => s + f.weight, 0);
  const earned = factors.reduce((s, f) => s + f.points, 0);
  const score = measuredWeight > 0 ? Math.round((earned / measuredWeight) * 100) : 0;
  const coverage = totalWeight > 0 ? measuredWeight / totalWeight : 0;
  const tier = tierFor(score);

  return { score, tier, factors, summary: SUMMARY[tier], coverage };
}

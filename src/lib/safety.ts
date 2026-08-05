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
  liquidityUsd: number,
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

  // Liquidity secured — the single biggest rug lever (weight 28)
  if (metrics.lpBurned) {
    push("lp", "Liquidity", "LP burned — can't be pulled", 28, 1, "good");
  } else if (metrics.lpLocked) {
    const days = metrics.lpUnlockDays ?? 0;
    const frac = 0.4 + 0.6 * lin(days, 7, 180);
    const status: FactorStatus = days >= 30 ? "good" : "warn";
    push("lp", "Liquidity", `LP locked ${days}d`, 28, frac, status);
  } else {
    push("lp", "Liquidity", "LP unlocked — can be pulled anytime", 28, 0, "bad");
  }

  // Owner permissions renounced (weight 14)
  push(
    "renounce",
    "Ownership",
    metrics.contractRenounced ? "Renounced — no owner powers" : "Owner keys still active",
    14,
    metrics.contractRenounced ? 1 : 0,
    metrics.contractRenounced ? "good" : "bad",
  );

  // Supply mintable (weight 8)
  push(
    "mint",
    "Supply",
    metrics.mintable ? "Mint function is live" : "Fixed supply — no mint",
    8,
    metrics.mintable ? 0 : 1,
    metrics.mintable ? "bad" : "good",
  );

  // Dev holdings (weight 18): 3% ideal, 20%+ is zero
  {
    const frac = 1 - lin(metrics.devHoldingPct, 3, 20);
    const status: FactorStatus =
      metrics.devHoldingPct < 5 ? "good" : metrics.devHoldingPct < 12 ? "warn" : "bad";
    push("dev", "Dev wallet", `Deployer holds ${metrics.devHoldingPct.toFixed(1)}%`, 18, frac, status);
  }

  // Top-10 concentration (weight 14): 25% good, 70%+ zero
  {
    const frac = 1 - lin(metrics.top10Pct, 25, 70);
    const status: FactorStatus =
      metrics.top10Pct < 40 ? "good" : metrics.top10Pct < 60 ? "warn" : "bad";
    push("top10", "Distribution", `Top 10 hold ${metrics.top10Pct.toFixed(0)}%`, 14, frac, status);
  }

  // Sniper load in launch block (weight 12): 5% good, 40%+ zero
  {
    const frac = 1 - lin(metrics.sniperPct, 5, 40);
    const status: FactorStatus =
      metrics.sniperPct < 10 ? "good" : metrics.sniperPct < 25 ? "warn" : "bad";
    push("snipe", "Snipers", `${metrics.sniperPct.toFixed(0)}% taken at launch`, 12, frac, status);
  }

  // Liquidity depth (weight 6): $8k thin, $50k+ deep
  {
    const frac = lin(liquidityUsd, 8_000, 50_000);
    const status: FactorStatus =
      liquidityUsd >= 25_000 ? "good" : liquidityUsd >= 8_000 ? "warn" : "bad";
    push("depth", "Pool depth", `$${Math.round(liquidityUsd / 1000)}K in the pool`, 6, frac, status);
  }

  const score = Math.round(factors.reduce((s, f) => s + f.points, 0));
  const tier = tierFor(score);

  return { score, tier, factors, summary: SUMMARY[tier] };
}

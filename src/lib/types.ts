export type SafetyTier = "deep" | "wading" | "shallow" | "puddle";

export type FactorStatus = "good" | "warn" | "bad";

export interface SafetyFactor {
  key: string;
  label: string;
  /** Human-readable value, e.g. "Locked 180d" or "Dev holds 4.2%". */
  detail: string;
  status: FactorStatus;
  /** Max points this factor can contribute to the score. */
  weight: number;
  /** Points actually earned, 0..weight. */
  points: number;
}

export interface SafetyReport {
  /** 0..100 — higher is deeper / safer. */
  score: number;
  tier: SafetyTier;
  factors: SafetyFactor[];
  summary: string;
}

export interface TokenMetrics {
  lpLocked: boolean;
  lpBurned: boolean;
  /** Days until LP unlock, null if burned or unlocked. */
  lpUnlockDays: number | null;
  /** % of supply held by the deployer wallet. */
  devHoldingPct: number;
  /** % of supply held by the top 10 wallets. */
  top10Pct: number;
  /** % of supply captured by snipers in the launch block. */
  sniperPct: number;
  /** Owner permissions renounced (no upgrade/pause powers). */
  contractRenounced: boolean;
  /** Supply can still be minted. */
  mintable: boolean;
}

export interface Token {
  /** Contract address — also the route id. */
  id: string;
  name: string;
  symbol: string;
  /** 0..360 hue used for the avatar gradient. */
  hue: number;
  /** Seconds since launch. */
  ageSeconds: number;
  priceUsd: number;
  /** % change since launch. */
  changePct: number;
  volumeUsd: number;
  liquidityUsd: number;
  marketCapUsd: number;
  holders: number;
  /** Bonding-curve progress toward a full Uniswap v4 pool, 0..100. */
  graduationPct: number;
  metrics: TokenMetrics;
  safety: SafetyReport;
}

export interface MarketStats {
  launchedToday: number;
  totalVolumeUsd: number;
  graduated: number;
  ruggedToday: number;
  avgSafety: number;
}

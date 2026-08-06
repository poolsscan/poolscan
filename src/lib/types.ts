export type SafetyTier = "deep" | "wading" | "shallow" | "puddle";

/** `unknown` = we can't measure this signal yet, so it's excluded from the score. */
export type FactorStatus = "good" | "warn" | "bad" | "unknown";

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
  /** 0..100 — higher is deeper / safer. Scored over the signals we could measure. */
  score: number;
  tier: SafetyTier;
  factors: SafetyFactor[];
  summary: string;
  /** Share of total weight actually measured, 0..1. Below 1 means some signals are unknown. */
  coverage: number;
}

/**
 * On-chain signals behind the depth score. `null` means "not measured yet" —
 * never guess a value: unmeasured signals are reported as unknown and left out
 * of the score rather than silently invented.
 */
export interface TokenMetrics {
  /**
   * What can happen to the launch liquidity position.
   * `locked`   = held by the launchpad's splitter, which has no way to release it
   * `contract` = held by some other contract — safer than a wallet, terms unknown
   * `wallet`   = held by an externally-owned account that can pull it at will
   * `pulled`   = liquidity has already been reduced since launch
   */
  lpStatus: "burned" | "locked" | "unlocked" | "contract" | "wallet" | "pulled" | "unknown";
  /** Share of the launch position still in place, when it has been reduced. */
  lpRemainingPct?: number | null;
  /** Days until LP unlock, when locked. */
  lpUnlockDays: number | null;
  /** % of supply held by the deployer wallet. */
  devHoldingPct: number | null;
  /** % of supply held by the top 10 wallets. */
  top10Pct: number | null;
  /** % of supply captured by snipers in the launch block. */
  sniperPct: number | null;
  /** Owner permissions renounced (no upgrade/pause powers). */
  contractRenounced: boolean | null;
  /** Supply can still be minted. */
  mintable: boolean | null;
}

export interface Token {
  /** Contract address — also the route id. */
  id: string;
  name: string;
  symbol: string;
  /** 0..360 hue used for the avatar gradient (fallback when there's no logo). */
  hue: number;
  /** Token logo, when the indexer has one. */
  logoUrl?: string;
  /** Why this token is on the board: "new" | "volume" | "mcap" | "trending". */
  tags?: string[];
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

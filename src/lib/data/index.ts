/**
 * Data adapter — the single swap point between live chain data and mock data.
 *
 * Default is LIVE: real pools.trade tokens read from the factory + Blockscout on
 * Robinhood Chain (see ./onchain). If the chain is unreachable or returns
 * nothing, we fall back to the deterministic mock feed so the app never breaks.
 * Force one mode with NEXT_PUBLIC_DATA_SOURCE = "live" | "mock".
 */
import type { MarketStats, Token } from "../types";
import { mockStats, mockToken, mockTokens } from "./mock";
import { getStatsOnchain, getTokenOnchain, getTokensOnchain } from "./onchain";

export type DataSource = "live" | "mock";

export const DATA_SOURCE: DataSource =
  (process.env.NEXT_PUBLIC_DATA_SOURCE as DataSource) || "live";

export async function getTokens(): Promise<Token[]> {
  if (DATA_SOURCE === "mock") return mockTokens();
  try {
    const tokens = await getTokensOnchain();
    if (tokens.length) return tokens;
  } catch (e) {
    console.error("[data] on-chain getTokens failed, using mock:", e);
  }
  return mockTokens();
}

export async function getToken(id: string): Promise<Token | null> {
  if (DATA_SOURCE !== "mock") {
    try {
      const t = await getTokenOnchain(id);
      if (t) return t;
    } catch (e) {
      console.error("[data] on-chain getToken failed, using mock:", e);
    }
  }
  return mockToken(id) ?? null;
}

export async function getStats(): Promise<MarketStats> {
  if (DATA_SOURCE === "mock") return mockStats();
  try {
    const s = await getStatsOnchain();
    if (s.launchedToday > 0) return s;
  } catch (e) {
    console.error("[data] on-chain getStats failed, using mock:", e);
  }
  return mockStats();
}

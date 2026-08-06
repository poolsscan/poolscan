/**
 * Data adapter — the single swap point between live chain data and mock data.
 *
 * Live chain data is the only thing production ever serves. The mock feed exists
 * for local development; substituting it on the real site would put invented
 * tokens in front of people who came here to check whether a token is real, so
 * a failure surfaces as an empty board instead. Force a mode with
 * NEXT_PUBLIC_DATA_SOURCE = "live" | "mock".
 */
import type { MarketStats, Token } from "../types";
import { mockStats, mockToken, mockTokens } from "./mock";
import { getStatsOnchain, getTokenOnchain, getTokensOnchain } from "./onchain";

export type DataSource = "live" | "mock";

export const DATA_SOURCE: DataSource =
  (process.env.NEXT_PUBLIC_DATA_SOURCE as DataSource) || "live";

/** Mock is a development aid only — never a stand-in for real chain data. */
const MOCK_FALLBACK_ALLOWED =
  DATA_SOURCE === "mock" || process.env.NODE_ENV !== "production";

export async function getTokens(): Promise<Token[]> {
  if (DATA_SOURCE === "mock") return mockTokens();
  try {
    return await getTokensOnchain();
  } catch (e) {
    console.error("[data] on-chain getTokens failed:", e);
    return MOCK_FALLBACK_ALLOWED ? mockTokens() : [];
  }
}

export async function getToken(id: string): Promise<Token | null> {
  if (DATA_SOURCE !== "mock") {
    try {
      const t = await getTokenOnchain(id);
      if (t) return t;
    } catch (e) {
      console.error("[data] on-chain getToken failed:", e);
    }
    if (!MOCK_FALLBACK_ALLOWED) return null;
  }
  return mockToken(id) ?? null;
}

export async function getStats(): Promise<MarketStats> {
  if (DATA_SOURCE === "mock") return mockStats();
  try {
    return await getStatsOnchain();
  } catch (e) {
    console.error("[data] on-chain getStats failed:", e);
    if (MOCK_FALLBACK_ALLOWED) return mockStats();
    return { launchedToday: 0, totalVolumeUsd: 0, graduated: 0, ruggedToday: 0, avgSafety: 0 };
  }
}

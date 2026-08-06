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
import { getStatsSnapshot, getTokenSnapshot, getTokensSnapshot } from "./snapshot";

export type DataSource = "live" | "mock";

export const DATA_SOURCE: DataSource =
  (process.env.NEXT_PUBLIC_DATA_SOURCE as DataSource) || "live";

/** Mock is a development aid only — never a stand-in for real chain data. */
const MOCK_FALLBACK_ALLOWED =
  DATA_SOURCE === "mock" || process.env.NODE_ENV !== "production";

/**
 * The published snapshot is the primary source: it covers the whole launch
 * history and costs one small fetch. Reading the chain directly is the fallback
 * for when it is missing or still warming up.
 */
export async function getTokens(): Promise<Token[]> {
  if (DATA_SOURCE === "mock") return mockTokens();
  try {
    const snap = await getTokensSnapshot();
    if (snap?.length) return snap;
  } catch (e) {
    console.error("[data] snapshot getTokens failed:", e);
  }
  try {
    return await getTokensOnchain();
  } catch (e) {
    console.error("[data] on-chain getTokens failed:", e);
    return MOCK_FALLBACK_ALLOWED ? mockTokens() : [];
  }
}

export async function getToken(id: string): Promise<Token | null> {
  if (DATA_SOURCE !== "mock") {
    // Read this one live: a detail page is a single token, so it's cheap, and
    // fresher than the snapshot's last run.
    const [live, snap] = await Promise.all([
      getTokenOnchain(id).catch((e) => {
        console.error("[data] on-chain getToken failed:", e);
        return null;
      }),
      getTokenSnapshot(id).catch(() => null),
    ]);
    // Prefer the live read, but let the snapshot fill anything it couldn't
    // establish — a creation block that didn't resolve shouldn't show as "0s old".
    if (live) {
      return snap
        ? {
            ...live,
            ageSeconds: live.ageSeconds > 0 ? live.ageSeconds : snap.ageSeconds,
            logoUrl: live.logoUrl ?? snap.logoUrl,
            tags: live.tags ?? snap.tags,
            holders: live.holders || snap.holders,
          }
        : live;
    }
    if (snap) return snap;
    if (!MOCK_FALLBACK_ALLOWED) return null;
  }
  return mockToken(id) ?? null;
}

export async function getStats(): Promise<MarketStats> {
  if (DATA_SOURCE === "mock") return mockStats();
  try {
    const snap = await getStatsSnapshot();
    if (snap) return snap;
  } catch (e) {
    console.error("[data] snapshot getStats failed:", e);
  }
  try {
    return await getStatsOnchain();
  } catch (e) {
    console.error("[data] on-chain getStats failed:", e);
    if (MOCK_FALLBACK_ALLOWED) return mockStats();
    return { launchedToday: 0, totalVolumeUsd: 0, graduated: 0, ruggedToday: 0, avgSafety: 0 };
  }
}

/**
 * Data adapter — the single swap point between mock data and live chain data.
 *
 * Today this is backed by the deterministic mock feed. When pools.trade is live
 * on Robinhood Chain, replace the three bodies below with reads from an indexer
 * / subgraph / RPC (see `DATA_SOURCE`). Nothing else in the app needs to change:
 * every page imports from `@/lib/data`, never from `./mock`.
 */
import type { MarketStats, Token } from "../types";
import { mockStats, mockToken, mockTokens } from "./mock";

export type DataSource = "mock" | "live";

export const DATA_SOURCE: DataSource =
  (process.env.NEXT_PUBLIC_DATA_SOURCE as DataSource) || "mock";

export async function getTokens(): Promise<Token[]> {
  // TODO(live): query the pools.trade indexer for recent launches.
  return mockTokens();
}

export async function getToken(id: string): Promise<Token | null> {
  // TODO(live): fetch a single token + holder/LP state by address.
  return mockToken(id) ?? null;
}

export async function getStats(): Promise<MarketStats> {
  // TODO(live): aggregate 24h launch/volume/graduation stats.
  return mockStats();
}

/**
 * Snapshot reader.
 *
 * A background job (scripts/snapshot.mjs, run on a schedule) crawls the factory
 * and publishes the result as JSON. Reading that here turns a board render into
 * a single small fetch, and lets the feed cover the whole launch history rather
 * than whatever window a request can afford to scan.
 *
 * Raw on-chain facts come from the snapshot; the depth score is computed here,
 * so scoring lives in exactly one place.
 */
import type { MarketStats, Token, TokenMetrics } from "../types";
import { computeSafety } from "../safety";

const SNAPSHOT_URL =
  process.env.SNAPSHOT_URL ||
  "https://raw.githubusercontent.com/poolsscan/poolscan/snapshot/tokens.json";

interface SnapshotToken {
  id: string;
  name: string;
  symbol: string;
  block: number;
  ageSeconds: number;
  holders: number;
  logoUrl?: string;
  priceUsd: number;
  changePct: number;
  volumeUsd: number;
  liquidityUsd: number;
  marketCapUsd: number;
  metrics: TokenMetrics;
}

interface Snapshot {
  updatedAt: string;
  scannedTo: number;
  blockTime: number;
  totalLaunches: number;
  volume24hUsd: number;
  tokens: SnapshotToken[];
}

function hueFrom(addr: string): number {
  return parseInt(addr.slice(2, 8), 16) % 360;
}

function toToken(t: SnapshotToken, ageOffsetSeconds: number): Token {
  return {
    id: t.id,
    name: t.name,
    symbol: t.symbol,
    hue: hueFrom(t.id),
    logoUrl: t.logoUrl,
    // The snapshot's ages were true when it was written; carry them forward.
    ageSeconds: Math.max(1, Math.round(t.ageSeconds + ageOffsetSeconds)),
    priceUsd: t.priceUsd,
    changePct: t.changePct,
    volumeUsd: t.volumeUsd,
    liquidityUsd: t.liquidityUsd,
    marketCapUsd: t.marketCapUsd,
    holders: t.holders,
    graduationPct: 0,
    metrics: t.metrics,
    safety: computeSafety(t.metrics, t.liquidityUsd > 0 ? t.liquidityUsd : null),
  };
}

async function load(): Promise<Snapshot | null> {
  try {
    const res = await fetch(SNAPSHOT_URL, {
      headers: { "User-Agent": "PoolScan/1.0" },
      next: { revalidate: 60 },
    });
    if (!res.ok) return null;
    const snap = (await res.json()) as Snapshot;
    return Array.isArray(snap?.tokens) && snap.tokens.length ? snap : null;
  } catch {
    return null;
  }
}

function ageOffset(snap: Snapshot): number {
  const written = Date.parse(snap.updatedAt);
  if (!written) return 0;
  return Math.max(0, (Date.now() - written) / 1000);
}

export async function getTokensSnapshot(): Promise<Token[] | null> {
  const snap = await load();
  if (!snap) return null;
  const offset = ageOffset(snap);
  return snap.tokens
    .map((t) => toToken(t, offset))
    .sort((a, b) => a.ageSeconds - b.ageSeconds);
}

export async function getTokenSnapshot(id: string): Promise<Token | null> {
  const snap = await load();
  if (!snap) return null;
  const hit = snap.tokens.find((t) => t.id.toLowerCase() === id.toLowerCase());
  return hit ? toToken(hit, ageOffset(snap)) : null;
}

export async function getStatsSnapshot(): Promise<MarketStats | null> {
  const snap = await load();
  if (!snap) return null;
  const tokens = snap.tokens.map((t) => toToken(t, 0));
  const avgSafety = tokens.length
    ? Math.round(tokens.reduce((s, t) => s + t.safety.score, 0) / tokens.length)
    : 0;
  return {
    launchedToday: snap.totalLaunches,
    totalVolumeUsd: snap.volume24hUsd,
    graduated: 0,
    ruggedToday: tokens.filter((t) => t.safety.tier === "puddle").length,
    avgSafety,
  };
}

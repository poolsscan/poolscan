import { computeSafety } from "../safety";
import type { MarketStats, Token, TokenMetrics } from "../types";

/** Deterministic PRNG so server and client render identical data (no hydration drift). */
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PREFIX = [
  "Abyssal", "Riptide", "Undertow", "Kraken", "Tidal", "Deep", "Salt", "Coral",
  "Mariana", "Current", "Drift", "Brine", "Nautilus", "Leviathan", "Reef",
  "Sonar", "Fathom", "Squid", "Anchor", "Pelagic", "Trench", "Wavelength",
];
const SUFFIX = [
  "Pump", "Cult", "DAO", "Inu", "Chad", "Fi", "Wif", "Moon", "Bot", "Labs",
  "Protocol", "Cabal", "Gang", "AI", "Swap", "Meta", "Prime", "Society",
];
const TICKERS = [
  "ABYS", "RIPT", "UNDR", "KRKN", "TIDL", "DEEP", "SALT", "CORL", "MRNA",
  "CURR", "DRFT", "BRNE", "NTLS", "LEVI", "REEF", "SNAR", "FTHM", "SQID",
  "ANKR", "PLGC", "TRNC", "WAVE", "CHUM", "GILL", "FINZ", "SHLL", "MAWS",
];

function hexAddr(rng: () => number): string {
  let s = "0x";
  const chars = "0123456789abcdef";
  for (let i = 0; i < 40; i++) s += chars[Math.floor(rng() * 16)];
  return s;
}

function makeMetrics(rng: () => number, rugged: boolean): TokenMetrics {
  if (rugged) {
    return {
      lpStatus: "unlocked",
      lpUnlockDays: null,
      devHoldingPct: 12 + rng() * 25,
      top10Pct: 55 + rng() * 35,
      sniperPct: 25 + rng() * 45,
      contractRenounced: rng() > 0.7,
      mintable: rng() > 0.35,
    };
  }
  const burned = rng() > 0.55;
  const locked = !burned && rng() > 0.25;
  return {
    lpStatus: burned ? "burned" : locked ? "locked" : "unlocked",
    lpUnlockDays: locked ? Math.round(7 + rng() * 350) : null,
    devHoldingPct: rng() * 9,
    top10Pct: 20 + rng() * 40,
    sniperPct: rng() * 22,
    contractRenounced: rng() > 0.25,
    mintable: rng() > 0.8,
  };
}

/** Build a token from a seeded RNG. `ageSeconds` is passed in so freshness is controllable. */
function makeToken(rng: () => number, index: number, ageSeconds: number): Token {
  const rugged = rng() > 0.72;
  const metrics = makeMetrics(rng, rugged);

  const liquidityUsd = rugged
    ? 1_500 + rng() * 9_000
    : 6_000 + rng() * 90_000;

  const graduationPct = rugged
    ? rng() * 30
    : Math.min(100, 8 + rng() * 100);

  const marketCapUsd = liquidityUsd * (2.2 + rng() * 6);
  const volumeUsd = marketCapUsd * (0.3 + rng() * 3.5);
  const changePct = rugged ? -30 - rng() * 60 : -20 + rng() * 240;

  const name =
    PREFIX[Math.floor(rng() * PREFIX.length)] +
    " " +
    SUFFIX[Math.floor(rng() * SUFFIX.length)];
  const symbol = TICKERS[index % TICKERS.length];

  const safety = computeSafety(metrics, liquidityUsd);

  return {
    id: hexAddr(rng),
    name,
    symbol,
    hue: Math.floor(rng() * 360),
    ageSeconds,
    priceUsd: 0.0000004 + rng() * 0.02,
    changePct,
    volumeUsd,
    liquidityUsd,
    marketCapUsd,
    holders: Math.round(8 + rng() * (rugged ? 120 : 1800)),
    graduationPct,
    metrics,
    safety,
  };
}

// Build a fixed, deterministic pool once at module load. The first INITIAL
// tokens are the visible feed; the rest are a "reserve" the live simulation
// surfaces over time — every one exists in the lookup, so every row's detail
// page resolves (no 404s from ephemeral client-only tokens).
const SEED = 0xc0ffee;
const INITIAL = 30;
const COUNT = 60;

const _all: Token[] = (() => {
  const rng = mulberry32(SEED);
  const list: Token[] = [];
  for (let i = 0; i < COUNT; i++) {
    // youngest first: ages fan out from ~5s to ~6h
    const ageSeconds = Math.round(5 + Math.pow((i % INITIAL) / INITIAL, 1.8) * 21_600);
    list.push(makeToken(rng, i, ageSeconds));
  }
  return list;
})();

const _feed = _all.slice(0, INITIAL);

export function mockTokens(): Token[] {
  return _feed;
}

export function mockToken(id: string): Token | undefined {
  return _all.find((t) => t.id === id);
}

export function mockStats(): MarketStats {
  const rugged = _feed.filter((t) => t.safety.tier === "puddle").length;
  const graduated = _feed.filter((t) => t.graduationPct >= 100).length;
  const totalVolumeUsd = _feed.reduce((s, t) => s + t.volumeUsd, 0);
  const avgSafety = Math.round(
    _feed.reduce((s, t) => s + t.safety.score, 0) / _feed.length,
  );
  return {
    launchedToday: 218 + _feed.length,
    totalVolumeUsd: totalVolumeUsd * 47,
    graduated: graduated + 11,
    ruggedToday: rugged + 6,
    avgSafety,
  };
}

/**
 * Next reserve token for the client-side "live" simulation, surfaced with a
 * fresh age. Returns null once the reserve is exhausted. Each id is real, so
 * the token's detail page resolves.
 */
export function reserveToken(i: number): Token | null {
  const t = _all[INITIAL + i];
  if (!t) return null;
  return { ...t, ageSeconds: 2 + (i % 7) };
}

/**
 * Real on-chain data source for pools.trade on Robinhood Chain.
 *
 * Enumerates tokens straight from the pools.trade factory (UERC20Factory) and
 * reads live metadata + holder distribution from the Blockscout indexer, so the
 * feed shows ONLY genuine pools.trade tokens — nothing from other launchpads.
 *
 * What's real today: token identity, supply, holder count, holder distribution
 * (top-10 / dev), age, ownership. Rolling out next: live price & liquidity from
 * the Uniswap-v4 pool, and first-block sniper detection.
 */
import type { MarketStats, Token, TokenMetrics } from "../types";
import { computeSafety } from "../safety";

const RPC = process.env.RH_RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
const BS = process.env.RH_BLOCKSCOUT || "https://robinhoodchain.blockscout.com";
const FACTORY = (
  process.env.POOLSTRADE_FACTORY || "0x000000e200088d55c39a11f609e5f667729ad49b"
).toLowerCase();

// Both endpoints reject the default fetch/urllib UA — a browser UA is required.
const UA = "Mozilla/5.0 (compatible; PoolScan/1.0)";
/** How many factory log pages to crawl (50 launches per page). */
const LOG_PAGES = 8;
/** How many tokens end up on the board after ranking. */
const FEED_LIMIT = 30;
/** Of those, how many slots go to the freshest launches (rest go to top traded). */
const FRESH_SLOTS = 12;

async function bs(path: string, revalidate = 30): Promise<any> {
  const res = await fetch(`${BS}${path}`, {
    headers: { "User-Agent": UA },
    next: { revalidate },
  });
  if (!res.ok) throw new Error(`blockscout ${res.status} ${path}`);
  return res.json();
}

async function rpc(method: string, params: unknown[], revalidate = 15): Promise<any> {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "User-Agent": UA, "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    next: { revalidate },
  });
  const j = await res.json();
  return j.result;
}

/** Every pools.trade token, read from the factory's TokenCreated logs (newest first). */
async function listTokens(limit: number): Promise<{ address: string; block: number }[]> {
  const items: any[] = [];
  let next: Record<string, any> | null = null;
  for (let page = 0; page < LOG_PAGES; page++) {
    const qs = next
      ? "?" + new URLSearchParams(Object.entries(next).map(([k, v]) => [k, String(v)])).toString()
      : "";
    const data: any = await bs(`/api/v2/addresses/${FACTORY}/logs${qs}`);
    items.push(...(data.items || []));
    next = data.next_page_params || null;
    if (!next) break;
  }
  const out: { address: string; block: number }[] = [];
  for (const it of items) {
    let addr: string | undefined;
    const params = it.decoded?.parameters as { name: string; value: any }[] | undefined;
    if (params?.length) {
      addr = (params.find((p) => p.name === "tokenAddress")?.value ?? params[0]?.value) as string;
    } else if (typeof it.data === "string" && it.data.length >= 66) {
      addr = "0x" + it.data.slice(26, 66);
    }
    if (addr && /^0x[0-9a-fA-F]{40}$/.test(addr)) {
      out.push({ address: addr.toLowerCase(), block: Number(it.block_number) || 0 });
    }
    if (out.length >= limit) break;
  }
  return out;
}

/** Derive block time + head so we can turn creation blocks into an age. */
async function chainClock(): Promise<{ latest: number; blockTime: number }> {
  try {
    const latestHex = await rpc("eth_blockNumber", []);
    const latest = parseInt(latestHex, 16);
    const olderNum = Math.max(1, latest - 5000);
    const [head, older] = await Promise.all([
      rpc("eth_getBlockByNumber", [latestHex, false]),
      rpc("eth_getBlockByNumber", ["0x" + olderNum.toString(16), false]),
    ]);
    const t0 = parseInt(head.timestamp, 16);
    const t1 = parseInt(older.timestamp, 16);
    const span = latest - olderNum;
    const blockTime = span > 0 ? Math.max(0.2, (t0 - t1) / span) : 2;
    return { latest, blockTime };
  } catch {
    return { latest: 0, blockTime: 2 };
  }
}

async function creatorsOf(
  addrs: string[],
): Promise<Record<string, { creator: string; block: number }>> {
  const map: Record<string, { creator: string; block: number }> = {};
  // Blockscout caps how many addresses one call accepts — request in chunks.
  const CHUNK = 10;
  const chunks: string[][] = [];
  for (let i = 0; i < addrs.length; i += CHUNK) chunks.push(addrs.slice(i, i + CHUNK));
  await Promise.all(
    chunks.map(async (group) => {
      try {
        const d = await bs(
          `/api?module=contract&action=getcontractcreation&contractaddresses=${group.join(",")}`,
        );
        for (const e of d.result || []) {
          map[(e.contractAddress || "").toLowerCase()] = {
            creator: (e.contractCreator || "").toLowerCase(),
            block: Number(e.blockNumber) || 0,
          };
        }
      } catch {
        /* best effort */
      }
    }),
  );
  return map;
}

interface Meta {
  name: string;
  symbol: string;
  decimals: number;
  totalSupply: bigint;
  holders: number;
  priceUsd: number;
}

async function tokenMeta(addr: string): Promise<Meta> {
  const d = await bs(`/api/v2/tokens/${addr}`);
  return {
    name: d.name || "Unknown",
    symbol: d.symbol || "?",
    decimals: Number(d.decimals ?? 18),
    totalSupply: BigInt(d.total_supply || "0"),
    holders: Number(d.holders_count ?? d.holders ?? 0),
    priceUsd: d.exchange_rate ? Number(d.exchange_rate) : 0,
  };
}

async function holderDist(
  addr: string,
  supply: bigint,
  creator?: string,
): Promise<{ top10Pct: number | null; devHoldingPct: number | null }> {
  if (supply <= 0n) return { top10Pct: null, devHoldingPct: null };
  try {
    const d = await bs(`/api/v2/tokens/${addr}/holders`);
    const items: any[] = d.items || [];
    if (!items.length) return { top10Pct: null, devHoldingPct: null };
    const top10 = items
      .slice(0, 10)
      .reduce((s: bigint, x: any) => s + BigInt(x.value || "0"), 0n);
    const top10Pct = Number((top10 * 10000n) / supply) / 100;
    // Absent from the holder page means the deployer holds nothing of note.
    let devHoldingPct: number | null = null;
    if (creator) {
      const dev = items.find((x: any) => (x.address?.hash || "").toLowerCase() === creator);
      devHoldingPct = dev ? Number((BigInt(dev.value || "0") * 10000n) / supply) / 100 : 0;
    }
    return { top10Pct, devHoldingPct };
  } catch {
    return { top10Pct: null, devHoldingPct: null };
  }
}

interface Dex {
  price: number;
  change: number;
  volume: number;
  liquidity: number;
  mcap: number;
  logoUrl?: string;
}

function toDex(pair: any): Dex {
  return {
    price: Number(pair.priceUsd) || 0,
    change: Number(pair.priceChange?.h24) || 0,
    volume: Number(pair.volume?.h24) || 0,
    liquidity: Number(pair.liquidity?.usd) || 0,
    mcap: Number(pair.marketCap || pair.fdv) || 0,
    logoUrl: pair.info?.imageUrl || undefined,
  };
}

/**
 * Live market data from Dexscreener for many tokens at once (30 per request).
 * Keeps, per token, the pair with the deepest liquidity.
 */
async function dexBatch(addrs: string[]): Promise<Record<string, Dex>> {
  const out: Record<string, Dex> = {};
  const CHUNK = 30;
  const groups: string[][] = [];
  for (let i = 0; i < addrs.length; i += CHUNK) groups.push(addrs.slice(i, i + CHUNK));
  await Promise.all(
    groups.map(async (group) => {
      try {
        const res = await fetch(
          `https://api.dexscreener.com/latest/dex/tokens/${group.join(",")}`,
          { headers: { "User-Agent": UA }, next: { revalidate: 30 } },
        );
        if (!res.ok) return;
        const d = await res.json();
        for (const p of d.pairs || []) {
          const base = (p.baseToken?.address || "").toLowerCase();
          if (!group.includes(base)) continue;
          const prev = out[base];
          const liq = Number(p.liquidity?.usd) || 0;
          if (!prev || liq > prev.liquidity) out[base] = toDex(p);
        }
      } catch {
        /* best effort */
      }
    }),
  );
  return out;
}

async function dexData(addr: string): Promise<Dex | null> {
  const m = await dexBatch([addr.toLowerCase()]);
  return m[addr.toLowerCase()] ?? null;
}

function hueFrom(addr: string): number {
  return parseInt(addr.slice(2, 8), 16) % 360;
}

/** 4-byte selectors we look for directly in the deployed bytecode. */
const SEL = {
  mint: ["40c10f19", "a0712d68", "94bf804d"], // mint(address,uint256) / mint(uint256) / mint(uint256,address)
  owner: ["8da5cb5b", "f2fde38b", "715018a6"], // owner() / transferOwnership() / renounceOwnership()
};

interface CodeTraits {
  mintable: boolean | null;
  renounced: boolean | null;
}

/**
 * Read the token's deployed bytecode and look for mint / ownership entry points.
 * A contract whose code contains no owner or mint selector simply cannot be
 * paused, re-owned or inflated — that's a fact we can state, not a guess.
 */
async function codeTraits(addr: string): Promise<CodeTraits> {
  try {
    const code: string = await rpc("eth_getCode", [addr, "latest"], 3600);
    if (!code || code.length < 4) return { mintable: null, renounced: null };
    const hex = code.toLowerCase();
    return {
      mintable: SEL.mint.some((s) => hex.includes(s)),
      renounced: !SEL.owner.some((s) => hex.includes(s)),
    };
  } catch {
    return { mintable: null, renounced: null };
  }
}

function assemble(
  addr: string,
  meta: Meta,
  ageSeconds: number,
  dist: { top10Pct: number | null; devHoldingPct: number | null },
  dex: Dex | null,
  traits: CodeTraits,
): Token {
  const supplyNum = Number(meta.totalSupply) / 10 ** meta.decimals;
  const priceUsd = dex?.price ?? 0;
  const liquidityUsd = dex?.liquidity ?? 0;
  const marketCapUsd = dex?.mcap || (priceUsd > 0 ? priceUsd * supplyNum : 0);

  // Only what we can actually read goes in. LP custody and launch-block sniping
  // aren't decoded yet, so they stay null — reported as unknown rather than
  // guessed, and excluded from the score.
  const metrics: TokenMetrics = {
    lpStatus: "unknown",
    lpUnlockDays: null,
    devHoldingPct: dist.devHoldingPct,
    top10Pct: dist.top10Pct,
    sniperPct: null,
    contractRenounced: traits.renounced,
    mintable: traits.mintable,
  };
  const safety = computeSafety(metrics, liquidityUsd > 0 ? liquidityUsd : null);

  return {
    id: addr,
    name: meta.name,
    symbol: meta.symbol,
    hue: hueFrom(addr),
    logoUrl: dex?.logoUrl,
    ageSeconds,
    priceUsd,
    changePct: dex?.change ?? 0,
    volumeUsd: dex?.volume ?? 0,
    liquidityUsd,
    marketCapUsd,
    holders: meta.holders,
    graduationPct: 0,
    metrics,
    safety,
  };
}

export async function getTokensOnchain(): Promise<Token[]> {
  // 1. Every launch the pools.trade factory has ever minted, newest first.
  const all = await listTokens(LOG_PAGES * 50);
  if (!all.length) return [];

  // 2. Cheap batch pass for market data across the whole history.
  const market = await dexBatch(all.map((l) => l.address));

  // 3. Rank: keep the freshest launches, then fill with the most-traded. This is
  //    pure on-chain discovery — established tokens earn their slot by volume,
  //    nothing is hardcoded.
  const fresh = all.slice(0, FRESH_SLOTS);
  const chosen = new Map(fresh.map((l) => [l.address, l]));
  const rest = all
    .filter((l) => !chosen.has(l.address))
    .sort((a, b) => (market[b.address]?.volume ?? 0) - (market[a.address]?.volume ?? 0));
  for (const l of rest) {
    if (chosen.size >= FEED_LIMIT) break;
    if ((market[l.address]?.volume ?? 0) <= 0) continue;
    chosen.set(l.address, l);
  }
  const list = [...chosen.values()];

  // 4. Enrich the shortlist with identity + holder distribution.
  const [clock, creators] = await Promise.all([
    chainClock(),
    creatorsOf(list.map((l) => l.address)),
  ]);
  const tokens = await Promise.all(
    list.map(async (l) => {
      try {
        const [meta, traits] = await Promise.all([tokenMeta(l.address), codeTraits(l.address)]);
        const info = creators[l.address];
        const dist = await holderDist(l.address, meta.totalSupply, info?.creator);
        const block = l.block || info?.block || 0;
        const ageSeconds =
          clock.latest && block ? Math.max(1, Math.round((clock.latest - block) * clock.blockTime)) : 0;
        return assemble(l.address, meta, ageSeconds, dist, market[l.address] ?? null, traits);
      } catch {
        return null;
      }
    }),
  );
  return tokens.filter((t): t is Token => t !== null);
}

export async function getTokenOnchain(id: string): Promise<Token | null> {
  const addr = id.toLowerCase();
  if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) return null;
  try {
    const [meta, clock, creators, dex, traits] = await Promise.all([
      tokenMeta(addr),
      chainClock(),
      creatorsOf([addr]),
      dexData(addr),
      codeTraits(addr),
    ]);
    const info = creators[addr];
    const dist = await holderDist(addr, meta.totalSupply, info?.creator);
    const block = info?.block || 0;
    const ageSeconds =
      clock.latest && block ? Math.max(1, Math.round((clock.latest - block) * clock.blockTime)) : 0;
    return assemble(addr, meta, ageSeconds, dist, dex, traits);
  } catch {
    return null;
  }
}

export async function getStatsOnchain(): Promise<MarketStats> {
  let launched = 0;
  try {
    const c = await bs(`/api/v2/addresses/${FACTORY}/counters`);
    launched = Number(c.transactions_count || 0);
  } catch {
    /* ignore */
  }
  const tokens = await getTokensOnchain().catch(() => [] as Token[]);
  const avgSafety = tokens.length
    ? Math.round(tokens.reduce((s, t) => s + t.safety.score, 0) / tokens.length)
    : 0;
  const rugged = tokens.filter((t) => t.safety.tier === "puddle").length;
  return {
    launchedToday: launched || tokens.length,
    totalVolumeUsd: tokens.reduce((s, t) => s + t.volumeUsd, 0),
    graduated: 0,
    ruggedToday: rugged,
    avgSafety,
  };
}

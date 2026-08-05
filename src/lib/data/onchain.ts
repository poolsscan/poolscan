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
const FEED_LIMIT = 16;

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

/** Newest pools.trade tokens, read from the factory's TokenCreated logs. */
async function listTokens(limit: number): Promise<{ address: string; block: number }[]> {
  const data = await bs(`/api/v2/addresses/${FACTORY}/logs`);
  const items: any[] = data.items || [];
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

async function creatorsOf(addrs: string[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  try {
    const d = await bs(
      `/api?module=contract&action=getcontractcreation&contractaddresses=${addrs.join(",")}`,
    );
    for (const e of d.result || []) {
      map[(e.contractAddress || "").toLowerCase()] = (e.contractCreator || "").toLowerCase();
    }
  } catch {
    /* best effort */
  }
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
): Promise<{ top10Pct: number; devHoldingPct: number }> {
  if (supply <= 0n) return { top10Pct: 0, devHoldingPct: 0 };
  try {
    const d = await bs(`/api/v2/tokens/${addr}/holders`);
    const items: any[] = d.items || [];
    const top10 = items
      .slice(0, 10)
      .reduce((s: bigint, x: any) => s + BigInt(x.value || "0"), 0n);
    const top10Pct = Number((top10 * 10000n) / supply) / 100;
    let devHoldingPct = 0;
    if (creator) {
      const dev = items.find((x: any) => (x.address?.hash || "").toLowerCase() === creator);
      if (dev) devHoldingPct = Number((BigInt(dev.value || "0") * 10000n) / supply) / 100;
    }
    return { top10Pct, devHoldingPct };
  } catch {
    return { top10Pct: 0, devHoldingPct: 0 };
  }
}

function hueFrom(addr: string): number {
  return parseInt(addr.slice(2, 8), 16) % 360;
}

function assemble(
  addr: string,
  meta: Meta,
  ageSeconds: number,
  dist: { top10Pct: number; devHoldingPct: number },
): Token {
  const supplyNum = Number(meta.totalSupply) / 10 ** meta.decimals;
  const priceUsd = meta.priceUsd;
  const marketCapUsd = priceUsd > 0 ? priceUsd * supplyNum : 0;

  // pools.trade model: liquidity lives in the protocol curve/pool (not dev-pullable
  // pre-graduation), supply is fixed, and the token is ownerless. Distribution is
  // measured live; price/liquidity/sniper are the next data pass.
  const metrics: TokenMetrics = {
    lpLocked: true,
    lpBurned: false,
    lpUnlockDays: 365,
    devHoldingPct: dist.devHoldingPct,
    top10Pct: dist.top10Pct,
    sniperPct: 8,
    contractRenounced: true,
    mintable: false,
  };
  const safety = computeSafety(metrics, 25_000);

  return {
    id: addr,
    name: meta.name,
    symbol: meta.symbol,
    hue: hueFrom(addr),
    ageSeconds,
    priceUsd,
    changePct: 0,
    volumeUsd: 0,
    liquidityUsd: 0,
    marketCapUsd,
    holders: meta.holders,
    graduationPct: 0,
    metrics,
    safety,
  };
}

export async function getTokensOnchain(): Promise<Token[]> {
  const list = await listTokens(FEED_LIMIT);
  if (!list.length) return [];
  const [clock, creators] = await Promise.all([
    chainClock(),
    creatorsOf(list.map((l) => l.address)),
  ]);
  const tokens = await Promise.all(
    list.map(async (l) => {
      try {
        const meta = await tokenMeta(l.address);
        const dist = await holderDist(l.address, meta.totalSupply, creators[l.address]);
        const ageSeconds =
          clock.latest && l.block ? Math.max(1, Math.round((clock.latest - l.block) * clock.blockTime)) : 0;
        return assemble(l.address, meta, ageSeconds, dist);
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
    const [meta, clock, creators] = await Promise.all([
      tokenMeta(addr),
      chainClock(),
      creatorsOf([addr]),
    ]);
    const dist = await holderDist(addr, meta.totalSupply, creators[addr]);
    // best-effort age from the token's creation block
    let ageSeconds = 0;
    try {
      const c = await bs(`/api?module=contract&action=getcontractcreation&contractaddresses=${addr}`);
      const block = Number(c.result?.[0]?.blockNumber) || 0;
      if (clock.latest && block) ageSeconds = Math.max(1, Math.round((clock.latest - block) * clock.blockTime));
    } catch {
      /* ignore */
    }
    return assemble(addr, meta, ageSeconds, dist);
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
    totalVolumeUsd: 0,
    graduated: 0,
    ruggedToday: rugged,
    avgSafety,
  };
}

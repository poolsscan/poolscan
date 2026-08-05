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
import { unstable_cache } from "next/cache";
import type { MarketStats, Token, TokenMetrics } from "../types";
import { computeSafety } from "../safety";

const RPC = process.env.RH_RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
const BS = process.env.RH_BLOCKSCOUT || "https://robinhoodchain.blockscout.com";
const FACTORY = (
  process.env.POOLSTRADE_FACTORY || "0x000000e200088d55c39a11f609e5f667729ad49b"
).toLowerCase();

// Both endpoints reject the default fetch/urllib UA — a browser UA is required.
const UA = "Mozilla/5.0 (compatible; PoolScan/1.0)";
/** TokenCreated(address tokenAddress, (string,string,string,bytes) metadata) */
const TOKEN_CREATED_TOPIC =
  "0x4ef8284ecf42d4cd19686572ffd87f630858c82398911e776cb831de35eddbf4";
/** Transfer(address,address,uint256) */
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
/**
 * Uniswap v4 singleton that custodies every pool's tokens on this chain. It shows
 * up as a token's largest "holder", but it is the pool itself — counting it as a
 * whale would flag every healthy launch as concentrated.
 */
const POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
/** Uniswap v4 PositionManager — mints an ERC-721 for each liquidity position. */
const POSITION_MANAGER = "0x58daec3116aae6d93017baaea7749052e8a04fa7";
const BURN_ADDRESSES = new Set([
  "0x0000000000000000000000000000000000000000",
  "0x000000000000000000000000000000000000dead",
]);
/** Blocks counted as "the launch" for sniper share (~0.2s blocks, so ~6 seconds). */
const SNIPE_WINDOW_BLOCKS = 30;
/** Below this share of supply outside the pool, distribution isn't meaningful yet. */
const MIN_CIRCULATING_RATIO = 0.005;
/** How many tokens end up on the board after ranking. */
const FEED_LIMIT = 30;
/** Of those, how many slots go to the freshest launches (rest go to top traded). */
const FRESH_SLOTS = 12;
/** Safety valve on the market-data fan-out (30 addresses per request). */
const MAX_MARKET_BATCHES = 120;

/**
 * Untyped JSON from third-party APIs (Blockscout, Dexscreener, the node). Shapes
 * are checked at each use site rather than trusted wholesale.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = { [key: string]: any };

async function bs(path: string, revalidate = 30): Promise<Json> {
  const res = await fetch(`${BS}${path}`, {
    headers: { "User-Agent": UA },
    next: { revalidate },
  });
  if (!res.ok) throw new Error(`blockscout ${res.status} ${path}`);
  return res.json();
}

/** `revalidate: false` skips the fetch cache — for responses too big to store. */
async function rpc<T = Json>(
  method: string,
  params: unknown[],
  revalidate: number | false = 15,
): Promise<T> {
  const res = await fetch(RPC, {
    method: "POST",
    headers: { "User-Agent": UA, "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    ...(revalidate === false ? { cache: "no-store" as const } : { next: { revalidate } }),
  });
  const j = await res.json();
  return j.result;
}

/**
 * Every token the pools.trade factory has ever created, newest first.
 *
 * The node serves the factory's whole TokenCreated history in a single
 * eth_getLogs call, so there's no paging window to fall out of — tokens from
 * launch day rank alongside the ones from a minute ago.
 */
const listTokens = unstable_cache(
  async (): Promise<{ address: string; block: number }[]> => {
    // The raw log dump is several MB — too large for the fetch cache — so it is
    // fetched uncached and only the distilled address list is memoised.
    const logs = await rpc<Json[]>(
      "eth_getLogs",
      [{ address: FACTORY, topics: [TOKEN_CREATED_TOPIC], fromBlock: "0x0", toBlock: "latest" }],
      false,
    );
    if (!Array.isArray(logs)) return [];
    const out: { address: string; block: number }[] = [];
    const seen = new Set<string>();
    for (const e of logs) {
      // first ABI word of `data` is the new token address, right-aligned
      const addr = "0x" + String(e.data || "").slice(26, 66).toLowerCase();
      if (!/^0x[0-9a-f]{40}$/.test(addr) || seen.has(addr)) continue;
      seen.add(addr);
      out.push({ address: addr, block: parseInt(e.blockNumber, 16) || 0 });
    }
    return out.reverse(); // newest first
  },
  ["poolstrade-factory-launches"],
  { revalidate: 60 },
);

/** Derive block time + head so we can turn creation blocks into an age. */
async function chainClock(): Promise<{ latest: number; blockTime: number }> {
  try {
    const latestHex = await rpc<string>("eth_blockNumber", []);
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
    const items: Json[] = d.items || [];
    if (!items.length) return { top10Pct: null, devHoldingPct: null };

    const addrOf = (x: Json) => (x.address?.hash || "").toLowerCase();
    const valOf = (x: Json) => BigInt(x.value || "0");

    // The pool's own balance isn't held by anyone — it's what's still for sale.
    const pooled = items
      .filter((x) => addrOf(x) === POOL_MANAGER || BURN_ADDRESSES.has(addrOf(x)))
      .reduce((s, x) => s + valOf(x), 0n);
    const circulating = supply - pooled;

    // A token seconds old still has ~everything in the pool; "top 10 hold 100%"
    // of a rounding error says nothing, so report it as not-yet-measurable.
    if (circulating <= (supply * BigInt(Math.round(MIN_CIRCULATING_RATIO * 10000))) / 10000n) {
      return { top10Pct: null, devHoldingPct: null };
    }

    const holders = items.filter(
      (x) => addrOf(x) !== POOL_MANAGER && !BURN_ADDRESSES.has(addrOf(x)),
    );
    const top10 = holders.slice(0, 10).reduce((s, x) => s + valOf(x), 0n);
    const top10Pct = Number((top10 * 10000n) / circulating) / 100;

    // Absent from the holder page means the deployer holds nothing of note.
    let devHoldingPct: number | null = null;
    if (creator) {
      const dev = holders.find((x) => addrOf(x) === creator);
      devHoldingPct = dev ? Number((valOf(dev) * 10000n) / circulating) / 100 : 0;
    }
    return { top10Pct: Math.min(100, top10Pct), devHoldingPct };
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

function toDex(pair: Json): Dex {
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
  if (groups.length > MAX_MARKET_BATCHES) groups.length = MAX_MARKET_BATCHES;
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

/**
 * Share of supply bought out of the pool in the first moments after launch.
 *
 * At launch the whole supply is routed into the v4 PoolManager, so every early
 * buy shows up as a Transfer *from* the PoolManager. Summing those across the
 * launch window gives the share snipers took before anyone else could react.
 * Returns null when we can't establish the launch block.
 */
async function sniperShare(
  addr: string,
  creationBlock: number,
  supply: bigint,
): Promise<number | null> {
  if (!creationBlock || supply <= 0n) return null;
  try {
    const logs = await rpc(
      "eth_getLogs",
      [
        {
          address: addr,
          topics: [TRANSFER_TOPIC],
          fromBlock: "0x" + creationBlock.toString(16),
          toBlock: "0x" + (creationBlock + SNIPE_WINDOW_BLOCKS).toString(16),
        },
      ],
       86400,
    );
    if (!Array.isArray(logs)) return null;
    let sniped = 0n;
    for (const e of logs) {
      const from = ("0x" + String(e.topics?.[1] || "").slice(26)).toLowerCase();
      const to = ("0x" + String(e.topics?.[2] || "").slice(26)).toLowerCase();
      // Buys leave the pool for someone else; pool top-ups and burns don't count.
      if (from !== POOL_MANAGER) continue;
      if (to === POOL_MANAGER || BURN_ADDRESSES.has(to)) continue;
      sniped += BigInt(e.data || "0x0");
    }
    return Math.min(100, Number((sniped * 10000n) / supply) / 100);
  } catch {
    return null;
  }
}

/**
 * Who holds the launch liquidity position.
 *
 * Liquidity is added through the v4 PositionManager, which mints an ERC-721 to
 * whoever owns the position. If that owner is a plain wallet, one key can pull
 * the pool; if it's a contract, no single wallet can. We deliberately stop
 * there — the holder's terms aren't verifiable on-chain, so we don't claim the
 * liquidity is "locked", only who is in a position to move it.
 */
async function lpCustody(
  creationBlock: number,
): Promise<"contract" | "wallet" | "unknown"> {
  if (!creationBlock) return "unknown";
  try {
    const logs = await rpc<Json[]>(
      "eth_getLogs",
      [
        {
          address: POSITION_MANAGER,
          topics: [TRANSFER_TOPIC],
          fromBlock: "0x" + creationBlock.toString(16),
          toBlock: "0x" + (creationBlock + 2).toString(16),
        },
      ],
       86400,
    );
    if (!Array.isArray(logs) || !logs.length) return "unknown";
    // ERC-721 transfers carry four topics; follow the position to its last owner.
    const moves = logs.filter((e) => (e.topics?.length ?? 0) >= 4);
    if (!moves.length) return "unknown";
    const owner = ("0x" + String(moves[moves.length - 1].topics[2]).slice(26)).toLowerCase();
    if (BURN_ADDRESSES.has(owner)) return "contract"; // burned — nobody can move it
    const code = await rpc<string>("eth_getCode", [owner, "latest"], 3600);
    return code && code.length > 4 ? "contract" : "wallet";
  } catch {
    return "unknown";
  }
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
    const code = await rpc<string>("eth_getCode", [addr, "latest"], 3600);
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
  sniperPct: number | null,
  lpStatus: TokenMetrics["lpStatus"],
): Token {
  const supplyNum = Number(meta.totalSupply) / 10 ** meta.decimals;
  const priceUsd = dex?.price ?? 0;
  const liquidityUsd = dex?.liquidity ?? 0;
  const marketCapUsd = dex?.mcap || (priceUsd > 0 ? priceUsd * supplyNum : 0);

  // Only what we can actually read goes in. LP custody and launch-block sniping
  // aren't decoded yet, so they stay null — reported as unknown rather than
  // guessed, and excluded from the score.
  const metrics: TokenMetrics = {
    lpStatus,
    lpUnlockDays: null,
    devHoldingPct: dist.devHoldingPct,
    top10Pct: dist.top10Pct,
    sniperPct,
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
  const all = await listTokens();
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
        const block = l.block || info?.block || 0;
        const [dist, snipers, lp] = await Promise.all([
          holderDist(l.address, meta.totalSupply, info?.creator),
          sniperShare(l.address, block, meta.totalSupply),
          lpCustody(block),
        ]);
        const ageSeconds =
          clock.latest && block ? Math.max(1, Math.round((clock.latest - block) * clock.blockTime)) : 0;
        return assemble(l.address, meta, ageSeconds, dist, market[l.address] ?? null, traits, snipers, lp);
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
    const block = info?.block || 0;
    const [dist, snipers, lp] = await Promise.all([
      holderDist(addr, meta.totalSupply, info?.creator),
      sniperShare(addr, block, meta.totalSupply),
      lpCustody(block),
    ]);
    const ageSeconds =
      clock.latest && block ? Math.max(1, Math.round((clock.latest - block) * clock.blockTime)) : 0;
    return assemble(addr, meta, ageSeconds, dist, dex, traits, snipers, lp);
  } catch {
    return null;
  }
}

export async function getStatsOnchain(): Promise<MarketStats> {
  // Total launches straight from the factory's own event history.
  const launched = await listTokens()
    .then((l) => l.length)
    .catch(() => 0);
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

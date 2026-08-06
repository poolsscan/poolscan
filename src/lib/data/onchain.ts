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
/** Initialize(bytes32,address,address,uint24,int24,address,uint160,int24) */
const INITIALIZE_TOPIC =
  "0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438";
/** ModifyLiquidity(bytes32,address,int24,int24,int256,bytes32) */
const MODIFY_LIQUIDITY_TOPIC =
  "0xf208f4912782fd25c7f114ca3723a2d5dd6f3bcc3ac8db5af63baa85f711d5ec";
const ZERO_TOPIC = "0x" + "0".repeat(64);
/**
 * The launchpad's fee splitters, which take custody of launch LP positions.
 * Their verified source states positions sent there are permanently locked, and
 * they expose no owner, no transfer and no upgrade path — so a position held by
 * one cannot be pulled by anybody.
 */
const OFFICIAL_LOCKERS = new Set([
  "0xeff166aaf189323c58dc27ed1206eb2c37faacdf",
  "0x7198c32a497c09497e04c86cf8f77a244a9e4b8f",
  "0xdf50f4ea2207f9d2a753a3dae729b36fdef13b23",
  "0x222d6d4f1ce59b0d48d5505114ec8addc90a4359",
  "0x6cc1b74fc1be1ff373fa07f3381856f38103e653",
]);
const BURN_ADDRESSES = new Set([
  "0x0000000000000000000000000000000000000000",
  "0x000000000000000000000000000000000000dead",
]);
/** Blocks counted as "the launch" for sniper share (~0.2s blocks, so ~6 seconds). */
const SNIPE_WINDOW_BLOCKS = 30;
/** Below this share of supply outside the pool, distribution isn't meaningful yet. */
const MIN_CIRCULATING_RATIO = 0.005;
/** How many tokens end up on the board after ranking. */
const FEED_LIMIT = 24;
/** ~0.2s blocks, so this is roughly the last few hours of launches. */
const RECENT_WINDOW_BLOCKS = 120_000;
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
  if (!res.ok) throw new Error(`rpc ${res.status} ${method}`);
  const j = await res.json();
  // Surface node-level errors instead of returning undefined, which callers
  // would otherwise read as "no results".
  if (j.error) throw new Error(`rpc ${method}: ${j.error.message ?? JSON.stringify(j.error)}`);
  return j.result;
}

type Launch = { address: string; block: number };

/**
 * Fetch the factory's TokenCreated logs over a block range, halving the range
 * whenever the node refuses it. Nodes cap results (10k here) and pools.trade
 * mints fast enough to blow past that, so a fixed window would quietly break
 * again as the launchpad grows.
 */
async function factoryLogs(from: number, to: number, depth = 0): Promise<Json[]> {
  try {
    const logs = await rpc<Json[]>(
      "eth_getLogs",
      [
        {
          address: FACTORY,
          topics: [TOKEN_CREATED_TOPIC],
          fromBlock: "0x" + from.toString(16),
          toBlock: "0x" + to.toString(16),
        },
      ],
      false,
    );
    return Array.isArray(logs) ? logs : [];
  } catch (e) {
    if (depth >= 8 || to - from < 2) throw e;
    // Split sequentially, not in parallel: a burst of retries just trips the
    // node's rate limiter and turns one failure into many.
    const mid = Math.floor((from + to) / 2);
    const a = await factoryLogs(from, mid, depth + 1);
    const b = await factoryLogs(mid + 1, to, depth + 1);
    return [...a, ...b];
  }
}

function decodeLaunches(logs: unknown): Launch[] {
  if (!Array.isArray(logs)) return [];
  const out: Launch[] = [];
  const seen = new Set<string>();
  for (const e of logs as Json[]) {
    // first ABI word of `data` is the new token address, right-aligned
    const addr = "0x" + String(e.data || "").slice(26, 66).toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(addr) || seen.has(addr)) continue;
    seen.add(addr);
    out.push({ address: addr, block: parseInt(e.blockNumber, 16) || 0 });
  }
  return out.reverse(); // newest first
}

/** The freshest launches, scoped to a window the node will actually serve. */
async function recentLaunches(head: number): Promise<Launch[]> {
  return decodeLaunches(await factoryLogs(Math.max(0, head - RECENT_WINDOW_BLOCKS), head));
}

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
export async function dexBatch(addrs: string[]): Promise<Record<string, Dex>> {
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
  token: string,
): Promise<{ status: TokenMetrics["lpStatus"]; remainingPct: number | null }> {
  const unknown = { status: "unknown" as const, remainingPct: null };
  try {
    // Find the launch transaction, then read that receipt: the pool's own
    // Initialize and ModifyLiquidity events identify the exact launch position.
    // (Watching the launch *block* instead picked up whatever else happened to
    // mint a position in the same block, which produced false red flags.)
    const mint = await rpc<Json[]>(
      "eth_getLogs",
      [{ address: token, topics: [TRANSFER_TOPIC, ZERO_TOPIC], fromBlock: "0x0", toBlock: "latest" }],
      86400,
    );
    if (!Array.isArray(mint) || !mint.length) return unknown;

    const receipt = await rpc<Json>("eth_getTransactionReceipt", [mint[0].transactionHash], 86400);
    let lpId: bigint | null = null;
    let liqLaunch = 0n;
    let sawPool = false;
    for (const log of receipt?.logs ?? []) {
      if (String(log.address).toLowerCase() !== POOL_MANAGER) continue;
      const d = String(log.data).slice(2);
      const word = (i: number) => d.slice(i * 64, (i + 1) * 64);
      if (log.topics?.[0] === INITIALIZE_TOPIC) sawPool = true;
      if (log.topics?.[0] === MODIFY_LIQUIDITY_TOPIC) {
        lpId = BigInt("0x" + word(3)); // salt carries the position's token id
        liqLaunch = BigInt("0x" + word(2));
      }
    }
    // Some tokens open their pool later (auction/LBP style). That is not a red
    // flag — there is simply no launch position to read yet.
    if (!sawPool || lpId === null || liqLaunch <= 0n) return unknown;

    const pad = (n: bigint) => n.toString(16).padStart(64, "0");
    const [ownerRaw, liqRaw] = await Promise.all([
      rpc<string>("eth_call", [{ to: POSITION_MANAGER, data: "0x6352211e" + pad(lpId) }, "latest"], 300),
      rpc<string>("eth_call", [{ to: POSITION_MANAGER, data: "0x1efeed33" + pad(lpId) }, "latest"], 300),
    ]);
    const owner = ("0x" + String(ownerRaw).slice(26)).toLowerCase();
    const liqNow = BigInt(liqRaw || "0x0");

    if (liqNow < liqLaunch) {
      return { status: "pulled", remainingPct: Number((liqNow * 10000n) / liqLaunch) / 100 };
    }
    if (OFFICIAL_LOCKERS.has(owner) || BURN_ADDRESSES.has(owner)) {
      return { status: "locked", remainingPct: null };
    }
    const code = await rpc<string>("eth_getCode", [owner, "latest"], 3600);
    return { status: code && code.length > 4 ? "contract" : "wallet", remainingPct: null };
  } catch {
    return unknown;
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
  lp: { status: TokenMetrics["lpStatus"]; remainingPct: number | null },
): Token {
  const supplyNum = Number(meta.totalSupply) / 10 ** meta.decimals;
  const priceUsd = dex?.price ?? 0;
  const liquidityUsd = dex?.liquidity ?? 0;
  const marketCapUsd = dex?.mcap || (priceUsd > 0 ? priceUsd * supplyNum : 0);

  // Only what we can actually read goes in. LP custody and launch-block sniping
  // aren't decoded yet, so they stay null — reported as unknown rather than
  // guessed, and excluded from the score.
  const metrics: TokenMetrics = {
    lpStatus: lp.status,
    lpRemainingPct: lp.remainingPct,
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
  // 1. The freshest launches from the factory's own events. pools.trade now
  //    mints past the node's 10k-log ceiling, so scanning all of history on
  //    demand isn't viable — and a live feed wants the newest pools anyway.
  //    Any older token is still reachable by address, via search.
  const clock = await chainClock();
  if (!clock.latest) return [];
  const fresh = await recentLaunches(clock.latest);
  const list = fresh.slice(0, FEED_LIMIT);
  if (!list.length) return [];

  // 2. Market data for just the shortlist, and identities.
  const [market, creators] = await Promise.all([
    dexBatch(list.map((l) => l.address)),
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
          lpCustody(l.address),
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
      lpCustody(addr),
    ]);
    const ageSeconds =
      clock.latest && block ? Math.max(1, Math.round((clock.latest - block) * clock.blockTime)) : 0;
    return assemble(addr, meta, ageSeconds, dist, dex, traits, snipers, lp);
  } catch {
    return null;
  }
}

export async function getStatsOnchain(): Promise<MarketStats> {
  const tokens = await getTokensOnchain().catch(() => [] as Token[]);
  // Launches seen in the recent window we actually scan, rather than an
  // all-time figure we can no longer read in one pass.
  const launched = await chainClock()
    .then((c) => (c.latest ? recentLaunches(c.latest) : []))
    .then((l) => l.length)
    .catch(() => tokens.length);
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

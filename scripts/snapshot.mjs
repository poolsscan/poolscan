/**
 * Snapshot indexer.
 *
 * Runs outside the request path (GitHub Actions), where it can afford to crawl
 * the chain properly: it walks the pools.trade factory's whole launch history,
 * enriches the tokens worth showing, and writes a compact JSON snapshot. The
 * site then renders the board from a single small fetch instead of a few
 * hundred RPC calls per cold render.
 *
 * It records raw on-chain facts only — the depth score is computed by the app
 * from these, so there is one scoring implementation, not two.
 *
 *   node scripts/snapshot.mjs [outfile]
 */
import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";

const RPC = process.env.RH_RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
const BS = process.env.RH_BLOCKSCOUT || "https://robinhoodchain.blockscout.com";
const FACTORY = (
  process.env.POOLSTRADE_FACTORY || "0x000000e200088d55c39a11f609e5f667729ad49b"
).toLowerCase();
const UA = "Mozilla/5.0 (compatible; PoolScan-indexer/1.0)";

const TOKEN_CREATED_TOPIC =
  "0x4ef8284ecf42d4cd19686572ffd87f630858c82398911e776cb831de35eddbf4";
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const POOL_MANAGER = "0x8366a39cc670b4001a1121b8f6a443a643e40951";
const POSITION_MANAGER = "0x58daec3116aae6d93017baaea7749052e8a04fa7";
const BURN = new Set([
  "0x0000000000000000000000000000000000000000",
  "0x000000000000000000000000000000000000dead",
]);
const FIRST_FACTORY_BLOCK = 4_727_385;
const INITIALIZE_TOPIC = "0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438";
const MODIFY_LIQUIDITY_TOPIC = "0xf208f4912782fd25c7f114ca3723a2d5dd6f3bcc3ac8db5af63baa85f711d5ec";
const ZERO_TOPIC = "0x" + "0".repeat(64);
/** Launchpad fee splitters: verified to hold LP positions with no way to release them. */
const OFFICIAL_LOCKERS = new Set([
  "0xeff166aaf189323c58dc27ed1206eb2c37faacdf",
  "0x7198c32a497c09497e04c86cf8f77a244a9e4b8f",
  "0xdf50f4ea2207f9d2a753a3dae729b36fdef13b23",
  "0x222d6d4f1ce59b0d48d5505114ec8addc90a4359",
  "0x6cc1b74fc1be1ff373fa07f3381856f38103e653",
]);
const SNIPE_WINDOW_BLOCKS = 30;
const MIN_CIRCULATING_RATIO = 0.005;

/**
 * What earns a place on the board. A launch feed that only shows the newest
 * pools misses the ones people are actually trading, so the snapshot carries
 * four overlapping views of the same history.
 */
const PICKS = [
  { tag: "new", count: 26, rank: null },
  { tag: "volume", count: 20, rank: (m) => m.volume },
  { tag: "mcap", count: 20, rank: (m) => m.mcap },
  // Traded heavily for its size — how something small starts trending.
  {
    tag: "trending",
    count: 16,
    rank: (m) =>
      m.liquidity >= 5_000 && m.volume >= 25_000 ? m.volume / Math.max(m.mcap, 1_000) : 0,
  },
];
const MAX_TOKENS = 80;

/** What the site fetches — kept small. */
const OUT = process.argv[2] || "snapshot/tokens.json";
/** The indexer's own resume state: every launch ever seen. Not fetched by the site. */
const STATE = OUT.replace(/tokens\.json$/, "launches.json");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A range that's too big will never succeed — the caller must split, not retry. */
const isPermanent = (msg = "") => /exceeds limit|too many|range|invalid params/i.test(msg);

async function withRetry(fn, label, tries = 4) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (isPermanent(e?.message)) break;
      // Back off on rate limits rather than hammering.
      await sleep(600 * (i + 1) * (i + 1));
    }
  }
  throw new Error(`${label}: ${lastErr?.message ?? lastErr}`);
}

async function rpc(method, params) {
  return withRetry(async () => {
    const res = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json", "User-Agent": UA },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    if (!res.ok) throw new Error(`rpc ${res.status}`);
    const j = await res.json();
    if (j.error) throw new Error(j.error.message || "rpc error");
    return j.result;
  }, `rpc ${method}`);
}

async function bs(path) {
  return withRetry(async () => {
    const res = await fetch(`${BS}${path}`, { headers: { "User-Agent": UA } });
    if (!res.ok) throw new Error(`blockscout ${res.status}`);
    return res.json();
  }, `bs ${path}`);
}

/** Factory logs over a block range, halving whenever the node refuses. */
async function factoryLogs(from, to, depth = 0) {
  try {
    const logs = await rpc("eth_getLogs", [
      {
        address: FACTORY,
        topics: [TOKEN_CREATED_TOPIC],
        fromBlock: "0x" + from.toString(16),
        toBlock: "0x" + to.toString(16),
      },
    ]);
    return Array.isArray(logs) ? logs : [];
  } catch (e) {
    if (depth >= 16 || to - from < 2) throw e;
    const mid = Math.floor((from + to) / 2);
    const a = await factoryLogs(from, mid, depth + 1);
    const b = await factoryLogs(mid + 1, to, depth + 1);
    return [...a, ...b];
  }
}

function decodeLaunches(logs) {
  const out = [];
  const seen = new Set();
  for (const e of logs) {
    const addr = "0x" + String(e.data || "").slice(26, 66).toLowerCase();
    if (!/^0x[0-9a-f]{40}$/.test(addr) || seen.has(addr)) continue;
    seen.add(addr);
    out.push({ address: addr, block: parseInt(e.blockNumber, 16) || 0 });
  }
  return out;
}

/** Market data from Dexscreener, 30 addresses per request. */
async function dexBatch(addrs) {
  const out = {};
  for (let i = 0; i < addrs.length; i += 30) {
    const group = addrs.slice(i, i + 30);
    try {
      const res = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${group.join(",")}`,
        { headers: { "User-Agent": UA } },
      );
      if (res.ok) {
        const d = await res.json();
        for (const p of d.pairs || []) {
          const base = (p.baseToken?.address || "").toLowerCase();
          if (!group.includes(base)) continue;
          const liq = Number(p.liquidity?.usd) || 0;
          if (out[base] && out[base].liquidity >= liq) continue;
          out[base] = {
            price: Number(p.priceUsd) || 0,
            change: Number(p.priceChange?.h24) || 0,
            volume: Number(p.volume?.h24) || 0,
            liquidity: liq,
            mcap: Number(p.marketCap || p.fdv) || 0,
            logoUrl: p.info?.imageUrl || undefined,
          };
        }
      }
    } catch {
      /* a missing batch just means less market data this run */
    }
    await sleep(120); // stay well inside Dexscreener's rate limit
  }
  return out;
}

const SEL = {
  mint: ["40c10f19", "a0712d68", "94bf804d"],
  owner: ["8da5cb5b", "f2fde38b", "715018a6"],
};

async function codeTraits(addr) {
  try {
    const code = await rpc("eth_getCode", [addr, "latest"]);
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

async function holderDist(addr, supply, creator) {
  if (supply <= 0n) return { top10Pct: null, devHoldingPct: null };
  try {
    const d = await bs(`/api/v2/tokens/${addr}/holders`);
    const items = d.items || [];
    if (!items.length) return { top10Pct: null, devHoldingPct: null };
    const addrOf = (x) => (x.address?.hash || "").toLowerCase();
    const valOf = (x) => BigInt(x.value || "0");
    const pooled = items
      .filter((x) => addrOf(x) === POOL_MANAGER || BURN.has(addrOf(x)))
      .reduce((s, x) => s + valOf(x), 0n);
    const circulating = supply - pooled;
    if (circulating <= (supply * BigInt(Math.round(MIN_CIRCULATING_RATIO * 10000))) / 10000n) {
      return { top10Pct: null, devHoldingPct: null };
    }
    const holders = items.filter((x) => addrOf(x) !== POOL_MANAGER && !BURN.has(addrOf(x)));
    const top10 = holders.slice(0, 10).reduce((s, x) => s + valOf(x), 0n);
    const top10Pct = Math.min(100, Number((top10 * 10000n) / circulating) / 100);
    let devHoldingPct = null;
    if (creator) {
      const dev = holders.find((x) => addrOf(x) === creator);
      devHoldingPct = dev ? Number((valOf(dev) * 10000n) / circulating) / 100 : 0;
    }
    return { top10Pct, devHoldingPct };
  } catch {
    return { top10Pct: null, devHoldingPct: null };
  }
}

async function sniperShare(addr, block, supply) {
  if (!block || supply <= 0n) return null;
  try {
    const logs = await rpc("eth_getLogs", [
      {
        address: addr,
        topics: [TRANSFER_TOPIC],
        fromBlock: "0x" + block.toString(16),
        toBlock: "0x" + (block + SNIPE_WINDOW_BLOCKS).toString(16),
      },
    ]);
    if (!Array.isArray(logs)) return null;
    let sniped = 0n;
    for (const e of logs) {
      const from = ("0x" + String(e.topics?.[1] || "").slice(26)).toLowerCase();
      const to = ("0x" + String(e.topics?.[2] || "").slice(26)).toLowerCase();
      if (from !== POOL_MANAGER || to === POOL_MANAGER || BURN.has(to)) continue;
      sniped += BigInt(e.data || "0x0");
    }
    return Math.min(100, Number((sniped * 10000n) / supply) / 100);
  } catch {
    return null;
  }
}

/**
 * Who can move the launch liquidity, read from the launch transaction itself.
 * Reading the launch *block* instead picks up unrelated positions minted in the
 * same block, which produced false "dev holds the LP" flags.
 */
async function lpCustody(token) {
  const unknown = { status: "unknown", remainingPct: null };
  try {
    const mint = await rpc("eth_getLogs", [
      { address: token, topics: [TRANSFER_TOPIC, ZERO_TOPIC], fromBlock: "0x0", toBlock: "latest" },
    ]);
    if (!Array.isArray(mint) || !mint.length) return unknown;

    const receipt = await rpc("eth_getTransactionReceipt", [mint[0].transactionHash]);
    let lpId = null, liqLaunch = 0n, sawPool = false;
    for (const log of receipt?.logs ?? []) {
      if (String(log.address).toLowerCase() !== POOL_MANAGER) continue;
      const d = String(log.data).slice(2);
      const word = (i) => d.slice(i * 64, (i + 1) * 64);
      if (log.topics?.[0] === INITIALIZE_TOPIC) sawPool = true;
      if (log.topics?.[0] === MODIFY_LIQUIDITY_TOPIC) {
        lpId = BigInt("0x" + word(3)); // salt carries the position's token id
        liqLaunch = BigInt("0x" + word(2));
      }
    }
    // Pools opened later (auction/LBP style) simply have nothing to read yet.
    if (!sawPool || lpId === null || liqLaunch <= 0n) return unknown;

    const pad = (n) => n.toString(16).padStart(64, "0");
    const [ownerRaw, liqRaw] = await Promise.all([
      rpc("eth_call", [{ to: POSITION_MANAGER, data: "0x6352211e" + pad(lpId) }, "latest"]),
      rpc("eth_call", [{ to: POSITION_MANAGER, data: "0x1efeed33" + pad(lpId) }, "latest"]),
    ]);
    const owner = ("0x" + String(ownerRaw).slice(26)).toLowerCase();
    const liqNow = BigInt(liqRaw || "0x0");

    if (liqNow < liqLaunch) {
      return { status: "pulled", remainingPct: Number((liqNow * 10000n) / liqLaunch) / 100 };
    }
    if (OFFICIAL_LOCKERS.has(owner) || BURN.has(owner)) return { status: "locked", remainingPct: null };
    const code = await rpc("eth_getCode", [owner, "latest"]);
    return { status: code && code.length > 4 ? "contract" : "wallet", remainingPct: null };
  } catch {
    return unknown;
  }
}

async function creatorsOf(addrs) {
  const map = {};
  for (let i = 0; i < addrs.length; i += 10) {
    const group = addrs.slice(i, i + 10);
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
  }
  return map;
}

async function enrich(launch, market, creators, clock, tags = []) {
  const { address } = launch;
  const meta = await bs(`/api/v2/tokens/${address}`).catch(() => null);
  if (!meta) return null;
  const supply = BigInt(meta.total_supply || "0");
  const info = creators[address];
  const block = launch.block || info?.block || 0;

  const [traits, dist, snipers, lp] = await Promise.all([
    codeTraits(address),
    holderDist(address, supply, info?.creator),
    sniperShare(address, block, supply),
    lpCustody(address),
  ]);

  const m = market[address] || {};
  return {
    id: address,
    name: meta.name || "Unknown",
    symbol: meta.symbol || "?",
    tags,
    block,
    ageSeconds:
      clock.latest && block ? Math.max(1, Math.round((clock.latest - block) * clock.blockTime)) : 0,
    holders: Number(meta.holders_count ?? meta.holders ?? 0),
    logoUrl: m.logoUrl,
    priceUsd: m.price ?? 0,
    changePct: m.change ?? 0,
    volumeUsd: m.volume ?? 0,
    liquidityUsd: m.liquidity ?? 0,
    marketCapUsd: m.mcap ?? 0,
    metrics: {
      lpStatus: lp.status,
      lpRemainingPct: lp.remainingPct,
      lpUnlockDays: null,
      devHoldingPct: dist.devHoldingPct,
      top10Pct: dist.top10Pct,
      sniperPct: snipers,
      contractRenounced: traits.renounced,
      mintable: traits.mintable,
    },
  };
}

async function main() {
  const head = parseInt(await rpc("eth_blockNumber", []), 16);
  const olderNum = Math.max(1, head - 5000);
  const [h, o] = await Promise.all([
    rpc("eth_getBlockByNumber", ["0x" + head.toString(16), false]),
    rpc("eth_getBlockByNumber", ["0x" + olderNum.toString(16), false]),
  ]);
  const blockTime = Math.max(
    0.05,
    (parseInt(h.timestamp, 16) - parseInt(o.timestamp, 16)) / (head - olderNum),
  );
  const clock = { latest: head, blockTime };
  console.log(`head=${head} blockTime=${blockTime.toFixed(3)}s`);

  // Resume from the previous snapshot so each run only scans new blocks.
  let known = [];
  let from = FIRST_FACTORY_BLOCK;
  if (existsSync(STATE)) {
    try {
      const prev = JSON.parse(readFileSync(STATE, "utf8"));
      known = prev.launches || [];
      if (prev.scannedTo) from = Math.max(FIRST_FACTORY_BLOCK, prev.scannedTo - 200);
      console.log(`resuming: ${known.length} known launches, from block ${from}`);
    } catch {
      console.log("previous state unreadable — full scan");
    }
  } else {
    console.log("no previous state — full scan (first run)");
  }

  const fresh = decodeLaunches(await factoryLogs(from, head));
  const byAddr = new Map(known.map((l) => [l.address, l]));
  for (const l of fresh) byAddr.set(l.address, l);
  const launches = [...byAddr.values()].sort((a, b) => a.block - b.block);
  console.log(`launches: ${launches.length} (+${fresh.length} this scan)`);

  // Market data across everything, so "most traded" is ranked over all history.
  const market = await dexBatch(launches.map((l) => l.address));
  console.log(`market data for ${Object.keys(market).length} tokens`);

  // Build each view, remembering which ones earned a token its place.
  const newestFirst = [...launches].reverse();
  const tags = new Map();
  const chosen = new Map();
  for (const pick of PICKS) {
    const ranked = pick.rank
      ? newestFirst
          .map((l) => ({ l, score: pick.rank(market[l.address] || {}) || 0 }))
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score)
          .map((x) => x.l)
      : newestFirst;
    for (const l of ranked.slice(0, pick.count)) {
      if (!chosen.has(l.address) && chosen.size >= MAX_TOKENS) continue;
      chosen.set(l.address, l);
      tags.set(l.address, [...(tags.get(l.address) || []), pick.tag]);
    }
    console.log(`  ${pick.tag}: ${Math.min(pick.count, ranked.length)}`);
  }
  const shortlist = [...chosen.values()];
  console.log(`enriching ${shortlist.length} tokens…`);

  const creators = await creatorsOf(shortlist.map((l) => l.address));
  const tokens = [];
  for (const l of shortlist) {
    try {
      const t = await enrich(l, market, creators, clock, tags.get(l.address) || []);
      if (t) tokens.push(t);
    } catch (e) {
      console.log(`  skip ${l.address}: ${e.message}`);
    }
  }

  const snapshot = {
    updatedAt: new Date().toISOString(),
    scannedTo: head,
    blockTime,
    totalLaunches: launches.length,
    volume24hUsd: Object.values(market).reduce((s, m) => s + (m.volume || 0), 0),
    tokens,
  };

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(snapshot));
  writeFileSync(STATE, JSON.stringify({ scannedTo: head, launches }));
  const kb = (p) => (JSON.stringify(p).length / 1024).toFixed(0);
  console.log(
    `wrote ${OUT} (${kb(snapshot)}KB, ${tokens.length} tokens) and ` +
      `${STATE} (${launches.length} launches)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

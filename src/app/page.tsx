import TopBar from "@/components/TopBar";
import RipplePool from "@/components/RipplePool";
import TokenBoard from "@/components/TokenBoard";
import WaitlistForm from "@/components/WaitlistForm";
import DepthBadge from "@/components/DepthBadge";
import { getStats, getTokens } from "@/lib/data";
import { compact, usd } from "@/lib/format";
import { TIER_UI } from "@/lib/ui";
import type { SafetyTier } from "@/lib/types";

const TIER_ORDER: SafetyTier[] = ["deep", "wading", "shallow", "puddle"];
const TIER_COPY: Record<SafetyTier, string> = {
  deep: "LP secured, ownership clean. The rug levers are off.",
  wading: "A couple of raised flags. Size accordingly.",
  shallow: "Concentrated supply or loose liquidity. Choppy.",
  puddle: "Classic rug shape. Live mint or pullable LP.",
};

const FACTORS = [
  ["Liquidity", "Is the LP burned, locked, or still pullable?", "28"],
  ["Ownership", "Are owner keys renounced or still armed?", "14"],
  ["Dev wallet", "How much supply sits with the deployer?", "18"],
  ["Distribution", "What do the top 10 wallets control?", "14"],
  ["Snipers", "How much got taken in the launch block?", "12"],
  ["Supply", "Can more tokens still be minted?", "8"],
  ["Pool depth", "Is there real money in the pool?", "6"],
];

export default async function Home() {
  const [tokens, stats] = await Promise.all([getTokens(), getStats()]);
  const featured = tokens.find((t) => t.safety.tier === "deep") ?? tokens[0];

  const statTiles = [
    { label: "Launched today", value: compact(stats.launchedToday) },
    { label: "Volume 24h", value: usd(stats.totalVolumeUsd) },
    { label: "Graduated", value: compact(stats.graduated) },
    { label: "Rugged today", value: compact(stats.ruggedToday), danger: true },
  ];

  return (
    <>
      <TopBar />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6">
        {/* HERO */}
        <section className="grid items-center gap-10 py-16 md:grid-cols-[1.05fr_0.95fr] md:py-24">
          <div className="animate-rise">
            <p className="eyebrow text-[var(--color-moss)]">
              Live · Robinhood Chain · Uniswap v4
            </p>
            <h1 className="mt-6 serif text-5xl leading-[1.04] text-[var(--color-ink)] sm:text-6xl">
              See the bottom of every pool{" "}
              <em className="italic text-[var(--color-pine)]">before you dive in.</em>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-[var(--color-ink-soft)]">
              PoolScan sounds every token launching on{" "}
              <span className="text-[var(--color-ink)]">pools.trade</span> — Uniswap&apos;s new
              launchpad on Robinhood Chain — and reads how deep the liquidity really goes. Spot the
              rugs before they pull.
            </p>

            <div className="mt-9">
              <WaitlistForm />
              <p className="mt-3 text-xs text-[var(--color-ink-faint)]">
                Early access at launch · no wallet connection required to browse
              </p>
            </div>
          </div>

          {/* Ripple pool */}
          <div className="relative mx-auto w-full max-w-sm">
            <div className="card p-6">
              <div className="mb-2 flex items-center justify-between">
                <span className="eyebrow">Depth reading</span>
                <span className="flex items-center gap-1.5 text-xs text-[var(--color-depth-deep)]">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-depth-deep)]" />
                  sounding
                </span>
              </div>
              <RipplePool />
            </div>
            {/* Latest detection chip */}
            <div className="card absolute -bottom-5 -left-2 flex items-center gap-3 px-4 py-3 sm:-left-6">
              <DepthBadge score={featured.safety.score} tier={featured.safety.tier} size={42} />
              <div>
                <p className="eyebrow">Latest sounding</p>
                <p className="mt-0.5 text-sm font-semibold text-[var(--color-ink)]">
                  {featured.symbol} ·{" "}
                  <span style={{ color: TIER_UI[featured.safety.tier].color }}>
                    {TIER_UI[featured.safety.tier].label}
                  </span>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* STATS STRIP */}
        <section className="card grid grid-cols-2 divide-[var(--color-line)] sm:grid-cols-4 sm:divide-x">
          {statTiles.map((s) => (
            <div key={s.label} className="px-6 py-5">
              <p className="eyebrow">{s.label}</p>
              <p
                className="nums mt-1.5 text-3xl"
                style={{ color: s.danger ? "var(--color-depth-puddle)" : "var(--color-ink)" }}
              >
                {s.value}
              </p>
            </div>
          ))}
        </section>

        {/* LIVE FEED */}
        <section id="feed" className="scroll-mt-20 py-16">
          <div className="mb-6">
            <h2 className="serif text-3xl text-[var(--color-ink)] sm:text-4xl">Live feed</h2>
            <p className="mt-2 text-[var(--color-ink-soft)]">
              Every new pool, sounded the moment it hits the chain. Sorted by freshest first.
            </p>
          </div>
          <TokenBoard initial={tokens} />
          <p className="mt-3 text-center text-xs text-[var(--color-ink-faint)]">
            Preview data — the live feed wires into pools.trade on Robinhood Chain at launch.
          </p>
        </section>

        {/* SCORING */}
        <section id="scoring" className="scroll-mt-20 border-t border-[var(--color-line)] py-20">
          <div className="grid gap-14 lg:grid-cols-2">
            <div>
              <p className="eyebrow text-[var(--color-moss)]">The depth reading</p>
              <h2 className="mt-4 serif text-3xl text-[var(--color-ink)] sm:text-4xl">
                One score. Seven soundings.
              </h2>
              <p className="mt-4 max-w-md text-[var(--color-ink-soft)]">
                Every token gets a 0–100 depth score built from the signals that actually decide
                whether a pool holds — not vibes. Here&apos;s what we measure.
              </p>
              <ul className="mt-7 divide-y divide-[var(--color-line)]">
                {FACTORS.map(([name, desc, weight]) => (
                  <li key={name} className="flex items-center gap-4 py-3.5">
                    <span className="mono w-8 shrink-0 text-right text-sm text-[var(--color-moss)]">
                      {weight}
                    </span>
                    <div>
                      <p className="font-semibold text-[var(--color-ink)]">{name}</p>
                      <p className="text-sm text-[var(--color-ink-soft)]">{desc}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="eyebrow">Depth tiers</p>
              <div className="mt-4 grid gap-3">
                {TIER_ORDER.map((tier) => {
                  const ui = TIER_UI[tier];
                  return (
                    <div
                      key={tier}
                      className="flex items-center gap-4 rounded-[var(--radius-xl2)] border p-5"
                      style={{ borderColor: "var(--color-line)", background: ui.wash }}
                    >
                      <span
                        className="nums grid h-12 w-12 shrink-0 place-items-center rounded-full text-sm font-semibold"
                        style={{ background: "var(--color-paper)", color: ui.color, boxShadow: `inset 0 0 0 1.5px ${ui.color}` }}
                      >
                        {tier === "deep" ? "80+" : tier === "wading" ? "55" : tier === "shallow" ? "30" : "0"}
                      </span>
                      <div>
                        <p className="serif text-lg" style={{ color: ui.color }}>
                          {ui.label}
                        </p>
                        <p className="text-sm text-[var(--color-ink-soft)]">{TIER_COPY[tier]}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>

        {/* WAITLIST */}
        <section id="waitlist" className="scroll-mt-20 py-16">
          <div className="card-cream relative overflow-hidden px-6 py-14 text-center sm:px-12">
            <div
              className="pointer-events-none absolute inset-x-0 -top-32 h-64 opacity-70 blur-3xl"
              style={{ background: "radial-gradient(50% 100% at 50% 0%, var(--color-mint-3), transparent)" }}
              aria-hidden
            />
            <h2 className="relative serif text-4xl text-[var(--color-ink)] sm:text-5xl">
              Don&apos;t dive in blind.
            </h2>
            <p className="relative mx-auto mt-4 max-w-lg text-[var(--color-ink-soft)]">
              Get early access the moment PoolScan goes live on Robinhood Chain. Free at launch for
              the first wave.
            </p>
            <div className="relative mt-8 flex justify-center">
              <WaitlistForm />
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[var(--color-line)]">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col justify-between gap-6 sm:flex-row">
          <div className="max-w-sm">
            <p className="serif text-xl text-[var(--color-ink)]">poolscan</p>
            <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
              The rug radar for pools.trade. Sound the depth before you dive.
            </p>
          </div>
          <div className="text-sm text-[var(--color-ink-faint)]">
            <p className="max-w-xs leading-relaxed">
              Unofficial. Not affiliated with, endorsed by, or connected to Uniswap Labs,
              pools.trade, or Robinhood. Safety scores are heuristics, not guarantees — and nothing
              here is financial advice. Always do your own research.
            </p>
          </div>
        </div>
        <p className="mt-10 text-xs text-[var(--color-ink-faint)]">
          © 2026 PoolScan · Built for the pools.trade launch
        </p>
      </div>
    </footer>
  );
}

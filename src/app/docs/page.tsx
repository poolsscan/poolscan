import type { Metadata } from "next";
import Link from "next/link";
import { TIER_UI } from "@/lib/ui";
import type { SafetyTier } from "@/lib/types";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "How PoolScan reads a pool: the depth score, the seven soundings, the four tiers, and the data behind them.",
};

const TOC = [
  ["overview", "What PoolScan is"],
  ["depth-score", "The depth score"],
  ["soundings", "The seven soundings"],
  ["tiers", "The four tiers"],
  ["feed", "Live feed & graduation"],
  ["data", "Data & limitations"],
  ["faq", "FAQ"],
];

const SOUNDINGS: [string, string, string][] = [
  ["Liquidity", "28", "The biggest rug lever. LP burned = it can never be pulled (full marks). LP locked scores by how long it's locked. Unlocked LP scores zero — it can be drained at any moment."],
  ["Ownership", "14", "Whether the owner keys are renounced. Renounced = nobody can flip a privileged switch. Keys still active scores zero."],
  ["Dev wallet", "18", "Share of supply held by the deployer. Under ~3% is ideal; 20%+ scores zero."],
  ["Distribution", "14", "Share held by the top 10 wallets. Under ~25% is healthy; 70%+ scores zero."],
  ["Snipers", "12", "Supply grabbed in the launch block. Under ~5% is clean; 40%+ scores zero."],
  ["Supply", "8", "A live mint function can inflate supply and dilute holders. Fixed supply scores full."],
  ["Pool depth", "6", "Actual dollars in the pool. $50k+ is deep; under ~$8k is thin and easy to move."],
];

const TIER_RANGE: Record<SafetyTier, string> = {
  deep: "80–100",
  wading: "55–79",
  shallow: "30–54",
  puddle: "0–29",
};
const TIER_COPY: Record<SafetyTier, string> = {
  deep: "LP secured, ownership clean, supply well spread. The usual rug levers are off the table.",
  wading: "A couple of raised flags. Worth a look, but size your position for what could bite.",
  shallow: "Multiple red flags — concentrated supply or unsecured liquidity. Easy to get stuck.",
  puddle: "The shape of a classic rug: unsecured LP, a live mint, or supply stacked in a few wallets.",
};
const TIER_ORDER: SafetyTier[] = ["deep", "wading", "shallow", "puddle"];

const FAQ: [string, string][] = [
  ["Is PoolScan affiliated with Uniswap or pools.trade?", "No. PoolScan is an independent, unofficial tool. It is not affiliated with, endorsed by, or connected to Uniswap Labs, pools.trade, or Robinhood."],
  ["Does a high depth score mean it's safe to buy?", "No. The depth score is a heuristic built from on-chain signals — it flags known risks, it does not predict price or guarantee safety. Nothing here is financial advice."],
  ["Where does the data come from?", "Today the feed runs on realistic preview data. At the pools.trade launch it wires into live token, liquidity, and holder data from Robinhood Chain through a single data adapter."],
  ["Do I need to connect a wallet?", "No. Browsing the feed and reading depth scores is completely free and requires no wallet connection."],
  ["What does “graduation” mean?", "New tokens trade against a bonding curve. Once it fills, the token “graduates” and migrates to a full Uniswap v4 pool. The feed shows each token's progress toward that."],
];

export default function DocsPage() {
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-14 sm:px-6">
      <header className="max-w-2xl">
        <p className="eyebrow text-[var(--color-moss)]">Documentation</p>
        <h1 className="mt-4 serif text-4xl text-[var(--color-ink)] sm:text-5xl">
          How PoolScan reads a pool
        </h1>
        <p className="mt-4 text-lg text-[var(--color-ink-soft)]">
          Every token gets a single 0–100 depth score. Here&apos;s exactly what goes into it, what
          the tiers mean, and where the numbers come from.
        </p>
      </header>

      <div className="mt-12 grid gap-12 lg:grid-cols-[200px_1fr]">
        {/* TOC */}
        <aside className="hidden lg:block">
          <nav className="sticky top-28 space-y-2 text-sm">
            <p className="eyebrow mb-3">On this page</p>
            {TOC.map(([id, label]) => (
              <a
                key={id}
                href={`#${id}`}
                className="block text-[var(--color-ink-soft)] transition-colors hover:text-[var(--color-ink)]"
              >
                {label}
              </a>
            ))}
          </nav>
        </aside>

        <div className="max-w-2xl space-y-14">
          <Section id="overview" title="What PoolScan is">
            <p>
              PoolScan is a discovery and safety scanner for{" "}
              <span className="text-[var(--color-ink)]">pools.trade</span>, Uniswap&apos;s token
              launchpad on Robinhood Chain. It watches every new pool the moment it hits the chain,
              and &ldquo;sounds&rdquo; how deep the liquidity really goes — so you can tell a real
              launch from a rug before you dive in.
            </p>
          </Section>

          <Section id="depth-score" title="The depth score">
            <p>
              The depth score runs from <strong className="text-[var(--color-ink)]">0 to 100</strong>
              . Higher means deeper — safer footing. It&apos;s a weighted sum of seven independent
              signals (&ldquo;soundings&rdquo;), each mapped to a plain-language reading so you can
              see exactly why a token scored the way it did. No black box.
            </p>
          </Section>

          <Section id="soundings" title="The seven soundings">
            <p>Each sounding contributes up to its weight. The weights add up to 100.</p>
            <ul className="mt-5 divide-y divide-[var(--color-line)]">
              {SOUNDINGS.map(([name, weight, desc]) => (
                <li key={name} className="flex gap-4 py-4">
                  <span className="mono w-8 shrink-0 text-right text-sm text-[var(--color-moss)]">{weight}</span>
                  <div>
                    <p className="font-semibold text-[var(--color-ink)]">{name}</p>
                    <p className="mt-0.5 text-[var(--color-ink-soft)]">{desc}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Section>

          <Section id="tiers" title="The four depth tiers">
            <p>The score rolls up into a tier so you can read a pool at a glance.</p>
            <div className="mt-5 grid gap-3">
              {TIER_ORDER.map((tier) => {
                const ui = TIER_UI[tier];
                return (
                  <div
                    key={tier}
                    className="rounded-[var(--radius-xl2)] border p-5"
                    style={{ borderColor: "var(--color-line)", background: ui.wash }}
                  >
                    <div className="flex items-baseline gap-3">
                      <p className="serif text-lg" style={{ color: ui.color }}>
                        {ui.label}
                      </p>
                      <span className="nums text-sm text-[var(--color-ink-faint)]">{TIER_RANGE[tier]}</span>
                    </div>
                    <p className="mt-1 text-[var(--color-ink-soft)]">{TIER_COPY[tier]}</p>
                  </div>
                );
              })}
            </div>
          </Section>

          <Section id="feed" title="Live feed & graduation">
            <p>
              The feed lists new pools freshest-first and updates as launches land. Sort by volume,
              market cap, holders, graduation, or depth; filter out the puddles when you only want
              the pools worth a look. Each token shows its <em>graduation</em> — progress along the
              bonding curve toward a full Uniswap v4 pool.
            </p>
          </Section>

          <Section id="data" title="Data & limitations">
            <p>
              Today the feed runs on realistic preview data so the product is fully explorable
              before launch. At the pools.trade launch it wires into live Robinhood Chain data
              through a single adapter — nothing else about the experience changes.
            </p>
            <p className="mt-4">
              Depth scores are <strong className="text-[var(--color-ink)]">heuristics</strong>, not
              guarantees. They surface known, mechanical risks; they can&apos;t catch every trick and
              they don&apos;t predict price. Always do your own research.
            </p>
          </Section>

          <Section id="faq" title="FAQ">
            <dl className="divide-y divide-[var(--color-line)]">
              {FAQ.map(([q, a]) => (
                <div key={q} className="py-4">
                  <dt className="font-semibold text-[var(--color-ink)]">{q}</dt>
                  <dd className="mt-1 text-[var(--color-ink-soft)]">{a}</dd>
                </div>
              ))}
            </dl>
          </Section>

          <div className="rounded-[var(--radius-xl2)] border border-[var(--color-line)] bg-[var(--color-cream)] p-6">
            <p className="text-sm text-[var(--color-ink-soft)]">
              Ready to dive in?{" "}
              <Link href="/#waitlist" className="font-medium text-[var(--color-moss)] underline underline-offset-4">
                Request early access
              </Link>{" "}
              or{" "}
              <Link href="/#feed" className="font-medium text-[var(--color-moss)] underline underline-offset-4">
                browse the live feed
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-28">
      <h2 className="serif text-2xl text-[var(--color-ink)]">{title}</h2>
      <div className="mt-3 leading-relaxed text-[var(--color-ink-soft)]">{children}</div>
    </section>
  );
}

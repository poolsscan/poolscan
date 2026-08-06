import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import DepthBadge from "@/components/DepthBadge";
import TokenAvatar from "@/components/TokenAvatar";
import SafetyBreakdown from "@/components/SafetyBreakdown";
import CopyButton from "@/components/CopyButton";
import { getToken } from "@/lib/data";
import { age, compact, pct, shortAddr, usd } from "@/lib/format";
import { TIER_UI } from "@/lib/ui";

export const revalidate = 30;
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const token = await getToken(id);
  if (!token) return { title: "Token not found" };
  const ui = TIER_UI[token.safety.tier];
  return {
    title: `${token.symbol} — depth ${token.safety.score}/100 (${ui.label})`,
    description: `${token.name} (${token.symbol}) on pools.trade: depth ${token.safety.score}/100, ${usd(token.liquidityUsd)} liquidity, ${compact(token.holders)} holders.`,
  };
}

export default async function TokenPage({ params }: Params) {
  const { id } = await params;
  const token = await getToken(id);
  if (!token) notFound();

  const ui = TIER_UI[token.safety.tier];
  const graduated = token.graduationPct >= 100;

  const na = (v: number, f: (n: number) => string) => (v > 0 ? f(v) : "—");
  const market: [string, string, string?][] = [
    ["Price", na(token.priceUsd, usd)],
    [
      "Since launch",
      token.priceUsd > 0 ? pct(token.changePct) : "—",
      token.priceUsd > 0 ? (token.changePct >= 0 ? "up" : "down") : undefined,
    ],
    ["Market cap", na(token.marketCapUsd, usd)],
    ["Volume", na(token.volumeUsd, usd)],
    ["Liquidity", na(token.liquidityUsd, usd)],
    ["Holders", compact(token.holders)],
    ["Age", age(token.ageSeconds)],
  ];

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
        <Link href="/#feed" className="text-sm text-[var(--color-ink-soft)] transition-colors hover:text-[var(--color-ink)]">
          ← Live feed
        </Link>

        {/* Header */}
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <TokenAvatar symbol={token.symbol} hue={token.hue} size={56} logoUrl={token.logoUrl} />
          <div className="min-w-0">
            <h1 className="serif text-3xl text-[var(--color-ink)] sm:text-4xl">
              {token.symbol}
              <span className="ml-2.5 font-sans text-lg not-italic text-[var(--color-ink-soft)]">{token.name}</span>
            </h1>
            <div className="mt-2 flex items-center gap-2">
              <span className="mono text-xs text-[var(--color-ink-faint)]">{shortAddr(token.id)}</span>
              <CopyButton value={token.id} label="Copy" />
            </div>
          </div>
          <a
            href="https://pools.trade"
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto rounded-full border border-[var(--color-line-strong)] px-4 py-2 text-sm text-[var(--color-ink-soft)] transition-colors hover:border-[var(--color-moss)] hover:text-[var(--color-ink)]"
          >
            View on pools.trade ↗
          </a>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          {/* Left: depth score + breakdown */}
          <div className="space-y-6">
            <div
              className="flex flex-col items-center gap-6 rounded-[var(--radius-xl2)] border p-7 text-center sm:flex-row sm:text-left"
              style={{ borderColor: "var(--color-line)", background: ui.wash }}
            >
              <DepthBadge score={token.safety.score} tier={token.safety.tier} size={116} />
              <div>
                <p className="eyebrow" style={{ color: ui.color }}>
                  {ui.label}
                </p>
                <p className="mt-1.5 serif text-2xl text-[var(--color-ink)]">
                  Depth reading {token.safety.score}
                  <span className="text-[var(--color-ink-faint)]">/100</span>
                </p>
                {token.safety.coverage < 1 && (
                  <p className="mono mt-1 text-xs text-[var(--color-ink-faint)]">
                    across {Math.round(token.safety.coverage * 100)}% of checks read
                  </p>
                )}
                <p className="mt-2 text-sm leading-relaxed text-[var(--color-ink-soft)]">
                  {token.safety.summary}
                </p>
              </div>
            </div>

            <div className="card p-7">
              <h2 className="serif text-xl text-[var(--color-ink)]">Why it scored {token.safety.score}</h2>
              <p className="mt-1.5 text-sm text-[var(--color-ink-soft)]">
                Each sounding contributes to the depth reading. Green holds, amber warns, red leaks.
                {token.safety.coverage < 1 && (
                  <>
                    {" "}
                    Dashed signals aren&apos;t readable yet — they&apos;re left out of the score rather
                    than guessed, so this reading covers{" "}
                    <strong className="text-[var(--color-ink)]">
                      {Math.round(token.safety.coverage * 100)}%
                    </strong>{" "}
                    of the checks.
                  </>
                )}
              </p>
              <div className="mt-5">
                <SafetyBreakdown report={token.safety} />
              </div>
            </div>
          </div>

          {/* Right: market */}
          <aside className="space-y-6">
            <div className="card p-7">
              <h2 className="eyebrow">Market</h2>
              <dl className="mt-3 divide-y divide-[var(--color-line)]">
                {market.map(([k, v, dir]) => (
                  <div key={k} className="flex items-center justify-between py-2.5">
                    <dt className="text-sm text-[var(--color-ink-soft)]">{k}</dt>
                    <dd
                      className="nums text-sm font-medium"
                      style={{
                        color:
                          dir === "up"
                            ? "var(--color-depth-deep)"
                            : dir === "down"
                              ? "var(--color-depth-puddle)"
                              : "var(--color-ink)",
                      }}
                    >
                      {v}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            <div className="card p-7">
              <div className="flex items-center justify-between">
                <h2 className="eyebrow">Graduation</h2>
                <span className="nums text-sm text-[var(--color-moss)]">
                  {graduated ? "Complete" : `${Math.round(token.graduationPct)}%`}
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--color-mint-2)]">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${token.graduationPct}%`, background: graduated ? "var(--color-pine)" : "var(--color-moss)" }}
                />
              </div>
              <p className="mt-3 text-sm text-[var(--color-ink-soft)]">
                {graduated
                  ? "This pool filled its bonding curve and migrated to a full Uniswap v4 pool."
                  : "Progress along the bonding curve toward a full Uniswap v4 pool."}
              </p>
            </div>
          </aside>
        </div>

        <p className="mt-8 text-xs leading-relaxed text-[var(--color-ink-faint)]">
          Depth scores are heuristics computed from on-chain signals, not a guarantee of safety.
          PoolScan is unofficial and not affiliated with Uniswap, pools.trade, or Robinhood. Nothing
          here is financial advice — always do your own research.
        </p>
      </main>
  );
}

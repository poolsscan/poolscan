import Link from "next/link";

const LINKS = [
  { href: "/#feed", label: "Live feed" },
  { href: "/#scoring", label: "How it scores" },
  { href: "/docs", label: "Docs" },
  { href: "/new", label: "What's new" },
];

export default function SiteFooter() {
  return (
    <footer className="border-t border-[var(--color-line)]">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="flex flex-col justify-between gap-8 sm:flex-row">
          <div className="max-w-sm">
            <p className="serif text-xl text-[var(--color-ink)]">poolscan</p>
            <p className="mt-2 text-sm text-[var(--color-ink-soft)]">
              The rug radar for pools.trade. Sound the depth before you dive.
            </p>
            <nav className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm text-[var(--color-ink-soft)]">
              {LINKS.map((l) => (
                <Link key={l.href} href={l.href} className="transition-colors hover:text-[var(--color-ink)]">
                  {l.label}
                </Link>
              ))}
            </nav>
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

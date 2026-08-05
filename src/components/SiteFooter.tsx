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
            <div className="mt-5 flex items-center gap-3">
              <a
                href="https://x.com/poolscan_"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="PoolScan on X"
                className="grid h-9 w-9 place-items-center rounded-full border border-[var(--color-line-strong)] text-[var(--color-ink-soft)] transition-colors hover:border-[var(--color-moss)] hover:text-[var(--color-ink)]"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
                </svg>
              </a>
              <a
                href="https://github.com/poolsscan/poolscan"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="PoolScan on GitHub"
                className="grid h-9 w-9 place-items-center rounded-full border border-[var(--color-line-strong)] text-[var(--color-ink-soft)] transition-colors hover:border-[var(--color-moss)] hover:text-[var(--color-ink)]"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M12 .5C5.37.5 0 5.87 0 12.5c0 5.3 3.438 9.8 8.205 11.387.6.113.82-.26.82-.577 0-.285-.01-1.04-.015-2.04-3.338.726-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.73.083-.73 1.205.085 1.84 1.237 1.84 1.237 1.07 1.835 2.807 1.305 3.492.998.108-.776.42-1.305.762-1.605-2.665-.303-5.466-1.332-5.466-5.93 0-1.31.468-2.38 1.236-3.22-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.3 1.23a11.5 11.5 0 0 1 3.003-.404c1.02.005 2.047.138 3.006.404 2.29-1.552 3.297-1.23 3.297-1.23.653 1.652.242 2.873.118 3.176.77.84 1.235 1.91 1.235 3.22 0 4.61-2.805 5.624-5.478 5.92.43.372.814 1.103.814 2.222 0 1.606-.015 2.898-.015 3.293 0 .32.216.694.825.576C20.565 22.296 24 17.798 24 12.5 24 5.87 18.627.5 12 .5z" />
                </svg>
              </a>
            </div>
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

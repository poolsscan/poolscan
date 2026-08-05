import Link from "next/link";

function Mark() {
  return (
    <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden>
      <circle cx="16" cy="16" r="14" fill="none" stroke="var(--color-pine)" strokeWidth="1.75" />
      <path d="M16 2 a14 14 0 0 1 0 28 a9 9 0 0 0 0 -18 a5 5 0 0 1 0 -10 z" fill="var(--color-pine)" />
      <circle cx="16" cy="21" r="3.4" fill="var(--color-moss)" />
    </svg>
  );
}

export default function TopBar() {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-paper)_82%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <Mark />
          <span className="serif text-2xl text-[var(--color-ink)]">poolscan</span>
        </Link>

        <nav className="hidden items-center gap-7 text-sm text-[var(--color-ink-soft)] md:flex">
          <Link href="/#feed" className="transition-colors hover:text-[var(--color-ink)]">
            Live feed
          </Link>
          <Link href="/#scoring" className="transition-colors hover:text-[var(--color-ink)]">
            How it scores
          </Link>
          <span className="flex items-center gap-1.5 text-xs text-[var(--color-ink-faint)]">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--color-depth-deep)]" />
            Robinhood Chain
          </span>
        </nav>

        <a
          href="/#waitlist"
          className="rounded-full bg-[var(--color-pine)] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-pine-deep)]"
        >
          Request early access
        </a>
      </div>
    </header>
  );
}

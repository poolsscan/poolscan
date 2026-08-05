"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import PointerGlow from "./PointerGlow";

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-[var(--color-mint-2)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-pine)]">
      {children}
    </span>
  );
}

const NAV: { href: string; label: string; badge?: string }[] = [
  { href: "/#feed", label: "Live feed" },
  { href: "/#scoring", label: "How it scores" },
  { href: "/docs", label: "Docs" },
  { href: "/new", label: "What's new", badge: "New" },
];

export default function TopBar() {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-paper)_85%,transparent)] backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" onClick={close} className="flex shrink-0 items-center gap-2.5">
          <Image src="/logo.png" alt="PoolScan" width={30} height={30} priority className="h-[30px] w-[30px]" />
          <span className="serif text-2xl text-[var(--color-ink)]">poolscan</span>
        </Link>

        {/* Desktop nav */}
        <PointerGlow className="hidden items-center gap-7 text-sm text-[var(--color-ink-soft)] lg:flex">
          {NAV.map((l) => (
            <Link key={l.href} href={l.href} className="glow-link flex items-center gap-1.5">
              {l.label}
              {l.badge && <Badge>{l.badge}</Badge>}
            </Link>
          ))}
        </PointerGlow>

        <div className="flex shrink-0 items-center gap-2">
          <a
            href="/#waitlist"
            className="hidden rounded-full bg-[var(--color-pine)] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-pine-deep)] lg:inline-block"
          >
            Request early access
          </a>

          {/* Hamburger — phone + tablet */}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            aria-controls="mobile-menu"
            className="grid h-10 w-10 place-items-center rounded-full border border-[var(--color-line-strong)] text-[var(--color-ink)] transition-colors hover:bg-[var(--color-mint-1)] lg:hidden"
          >
            {open ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M5 5l14 14M19 5L5 19" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile / tablet menu */}
      {open && (
        <div id="mobile-menu" className="border-t border-[var(--color-line)] bg-[var(--color-paper)] lg:hidden">
          <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-4 sm:px-6">
            {NAV.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={close}
                className="flex items-center gap-2 rounded-xl px-3 py-3 text-base text-[var(--color-ink)] transition-colors hover:bg-[var(--color-mint-1)]"
              >
                {l.label}
                {l.badge && <Badge>{l.badge}</Badge>}
              </Link>
            ))}
            <a
              href="/#waitlist"
              onClick={close}
              className="mt-2 rounded-full bg-[var(--color-pine)] px-5 py-3 text-center text-sm font-medium text-white transition-colors hover:bg-[var(--color-pine-deep)]"
            >
              Request early access
            </a>
          </nav>
        </div>
      )}
    </header>
  );
}

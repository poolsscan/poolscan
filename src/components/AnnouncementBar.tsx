import Link from "next/link";
import Countdown from "./Countdown";
import { EARLY_ACCESS_DEADLINE_ISO } from "@/lib/config";

export default function AnnouncementBar() {
  return (
    <div className="relative z-50 border-b border-[var(--color-line)] bg-[var(--color-mint-1)]">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-2 gap-y-1 px-4 py-2 text-center text-sm text-[var(--color-pine)]">
        <span aria-hidden className="text-[var(--color-moss)]">
          ◷
        </span>
        <span className="hidden sm:inline">Early access opens in</span>
        <span className="sm:hidden">Opens in</span>
        <Countdown deadline={EARLY_ACCESS_DEADLINE_ISO} variant="inline" endedLabel="it's open now" />
        <span className="mx-1 text-[var(--color-ink-faint)]" aria-hidden>
          ·
        </span>
        <Link
          href="/#waitlist"
          className="font-medium underline decoration-[var(--color-mint-3)] underline-offset-4 transition-colors hover:decoration-[var(--color-pine)]"
        >
          Join the waitlist →
        </Link>
      </div>
    </div>
  );
}

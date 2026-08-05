import type { Metadata } from "next";
import Countdown from "@/components/Countdown";
import WaitlistForm from "@/components/WaitlistForm";
import { EARLY_ACCESS_DEADLINE_ISO } from "@/lib/config";

export const metadata: Metadata = {
  title: "What's new",
  description:
    "Early access to PoolScan is opening for a limited time. See the countdown and the latest updates.",
};

const UPDATES: { date: string; title: string; body: string; tag?: string }[] = [
  {
    date: "Aug 5, 2026",
    title: "Early access window opens",
    body: "We're opening PoolScan to the first wave for a limited time. Join the waitlist and you're in the moment it goes live on Robinhood Chain — free for early users.",
    tag: "New",
  },
  {
    date: "Aug 5, 2026",
    title: "Depth scoring is live",
    body: "Every token now gets a 0–100 depth score built from seven on-chain soundings and rolled into four tiers, from Deep water to Puddle. The full method is in the docs.",
    tag: "New",
  },
  {
    date: "Aug 5, 2026",
    title: "The live feed",
    body: "New pools stream in freshest-first — sortable by volume, market cap, holders, graduation and depth, filterable down to just the pools worth a look.",
  },
  {
    date: "Aug 4, 2026",
    title: "PoolScan takes shape",
    body: "A calm, clear rug radar for pools.trade — Uniswap's new launchpad on Robinhood Chain. Sound the depth before you dive.",
  },
];

export default function WhatsNewPage() {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-16 sm:px-6">
      {/* Countdown hero */}
      <section className="card-cream relative overflow-hidden px-6 py-12 text-center sm:px-12 sm:py-14">
        <div
          className="pointer-events-none absolute inset-x-0 -top-32 h-64 opacity-70 blur-3xl"
          style={{ background: "radial-gradient(50% 100% at 50% 0%, var(--color-mint-3), transparent)" }}
          aria-hidden
        />
        <p className="relative eyebrow text-[var(--color-moss)]">Limited early access</p>
        <h1 className="relative mt-4 serif text-4xl text-[var(--color-ink)] sm:text-5xl">
          Early access opens soon
        </h1>
        <p className="relative mx-auto mt-4 max-w-md text-[var(--color-ink-soft)]">
          The first wave gets in free. When the timer hits zero, the doors open on Robinhood Chain.
        </p>

        <div className="relative mt-9 flex justify-center">
          <Countdown deadline={EARLY_ACCESS_DEADLINE_ISO} variant="blocks" endedLabel="Early access is open" />
        </div>

        <div className="relative mt-9 flex justify-center">
          <WaitlistForm />
        </div>
      </section>

      {/* Updates */}
      <section className="mt-16">
        <h2 className="serif text-2xl text-[var(--color-ink)]">Latest updates</h2>
        <ol className="mt-6 space-y-8 border-l border-[var(--color-line)] pl-6">
          {UPDATES.map((u, i) => (
            <li key={i} className="relative">
              <span
                className="absolute -left-[29px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--color-paper)] bg-[var(--color-moss)]"
                aria-hidden
              />
              <p className="mono text-xs text-[var(--color-ink-faint)]">{u.date}</p>
              <div className="mt-1 flex items-center gap-2">
                <h3 className="font-semibold text-[var(--color-ink)]">{u.title}</h3>
                {u.tag && (
                  <span className="rounded-full bg-[var(--color-mint-2)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-pine)]">
                    {u.tag}
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-[var(--color-ink-soft)]">{u.body}</p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

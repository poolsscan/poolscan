"use client";

import { useEffect, useState } from "react";

const pad = (n: number) => String(n).padStart(2, "0");

function breakdown(ms: number) {
  const t = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(t / 86400),
    hours: Math.floor((t % 86400) / 3600),
    minutes: Math.floor((t % 3600) / 60),
    seconds: t % 60,
  };
}

interface Props {
  deadline: string | number;
  variant?: "inline" | "blocks";
  endedLabel?: string;
}

/**
 * Live countdown to a fixed deadline. Renders a stable placeholder on the server
 * and first client paint (now === null), then ticks each second after mount — so
 * there is no hydration mismatch.
 */
export default function Countdown({ deadline, variant = "inline", endedLabel = "Open now" }: Props) {
  const target = typeof deadline === "string" ? new Date(deadline).getTime() : deadline;
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = now === null ? null : target - now;
  const ended = remaining !== null && remaining <= 0;
  const b = breakdown(remaining ?? 0);

  if (variant === "blocks") {
    if (ended) {
      return <p className="serif text-3xl text-[var(--color-pine)]">{endedLabel}</p>;
    }
    const blocks: [number, string][] = [
      [b.days, "days"],
      [b.hours, "hrs"],
      [b.minutes, "min"],
      [b.seconds, "sec"],
    ];
    return (
      <div className="flex items-center gap-2 sm:gap-3">
        {blocks.map(([val, label], i) => (
          <div key={label} className="flex items-center gap-2 sm:gap-3">
            <div className="min-w-[62px] rounded-2xl border border-[var(--color-line)] bg-[var(--color-paper)] px-3 py-3 text-center sm:min-w-[76px]">
              <span className="nums block text-3xl font-semibold text-[var(--color-ink)] sm:text-4xl">
                {now === null ? "––" : pad(val)}
              </span>
              <span className="eyebrow mt-1 block">{label}</span>
            </div>
            {i < blocks.length - 1 && (
              <span className="serif text-2xl text-[var(--color-ink-faint)]" aria-hidden>
                :
              </span>
            )}
          </div>
        ))}
      </div>
    );
  }

  // inline
  if (ended) return <span className="font-semibold">{endedLabel}</span>;
  const text =
    now === null
      ? "··:··:··"
      : b.days > 0
        ? `${b.days}d ${pad(b.hours)}:${pad(b.minutes)}:${pad(b.seconds)}`
        : `${pad(b.hours)}:${pad(b.minutes)}:${pad(b.seconds)}`;
  return <span className="nums font-semibold">{text}</span>;
}

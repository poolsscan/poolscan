"use client";

import { useState } from "react";

export default function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1400);
        } catch {
          /* clipboard blocked */
        }
      }}
      className="mono inline-flex items-center gap-1.5 rounded-md border border-[var(--color-line-strong)] px-2 py-1 text-xs text-[var(--color-ink-soft)] transition-colors hover:border-[var(--color-moss)] hover:text-[var(--color-ink)]"
      title="Copy address"
    >
      {copied ? "Copied ✓" : label}
    </button>
  );
}

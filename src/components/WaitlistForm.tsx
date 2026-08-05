"use client";

import { useState } from "react";

export default function WaitlistForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "done" | "error">("idle");

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!ok) {
      setState("error");
      return;
    }
    // No backend yet — persist locally so the CTA is real today.
    try {
      const key = "poolscan.waitlist";
      const prev = JSON.parse(localStorage.getItem(key) || "[]");
      localStorage.setItem(key, JSON.stringify([...prev, { email, at: Date.now() }]));
    } catch {
      /* ignore storage errors */
    }
    setState("done");
  }

  if (state === "done") {
    return (
      <div className="flex items-center gap-3 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-mint-1)] px-5 py-3">
        <span className="text-[var(--color-depth-deep)]">✓</span>
        <p className="text-sm text-[var(--color-pine)]">
          You&apos;re on the list. We&apos;ll ping you the moment the scanner goes live.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex w-full max-w-md flex-col gap-2 sm:flex-row">
      <div className="flex-1">
        <label htmlFor="wl-email" className="sr-only">
          Email address
        </label>
        <input
          id="wl-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@wallet.eth"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (state === "error") setState("idle");
          }}
          className="w-full rounded-full border border-[var(--color-line-strong)] bg-[var(--color-paper)] px-5 py-3 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] focus:border-[var(--color-moss)] focus:outline-none"
          aria-invalid={state === "error"}
        />
        {state === "error" && (
          <p className="mt-1 pl-4 text-xs text-[var(--color-depth-puddle)]">
            That email doesn&apos;t look right — check it and try again.
          </p>
        )}
      </div>
      <button
        type="submit"
        className="rounded-full bg-[var(--color-pine)] px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-[var(--color-pine-deep)]"
      >
        Request early access
      </button>
    </form>
  );
}

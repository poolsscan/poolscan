"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Token } from "@/lib/types";
import { reserveToken } from "@/lib/data/mock";
import { age, compact, pct, usd } from "@/lib/format";
import { TIER_UI } from "@/lib/ui";
import DepthBadge from "./DepthBadge";
import TokenAvatar from "./TokenAvatar";

type SortKey = "age" | "changePct" | "volumeUsd" | "liquidityUsd" | "marketCapUsd" | "holders" | "graduationPct" | "safety";
type Filter = "all" | "deep" | "safe";

const ACCESS: Record<SortKey, (t: Token) => number> = {
  age: (t) => t.ageSeconds,
  changePct: (t) => t.changePct,
  volumeUsd: (t) => t.volumeUsd,
  liquidityUsd: (t) => t.liquidityUsd,
  marketCapUsd: (t) => t.marketCapUsd,
  holders: (t) => t.holders,
  graduationPct: (t) => t.graduationPct,
  safety: (t) => t.safety.score,
};

const COLS: { key: SortKey; label: string; cls: string }[] = [
  { key: "changePct", label: "Chg", cls: "hidden sm:table-cell" },
  { key: "volumeUsd", label: "Volume", cls: "hidden md:table-cell" },
  { key: "liquidityUsd", label: "Liquidity", cls: "hidden lg:table-cell" },
  { key: "marketCapUsd", label: "MCap", cls: "hidden sm:table-cell" },
  { key: "holders", label: "Holders", cls: "hidden lg:table-cell" },
  { key: "graduationPct", label: "Graduation", cls: "hidden xl:table-cell" },
  { key: "safety", label: "Depth", cls: "" },
];

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All pools" },
  { key: "safe", label: "Hide puddles" },
  { key: "deep", label: "Deep only" },
];

export default function TokenBoard({ initial, simulate = false }: { initial: Token[]; simulate?: boolean }) {
  const router = useRouter();
  const [tokens, setTokens] = useState<Token[]>(initial);
  const [sortKey, setSortKey] = useState<SortKey>("age");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [filter, setFilter] = useState<Filter>("all");
  const [flashId, setFlashId] = useState<string | null>(null);
  const [live, setLive] = useState(true);
  const [query, setQuery] = useState("");
  const reserveRef = useRef(0);

  // Live simulation — client only, so no hydration drift.
  useEffect(() => {
    if (!live || !simulate) return;
    const tick = setInterval(() => {
      setTokens((ts) =>
        ts.map((t) => {
          const drift = (Math.random() - 0.48) * 0.05;
          return {
            ...t,
            ageSeconds: t.ageSeconds + 2,
            priceUsd: Math.max(1e-9, t.priceUsd * (1 + drift)),
            changePct: t.changePct + drift * 100,
          };
        }),
      );
    }, 2000);
    const spawn = setInterval(() => {
      const t = reserveToken(reserveRef.current++);
      if (!t) return; // reserve exhausted — keep ticking, stop adding
      setFlashId(t.id);
      setTokens((ts) => [t, ...ts].slice(0, 45));
    }, 6500);
    return () => {
      clearInterval(tick);
      clearInterval(spawn);
    };
  }, [live, simulate]);

  const q = query.trim().toLowerCase();
  const isAddress = /^0x[0-9a-f]{40}$/.test(q);

  const rows = useMemo(() => {
    const filtered = tokens.filter((t) => {
      const tierOk =
        filter === "all" ? true : filter === "deep" ? t.safety.tier === "deep" : t.safety.tier !== "puddle";
      if (!tierOk) return false;
      if (!q) return true;
      return (
        t.symbol.toLowerCase().includes(q) ||
        t.name.toLowerCase().includes(q) ||
        t.id.toLowerCase().includes(q)
      );
    });
    const acc = ACCESS[sortKey];
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => (acc(a) - acc(b)) * dir);
  }, [tokens, sortKey, sortDir, filter, q]);

  function onSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "age" ? "asc" : "desc");
    }
  }

  return (
    <div className="card overflow-hidden">
      {/* Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-line)] px-4 py-3.5">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            {live && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--color-depth-deep)] opacity-50" />
            )}
            <span className={`relative inline-flex h-2 w-2 rounded-full ${live ? "bg-[var(--color-depth-deep)]" : "bg-[var(--color-ink-faint)]"}`} />
          </span>
          <button
            onClick={() => setLive((v) => !v)}
            className="eyebrow transition-colors hover:text-[var(--color-ink)]"
          >
            {live ? "Live · sounding" : "Paused"}
          </button>
        </div>

        <div className="order-3 w-full sm:order-none sm:w-auto sm:flex-1 sm:max-w-xs">
          <label htmlFor="token-search" className="sr-only">
            Search by name, ticker or contract address
          </label>
          <input
            id="token-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, ticker or address…"
            className="w-full rounded-full border border-[var(--color-line-strong)] bg-[var(--color-paper)] px-4 py-1.5 text-sm text-[var(--color-ink)] placeholder:text-[var(--color-ink-faint)] focus:border-[var(--color-moss)] focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-1 rounded-full bg-[var(--color-cream)] p-1">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                filter === f.key
                  ? "bg-[var(--color-paper)] text-[var(--color-ink)] shadow-sm"
                  : "text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr>
              <th className="px-4 py-3 text-left">
                <SortLabel active={sortKey === "age"} dir={sortDir} onClick={() => onSort("age")} label="Age" />
              </th>
              <th className="px-3 py-3 text-left">
                <span className="eyebrow">Token</span>
              </th>
              {COLS.map((c) => (
                <th key={c.key} className={`px-3 py-3 text-right ${c.cls}`}>
                  <SortLabel active={sortKey === c.key} dir={sortDir} onClick={() => onSort(c.key)} label={c.label} align="right" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => {
              const ui = TIER_UI[t.safety.tier];
              const graduated = t.graduationPct >= 100;
              return (
                <tr
                  key={t.id}
                  onClick={() => router.push(`/token/${t.id}`)}
                  className={`group cursor-pointer border-t border-[var(--color-line)] transition-colors hover:bg-[var(--color-mint-1)] ${
                    flashId === t.id ? "animate-flash" : ""
                  }`}
                >
                  <td className="px-4 py-3.5 text-left align-middle">
                    <span className="nums text-xs text-[var(--color-ink-soft)]">{age(t.ageSeconds)}</span>
                  </td>
                  <td className="px-3 py-3.5 align-middle">
                    <div className="flex items-center gap-3">
                      <TokenAvatar symbol={t.symbol} hue={t.hue} logoUrl={t.logoUrl} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/token/${t.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="truncate font-semibold text-[var(--color-ink)] group-hover:text-[var(--color-moss)]"
                          >
                            {t.symbol}
                          </Link>
                          <span className="nums text-xs text-[var(--color-ink-faint)]">{t.priceUsd > 0 ? usd(t.priceUsd) : "—"}</span>
                        </div>
                        <span className="truncate text-xs text-[var(--color-ink-soft)]">{t.name}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3.5 text-right align-middle hidden sm:table-cell">
                    <span
                      className="nums text-xs font-medium"
                      style={{
                        color:
                          t.priceUsd <= 0
                            ? "var(--color-ink-faint)"
                            : t.changePct >= 0
                              ? "var(--color-depth-deep)"
                              : "var(--color-depth-puddle)",
                      }}
                    >
                      {t.priceUsd > 0 ? pct(t.changePct) : "—"}
                    </span>
                  </td>
                  <td className="px-3 py-3.5 text-right align-middle nums text-[var(--color-ink)] hidden md:table-cell">{t.volumeUsd > 0 ? usd(t.volumeUsd) : "—"}</td>
                  <td className="px-3 py-3.5 text-right align-middle nums text-[var(--color-ink-soft)] hidden lg:table-cell">{t.liquidityUsd > 0 ? usd(t.liquidityUsd) : "—"}</td>
                  <td className="px-3 py-3.5 text-right align-middle nums text-[var(--color-ink-soft)] hidden sm:table-cell">{t.marketCapUsd > 0 ? usd(t.marketCapUsd) : "—"}</td>
                  <td className="px-3 py-3.5 text-right align-middle nums text-[var(--color-ink-soft)] hidden lg:table-cell">{compact(t.holders)}</td>
                  <td className="px-3 py-3.5 align-middle hidden xl:table-cell">
                    {t.graduationPct <= 0 ? (
                      <span className="nums block text-right text-[var(--color-ink-faint)]">—</span>
                    ) : graduated ? (
                      <span className="ml-auto flex w-fit items-center gap-1 rounded-full bg-[var(--color-mint-1)] px-2 py-0.5 text-xs text-[var(--color-pine)]">
                        Graduated
                      </span>
                    ) : (
                      <div className="ml-auto flex w-28 items-center gap-2">
                        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--color-mint-2)]">
                          <div className="h-full rounded-full bg-[var(--color-moss)]" style={{ width: `${t.graduationPct}%` }} />
                        </div>
                        <span className="nums text-[10px] text-[var(--color-ink-faint)]">{Math.round(t.graduationPct)}%</span>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3.5 align-middle">
                    <div className="flex items-center justify-end gap-2">
                      <DepthBadge score={t.safety.score} tier={t.safety.tier} size={34} />
                      <span className="eyebrow hidden w-14 text-right sm:inline" style={{ color: ui.color, letterSpacing: "0.1em" }}>
                        {ui.short}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {rows.length === 0 && !q && (
        <div className="px-6 py-12 text-center">
          <p className="text-sm text-[var(--color-ink-soft)]">
            No pools to show right now — we&apos;re re-reading the chain.
          </p>
          <p className="mt-1 text-xs text-[var(--color-ink-faint)]">
            The board only ever shows real pools.trade tokens, so it stays empty rather than
            showing anything we haven&apos;t read. Refresh in a moment.
          </p>
        </div>
      )}

      {rows.length === 0 && q && (
        <div className="px-6 py-10 text-center">
          <p className="text-sm text-[var(--color-ink-soft)]">
            Nothing on the board matches{" "}
            <span className="mono text-[var(--color-ink)]">{query}</span>.
          </p>
          {isAddress ? (
            <Link
              href={`/token/${q}`}
              className="mt-3 inline-block rounded-full bg-[var(--color-pine)] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-pine-deep)]"
            >
              Sound this address anyway →
            </Link>
          ) : (
            <p className="mt-1 text-xs text-[var(--color-ink-faint)]">
              Paste a full contract address to sound a token that isn&apos;t on the board.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function SortLabel({
  label,
  active,
  dir,
  onClick,
  align = "left",
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
  align?: "left" | "right";
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 font-[family-name:var(--font-fragment)] text-[0.68rem] uppercase tracking-[0.14em] transition-colors hover:text-[var(--color-ink)] ${
        active ? "text-[var(--color-moss)]" : "text-[var(--color-ink-faint)]"
      } ${align === "right" ? "flex-row-reverse" : ""}`}
    >
      {label}
      <span className="text-[9px]">{active ? (dir === "asc" ? "↑" : "↓") : "↕"}</span>
    </button>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import { toPng } from "html-to-image";

type Preset = { name: string; tag: string; headline: string; subtext: string };

const PRESETS: Preset[] = [
  {
    name: "No guessing",
    tag: "How it works",
    headline: "We show our work",
    subtext:
      "Every depth score breaks into seven on-chain signals. If we can't read one yet, we mark it not scored and leave it out — no filler, no guessing.",
  },
  {
    name: "Introducing",
    tag: "Introducing",
    headline: "Meet PoolScan",
    subtext:
      "The rug radar for pools.trade. Sound the depth of every new token on Robinhood Chain — before you dive in.",
  },
  {
    name: "We were wrong",
    tag: "What we fixed",
    headline: "We were wrong twice this week",
    subtext:
      "One token got a perfect score we hadn't earned. Another got a red flag it didn't deserve. Both are fixed — and the scoring changed so neither can happen the same way again.",
  },
  {
    name: "Drain alert",
    tag: "What's new",
    headline: "When the pool drains, you see it",
    subtext:
      "PoolScan reads each token's launch liquidity position and compares it to what's there now. If it has shrunk, we say so — and how much is left.",
  },
  {
    name: "LP custody",
    tag: "What's new",
    headline: "Who can pull the pool?",
    subtext:
      "A token's launch liquidity is an NFT someone owns. If a contract holds it, no single wallet can pull the pool. If a wallet holds it, one key can. PoolScan reads which.",
  },
  {
    name: "Snipers",
    tag: "What's new",
    headline: "Sniper detection is live",
    subtext:
      "At launch the whole supply sits in the pool, so every early buy is on-chain. We sum them and show the share taken before you could blink.",
  },
  {
    name: "Token alert",
    tag: "Deep water · 100",
    headline: "$FRONG reads clean",
    subtext:
      "Ownerless contract, fixed supply, top 10 hold 12%, 9.5K holders. Sounded live from the pools.trade factory.",
  },
];

export default function StudioPage() {
  const [tag, setTag] = useState(PRESETS[0].tag);
  const [headline, setHeadline] = useState(PRESETS[0].headline);
  const [subtext, setSubtext] = useState(PRESETS[0].subtext);
  const [footer, setFooter] = useState("poolscan.xyz · @poolscan_");
  const [busy, setBusy] = useState(false);

  const cardRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(el.clientWidth / 1200));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  async function download() {
    if (!cardRef.current) return;
    setBusy(true);
    try {
      await document.fonts.ready;
      const url = await toPng(cardRef.current, { pixelRatio: 2, cacheBust: true });
      const a = document.createElement("a");
      a.download = `poolscan-${tag.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
      a.href = url;
      a.click();
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-12 sm:px-6">
      <p className="eyebrow text-[var(--color-moss)]">Post studio</p>
      <h1 className="mt-3 serif text-3xl text-[var(--color-ink)] sm:text-4xl">Post card maker</h1>
      <p className="mt-2 max-w-xl text-[var(--color-ink-soft)]">
        Edit the text, pick a preset, and download a ready-to-post 1200×675 card. On-brand every time.
      </p>

      <div className="mt-8 grid gap-8 lg:grid-cols-[360px_1fr]">
        {/* Controls */}
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.name}
                onClick={() => {
                  setTag(p.tag);
                  setHeadline(p.headline);
                  setSubtext(p.subtext);
                }}
                className="glow-link rounded-full border border-[var(--color-line-strong)] px-3 py-1.5 text-xs font-medium text-[var(--color-ink-soft)]"
              >
                {p.name}
              </button>
            ))}
          </div>

          <Field label="Tag" value={tag} onChange={setTag} />
          <Field label="Headline" value={headline} onChange={setHeadline} textarea />
          <Field label="Subtext" value={subtext} onChange={setSubtext} textarea rows={4} />
          <Field label="Footer" value={footer} onChange={setFooter} />

          <button
            onClick={download}
            disabled={busy}
            className="w-full rounded-full bg-[var(--color-pine)] px-6 py-3 text-sm font-medium text-white transition-colors hover:bg-[var(--color-pine-deep)] disabled:opacity-60"
          >
            {busy ? "Rendering…" : "Download PNG"}
          </button>
          <p className="text-xs text-[var(--color-ink-faint)]">
            2400×1350 export (2×). Tip: 1200×675 also works as a Twitter/X post image.
          </p>
        </div>

        {/* Preview */}
        <div ref={wrapRef} className="overflow-hidden rounded-2xl border border-[var(--color-line)]" style={{ height: 675 * scale }}>
          <div style={{ transform: `scale(${scale})`, transformOrigin: "top left" }}>
            <PostCard ref={cardRef} tag={tag} headline={headline} subtext={subtext} footer={footer} />
          </div>
        </div>
      </div>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  textarea,
  rows = 2,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  textarea?: boolean;
  rows?: number;
}) {
  const cls =
    "mt-1 w-full rounded-xl border border-[var(--color-line-strong)] bg-[var(--color-paper)] px-4 py-2.5 text-sm text-[var(--color-ink)] focus:border-[var(--color-moss)] focus:outline-none";
  return (
    <label className="block">
      <span className="eyebrow">{label}</span>
      {textarea ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={rows} className={cls} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} className={cls} />
      )}
    </label>
  );
}

const PostCard = ({
  ref,
  tag,
  headline,
  subtext,
  footer,
}: {
  ref: React.Ref<HTMLDivElement>;
  tag: string;
  headline: string;
  subtext: string;
  footer: string;
}) => (
  <div
    ref={ref}
    style={{
      width: 1200,
      height: 675,
      position: "relative",
      overflow: "hidden",
      background: "linear-gradient(135deg, #ffffff 0%, #e9f7f1 100%)",
      fontFamily: "var(--font-jakarta), sans-serif",
    }}
  >
    {/* soft mint blobs */}
    <div style={{ position: "absolute", top: -160, right: -120, width: 520, height: 520, borderRadius: "50%", background: "radial-gradient(circle, #a3ddc5, transparent 62%)", opacity: 0.7 }} />
    <div style={{ position: "absolute", bottom: -200, left: 120, width: 480, height: 480, borderRadius: "50%", background: "radial-gradient(circle, #c9ecdb, transparent 60%)", opacity: 0.6 }} />
    {/* big faint ripple mark */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src="/logo.png" alt="" style={{ position: "absolute", right: -110, bottom: -110, width: 620, height: 620, opacity: 0.14 }} />

    {/* header */}
    <div style={{ position: "absolute", top: 56, left: 64, display: "flex", alignItems: "center", gap: 14 }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo.png" alt="" width={46} height={46} />
      <span className="serif" style={{ fontSize: 36, color: "#12211d" }}>poolscan</span>
    </div>

    {/* body */}
    <div style={{ position: "absolute", left: 64, top: 214, right: 300 }}>
      <p style={{ fontFamily: "var(--font-fragment), monospace", textTransform: "uppercase", letterSpacing: "0.22em", fontSize: 16, color: "#2f7d5b" }}>
        {tag}
      </p>
      <h2 className="serif" style={{ fontSize: 82, lineHeight: 1.02, letterSpacing: "-0.02em", color: "#12211d", margin: "18px 0 0" }}>
        {headline}
      </h2>
      <p style={{ fontSize: 27, lineHeight: 1.42, color: "#56655f", marginTop: 22 }}>{subtext}</p>
    </div>

    {/* footer */}
    <div style={{ position: "absolute", left: 64, bottom: 50, fontSize: 19, color: "#93a49c" }}>{footer}</div>
  </div>
);

PostCard.displayName = "PostCard";

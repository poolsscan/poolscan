import type { SafetyTier } from "@/lib/types";
import { TIER_UI } from "@/lib/ui";

interface Props {
  score: number;
  tier: SafetyTier;
  size?: number;
  showLabel?: boolean;
}

/** Compact radial "depth reading" — the safety score as a sounded gauge. */
export default function DepthBadge({ score, tier, size = 44, showLabel = false }: Props) {
  const stroke = Math.max(3, size * 0.085);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const progress = Math.max(0, Math.min(100, score)) / 100;
  const ui = TIER_UI[tier];

  return (
    <div className="inline-flex items-center gap-2.5">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`Depth ${score} of 100 — ${ui.label}`}
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-mint-2)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={ui.color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * progress} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x="50%"
          y="52%"
          dominantBaseline="middle"
          textAnchor="middle"
          fill="var(--color-ink)"
          className="nums"
          style={{ fontSize: size * 0.34, fontWeight: 600 }}
        >
          {score}
        </text>
      </svg>
      {showLabel && (
        <span className="eyebrow" style={{ color: ui.color, letterSpacing: "0.16em" }}>
          {ui.short}
        </span>
      )}
    </div>
  );
}

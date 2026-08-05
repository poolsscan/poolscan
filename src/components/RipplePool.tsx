const RINGS = [54, 104, 152, 188];

// Soft "detections" floating on the pool — deterministic so SSR/CSR match.
const DOTS = [
  { x: 150, y: 250, color: "var(--color-depth-deep)" },
  { x: 268, y: 150, color: "var(--color-depth-wade)" },
  { x: 250, y: 268, color: "var(--color-depth-deep)" },
  { x: 128, y: 150, color: "var(--color-depth-shallow)" },
];

/**
 * Signature visual — concentric water ripples spreading from a single drop,
 * the calm counterpart to "sound the depth before you dive in". Pure SVG + CSS,
 * ripples freeze under reduced motion.
 */
export default function RipplePool() {
  return (
    <svg
      viewBox="0 0 400 400"
      className="w-full h-auto"
      role="img"
      aria-label="Water ripples spreading across a calm pool"
    >
      <defs>
        <radialGradient id="poolFace" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--color-mint-1)" stopOpacity="0.9" />
          <stop offset="70%" stopColor="var(--color-mint-1)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--color-paper)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Pool surface */}
      <circle cx="200" cy="200" r="196" fill="url(#poolFace)" />

      {/* Still concentric rings */}
      {RINGS.map((r) => (
        <circle
          key={r}
          cx="200"
          cy="200"
          r={r}
          fill="none"
          stroke="var(--color-mint-3)"
          strokeWidth="1.25"
          opacity="0.6"
        />
      ))}

      {/* Expanding ripples from the drop */}
      {[0, 1.7, 3.3].map((delay, i) => (
        <circle
          key={i}
          cx="200"
          cy="200"
          r="188"
          fill="none"
          stroke="var(--color-moss)"
          strokeWidth="1.5"
          className="animate-ripple-out"
          style={{ transformBox: "fill-box", transformOrigin: "center", animationDelay: `${delay}s`, opacity: 0 }}
        />
      ))}

      {/* Floating detections */}
      {DOTS.map((d, i) => (
        <g key={i}>
          <circle cx={d.x} cy={d.y} r="9" fill={d.color} opacity="0.14" />
          <circle cx={d.x} cy={d.y} r="3.5" fill={d.color} />
        </g>
      ))}

      {/* The drop */}
      <circle cx="200" cy="200" r="16" fill="var(--color-moss)" opacity="0.12" />
      <circle cx="200" cy="200" r="5.5" fill="var(--color-pine)" />
    </svg>
  );
}

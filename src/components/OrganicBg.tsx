/**
 * Ambient background — soft, flowing mint blobs on white. Calm and organic,
 * echoing the fluid language of the reference brand. Pure CSS, gently animated,
 * frozen under reduced motion. Decorative only.
 */
const BLOBS = [
  {
    className: "animate-float",
    style: {
      top: "-18%",
      left: "-10%",
      width: "60vw",
      height: "60vw",
      background: "radial-gradient(circle at 40% 40%, var(--color-mint-3), transparent 62%)",
      borderRadius: "48% 52% 58% 42% / 55% 46% 54% 45%",
    },
  },
  {
    className: "animate-drift",
    style: {
      top: "-8%",
      right: "-14%",
      width: "52vw",
      height: "52vw",
      background: "radial-gradient(circle at 55% 45%, var(--color-mint-2), transparent 60%)",
      borderRadius: "56% 44% 47% 53% / 42% 55% 45% 58%",
    },
  },
  {
    className: "animate-float",
    style: {
      bottom: "-24%",
      left: "22%",
      width: "58vw",
      height: "58vw",
      background: "radial-gradient(circle at 50% 50%, var(--color-mint-1), transparent 58%)",
      borderRadius: "50% 50% 44% 56% / 52% 48% 52% 48%",
    },
  },
];

export default function OrganicBg() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
      {BLOBS.map((b, i) => (
        <div
          key={i}
          className={`absolute ${b.className}`}
          style={{ ...b.style, filter: "blur(56px)", opacity: 0.85 }}
        />
      ))}
    </div>
  );
}

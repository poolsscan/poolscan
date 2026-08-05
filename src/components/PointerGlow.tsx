"use client";

import { useRef, type ReactNode } from "react";

/**
 * Wraps a group of menu links and renders a soft green glow that follows the
 * cursor across them (see .pointer-glow in globals.css).
 */
export default function PointerGlow({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={ref}
      onMouseMove={(e) => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        el.style.setProperty("--mx", `${e.clientX - r.left}px`);
        el.style.setProperty("--my", `${e.clientY - r.top}px`);
      }}
      className={`pointer-glow ${className}`}
    >
      {children}
    </div>
  );
}

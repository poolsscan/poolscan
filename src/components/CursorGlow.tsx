"use client";

import { useEffect, useRef } from "react";

/**
 * A soft green dot that trails the pointer and swells over interactive
 * elements. Desktop only — hidden on touch and under reduced motion (see
 * .cursor-dot in globals.css). Purely decorative.
 */
export default function CursorGlow() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(hover: none)").matches) return;

    let raf = 0;
    let x = -100;
    let y = -100;
    let cx = -100;
    let cy = -100;

    const onMove = (e: MouseEvent) => {
      x = e.clientX;
      y = e.clientY;
      el.classList.add("is-visible");
      const t = e.target as HTMLElement | null;
      el.classList.toggle("is-active", !!t?.closest?.("a, button, input, [role='button']"));
    };
    const onLeave = () => el.classList.remove("is-visible");

    const tick = () => {
      // ease toward the pointer for a smooth trail
      cx += (x - cx) * 0.18;
      cy += (y - cy) * 0.18;
      el.style.transform = `translate3d(${cx}px, ${cy}px, 0)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    window.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseleave", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
    };
  }, []);

  return <div ref={ref} className="cursor-dot" aria-hidden />;
}

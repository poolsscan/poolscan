import type { SafetyReport } from "@/lib/types";
import { factorColor } from "@/lib/ui";

export default function SafetyBreakdown({ report }: { report: SafetyReport }) {
  return (
    <ul className="divide-y divide-[var(--color-line)]">
      {report.factors.map((f) => {
        const color = factorColor(f.status);
        const isUnknown = f.status === "unknown";
        const fill = Math.max(0, Math.min(1, f.points / f.weight));
        return (
          <li key={f.key} className={`flex items-center gap-4 py-3.5 ${isUnknown ? "opacity-60" : ""}`}>
            <span
              className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full"
              style={
                isUnknown
                  ? { border: `1.5px dashed ${color}` }
                  : { background: color }
              }
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-semibold text-[var(--color-ink)]">{f.label}</p>
                <span className="nums shrink-0 text-xs text-[var(--color-ink-faint)]">
                  {isUnknown ? "not scored" : `${f.points.toFixed(0)}/${f.weight}`}
                </span>
              </div>
              <p className="text-sm text-[var(--color-ink-soft)]">{f.detail}</p>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--color-mint-2)]">
                {!isUnknown && (
                  <div className="h-full rounded-full" style={{ width: `${fill * 100}%`, background: color }} />
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

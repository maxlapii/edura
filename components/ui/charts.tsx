import { cn } from "@/lib/utils";

export interface BarDatum {
  label: string;
  /** 0–max: the solid part of the bar */
  value: number;
  /** optional total – the rest is drawn hatched above the solid part */
  total?: number;
  tooltip?: React.ReactNode;
}

/**
 * Pill bar chart from the reference ("Messages By Month"): light-blue solid part with a hatched
 * remainder on top; the highlighted bar is solid blue and shows a dark tooltip.
 */
export function PillBarChart({ data, max, highlight, className, height = "h-44 2xl:h-56" }: { data: BarDatum[]; max?: number; highlight?: number; className?: string; height?: string }) {
  const top = max ?? Math.max(1, ...data.map((d) => d.total ?? d.value));
  const hi = highlight ?? data.length - 1;
  return (
    <div className={cn("flex items-end gap-2 pt-12 sm:gap-3", height, className)}>
      {data.map((d, i) => {
        const total = d.total ?? d.value;
        const totalPct = Math.max(6, (total / top) * 100);
        const valuePct = total ? (d.value / total) * 100 : 0;
        const active = i === hi;
        return (
          <div key={`${d.label}-${i}`} className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-2">
            {active && d.tooltip && (
              totalPct > 60 ? (
                // Tall bar: sit beside it so the tooltip never covers the card header.
                <div className="pointer-events-none absolute right-[calc(50%+30px)] top-0 z-10 whitespace-nowrap rounded-xl bg-ink px-3 py-2 text-[11px] leading-snug text-white shadow-pop">
                  {d.tooltip}
                  <span className="absolute -right-1 top-4 h-2 w-2 rotate-45 bg-ink" aria-hidden />
                </div>
              ) : (
                <div className="pointer-events-none absolute z-10 -translate-y-2 whitespace-nowrap rounded-xl bg-ink px-3 py-2 text-[11px] leading-snug text-white shadow-pop" style={{ bottom: `calc(${totalPct}% * 0.86 + 1.9rem)` }}>
                  {d.tooltip}
                  <span className="absolute -bottom-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-ink" aria-hidden />
                </div>
              )
            )}
            <div className="relative flex w-full max-w-[44px] flex-col justify-end overflow-hidden rounded-[14px] hatch" style={{ height: `${totalPct}%` }} title={`${d.label}: ${d.value}${d.total !== undefined ? ` / ${d.total}` : ""}`}>
              <div className={cn("w-full rounded-[14px] transition-colors", active ? "bg-brand-500" : "bg-brand-200 group-hover:bg-brand-300")} style={{ height: `${valuePct}%` }} />
            </div>
            <span className={cn("text-[11px]", active ? "font-medium text-brand-600" : "text-muted")}>{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

/** White rounded bars on the blue "ocean" card; the last bar is hatched. */
export function OceanBars({ data, className }: { data: Array<{ label: string; value: number }>; className?: string }) {
  const top = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className={cn("flex h-40 items-end gap-2", className)}>
      {data.map((d, i) => {
        const last = i === data.length - 1;
        return (
          <div key={`${d.label}-${i}`} className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5" title={`${d.label}: ${d.value}`}>
            {last && <span className="h-1.5 w-1.5 rounded-full bg-accent-500" aria-hidden />}
            <div className={cn("w-full max-w-[22px] rounded-full", last ? "hatch-light border border-white/70" : "bg-white")} style={{ height: `${Math.max(8, (d.value / top) * 100)}%` }} />
            <span className="max-w-full truncate text-[10px] text-white/80">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

/** Donut with rounded segment caps and percentage callouts (reference "Messages By Type"). */
export function DonutChart({ segments, size = 150, thickness = 16, className }: { segments: DonutSegment[]; size?: number; thickness?: number; className?: string }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const gap = total > 0 && segments.filter((s) => s.value > 0).length > 1 ? 10 : 0;
  const lens = segments.map((s) => (total ? (s.value / total) * c : 0));
  const arcs = segments.map((s, i) => ({ ...s, len: lens[i], start: lens.slice(0, i).reduce((a, b) => a + b, 0) }));
  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="-rotate-90" role="img" aria-label="Distribution chart">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef1f5" strokeWidth={thickness} />
        {arcs.map((a) =>
          a.len > 0 ? (
            <circle
              key={a.label}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={a.color}
              strokeWidth={thickness}
              strokeLinecap="round"
              strokeDasharray={`${Math.max(0.01, a.len - gap)} ${c}`}
              strokeDashoffset={-(a.start + gap / 2)}
            />
          ) : null,
        )}
      </svg>
      {arcs.map((a) => {
        if (!total || a.len === 0 || a.value / total < 0.06) return null;
        const mid = ((a.start + a.len / 2) / c) * 2 * Math.PI - Math.PI / 2;
        const px = size / 2 + Math.cos(mid) * r;
        const py = size / 2 + Math.sin(mid) * r;
        return (
          <span key={`l-${a.label}`} className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-ink shadow-sm" style={{ left: px, top: py }}>
            {Math.round((a.value / total) * 100)}%
          </span>
        );
      })}
    </div>
  );
}

/** Stacked mini bars like the left of the reference "Top Contacts" card. */
export function StackBars({ values, colors, className }: { values: number[]; colors: string[]; className?: string }) {
  const top = Math.max(1, ...values);
  return (
    <div className={cn("flex w-10 shrink-0 flex-col justify-end gap-1.5", className)} aria-hidden>
      {values.map((v, i) => (
        <span key={i} className="block rounded-md" style={{ background: colors[i % colors.length], height: `${Math.max(8, (v / top) * 28)}px` }} />
      ))}
      <span className="block h-14 rounded-md hatch" />
    </div>
  );
}

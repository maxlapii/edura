/** Server-safe SVG line/area chart with a smooth curve (no client JS). */
export function LineChart({
  points,
  labels,
  max,
  height = 180,
  color,
  format = (v: number) => String(v),
  className,
  variant = "light",
  axis = true,
}: {
  points: number[];
  labels?: string[];
  max?: number;
  height?: number;
  color?: string;
  format?: (v: number) => string;
  className?: string;
  variant?: "light" | "dark";
  axis?: boolean;
}) {
  const dark = variant === "dark";
  const stroke = color ?? (dark ? "#ffffff" : "var(--color-brand-500)");
  const width = 600;
  const padL = axis ? 36 : 6;
  const padR = 10;
  const padT = 12;
  const padB = labels ? 26 : 10;
  const n = points.length;
  const top = max ?? Math.max(1, ...points);
  const x = (i: number) => padL + (n <= 1 ? 0 : (i * (width - padL - padR)) / (n - 1));
  const y = (v: number) => padT + (height - padT - padB) * (1 - v / top);
  const coords = points.map((v, i) => [x(i), y(v)] as const);
  let d = "";
  coords.forEach(([cx, cy], i) => {
    if (i === 0) {
      d += `M ${cx} ${cy}`;
      return;
    }
    const [px, py] = coords[i - 1];
    const cpx = (px + cx) / 2;
    d += ` C ${cpx} ${py}, ${cpx} ${cy}, ${cx} ${cy}`;
  });
  const id = `lc-${variant}-${n}-${Math.round(top)}`;
  const tickColor = dark ? "rgb(255 255 255 / 0.45)" : "#9aa0ac";
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className={className ?? "h-44 w-full"} role="img" aria-label="Trend chart" preserveAspectRatio="none">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={dark ? 0.35 : 0.18} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      {axis &&
        Array.from({ length: 5 }, (_, i) => {
          const v = (top / 4) * i;
          const yy = y(v);
          return (
            <g key={i}>
              <line x1={padL} x2={width - padR} y1={yy} y2={yy} stroke={dark ? "rgb(255 255 255 / 0.08)" : "#eef0f4"} strokeWidth={1} />
              <text x={padL - 8} y={yy + 4} textAnchor="end" fontSize={10} fill={tickColor}>
                {format(Math.round(v))}
              </text>
            </g>
          );
        })}
      {n > 1 && (
        <>
          <path d={`${d} L ${x(n - 1)} ${y(0)} L ${x(0)} ${y(0)} Z`} fill={`url(#${id})`} />
          <path d={d} fill="none" stroke={stroke} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </>
      )}
      {n > 0 && <circle cx={coords[n - 1][0]} cy={coords[n - 1][1]} r={4} fill={dark ? "#ffffff" : "white"} stroke={stroke} strokeWidth={2} />}
      {labels?.map((l, i) => (
        <text key={i} x={x(i)} y={height - 8} textAnchor="middle" fontSize={10} fill={tickColor}>
          {l}
        </text>
      ))}
    </svg>
  );
}

import Link from "next/link";
import { Plus } from "lucide-react";
import type { ReactNode } from "react";
import { DeltaPill, GripIcon } from "@/components/ui";
import { OceanBars, PillBarChart } from "@/components/ui/charts";
import { LineChart } from "@/components/ui/line-chart";
import { cn } from "@/lib/utils";

export function greeting(now = new Date()) {
  const h = now.getHours();
  return h < 12 ? "Good Morning" : h < 18 ? "Good Afternoon" : "Good Evening";
}

export function DashboardGreeting({ name, subtitle, children }: { name: string; subtitle: string; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="truncate font-display text-[30px] leading-tight text-ink sm:text-[34px]">
          {greeting()}, {name.split(" ")[0]}
        </h1>
        <p className="text-sm text-muted">{subtitle}</p>
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/** Small non-interactive period label, styled like the reference's "This Week" selector. */
export function PeriodChip({ children }: { children: ReactNode }) {
  return <span className="inline-flex h-8 items-center rounded-full border border-slate-200 px-3 text-xs font-medium text-ink">{children}</span>;
}

/** Blue gradient card with white bars ("Contacts" in the reference). */
export function OceanCard({ title, value, sub, delta, bars, href }: { title: string; value: ReactNode; sub: ReactNode; delta?: ReactNode; bars: Array<{ label: string; value: number }>; href?: string }) {
  const body = (
    <div className="surface-ocean flex h-full min-h-[260px] flex-col overflow-hidden rounded-card p-5 text-white shadow-card">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-white/90">{title}</span>
        <GripIcon className="text-white/60" />
      </div>
      <div className="mt-3 font-display text-[34px] leading-none tabular-nums">{value}</div>
      <div className="mt-1.5 flex items-center gap-2 text-xs text-white/80">
        {sub}
        {delta && <DeltaPill tone="dark" trend="up">{delta}</DeltaPill>}
      </div>
      <OceanBars data={bars} className="mt-auto pt-6" />
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full transition hover:-translate-y-0.5">
      {body}
    </Link>
  ) : (
    body
  );
}

/** White count card with a round "+" action ("Credits" in the reference). */
export function CountCard({ icon, title, value, sub, actionHref, actionLabel }: { icon: ReactNode; title: string; value: ReactNode; sub?: ReactNode; actionHref: string; actionLabel: string }) {
  return (
    <div className="rounded-card bg-white p-5 shadow-card">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-50 text-brand-600 [&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
        <span className="flex-1 text-sm font-medium text-ink">{title}</span>
        <GripIcon />
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <span className="font-display text-[32px] leading-none tabular-nums text-ink">{value}</span>
          {sub && <span className="text-xs text-muted">{sub}</span>}
        </div>
        <Link href={actionHref} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-white transition hover:bg-black" aria-label={actionLabel} title={actionLabel}>
          <Plus className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

/** Dark card with a white area line ("Texts Sent" in the reference). */
export function DarkTrendCard({ title, value, sub, delta, points, labels, chip }: { title: string; value: ReactNode; sub: ReactNode; delta?: ReactNode; points: number[]; labels: string[]; chip?: ReactNode }) {
  return (
    <div className="flex min-h-[190px] flex-col overflow-hidden rounded-card bg-ink p-5 text-white shadow-card">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-white/90">{title}</span>
        {chip && <span className="rounded-full border border-white/20 px-3 py-1 text-[11px] text-white/80">{chip}</span>}
      </div>
      <div className="mt-3 font-display text-[32px] leading-none tabular-nums">{value}</div>
      <div className="mt-1.5 flex items-center gap-2 text-xs text-white/70">
        {sub}
        {delta && <DeltaPill tone="dark" trend="up">{delta}</DeltaPill>}
      </div>
      <LineChart points={points} labels={labels} variant="dark" axis={false} height={110} className="mt-auto h-24 w-full pt-2" />
    </div>
  );
}

/** Daily attendance as pill bars with a dark tooltip on the latest day. */
export function AttendanceBars({ trend }: { trend: Array<{ date: string; rate: number | null; total: number }> }) {
  const days = trend.filter((t) => t.rate !== null);
  if (days.length === 0) return <p className="py-10 text-center text-sm text-muted">No attendance recorded in the last two weeks.</p>;
  const fmt = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
  return (
    <PillBarChart
      data={days.map((d) => ({
        label: fmt(d.date).replace(" ", " "),
        value: d.rate ?? 0,
        total: 100,
        tooltip: (
          <>
            <div className="font-semibold">{d.rate}% present</div>
            <div className="flex items-center gap-1.5 text-white/80">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-400" /> {d.total} records
            </div>
            <div className="text-white/60">{fmt(d.date)}</div>
          </>
        ),
      }))}
      max={100}
    />
  );
}

export function rateAverage(trend: Array<{ rate: number | null }>) {
  const v = trend.filter((t) => t.rate !== null);
  return v.length ? Math.round(v.reduce((s, t) => s + (t.rate ?? 0), 0) / v.length) : null;
}

export function ListCard({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex h-full flex-col rounded-card bg-white p-5 shadow-card", className)}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-medium text-ink">{title}</h2>
        {action ?? <GripIcon />}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </section>
  );
}

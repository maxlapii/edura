import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

/** Month grid with today highlighted and dots for marked dates (YYYY-MM-DD). Server component. */
export function MiniCalendar({ today, marks = [], hrefFor }: { today: Date; marks?: string[]; hrefFor?: (isoDate: string) => string }) {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const first = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const offset = (first.getUTCDay() + 6) % 7;
  const markSet = new Set(marks);
  const iso = (d: number) => `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const todayIso = today.toISOString().slice(0, 10);
  const cells: Array<number | null> = [...Array.from({ length: offset }, () => null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const monthLabel = first.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg text-ink">{monthLabel}</h2>
        <div className="flex items-center gap-1 text-muted">
          <Link href="/calendar" className="rounded-full p-1 hover:bg-slate-100" aria-label="Previous month">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <Link href="/calendar" className="rounded-full p-1 hover:bg-slate-100" aria-label="Next month">
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-y-1 text-center text-[11px]">
        {DAYS.map((d) => (
          <div key={d} className="py-1 font-medium text-muted">
            {d}
          </div>
        ))}
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} />;
          const date = iso(d);
          const isToday = date === todayIso;
          const marked = markSet.has(date);
          const inner = (
            <span className={cn("relative mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs", isToday ? "bg-brand-500 font-semibold text-white" : "text-slate-700 hover:bg-slate-100")}>
              {d}
              {marked && !isToday && <span className="absolute -bottom-0.5 h-1 w-1 rounded-full bg-accent-500" aria-hidden />}
            </span>
          );
          return hrefFor ? (
            <Link key={date} href={hrefFor(date)} aria-label={date}>
              {inner}
            </Link>
          ) : (
            <div key={date}>{inner}</div>
          );
        })}
      </div>
    </div>
  );
}

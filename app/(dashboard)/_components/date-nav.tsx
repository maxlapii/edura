import Link from "next/link";
import { buttonClasses, Input } from "@/components/ui";
import { fmtLongDate } from "@/lib/format";
import { shiftDate, ymd } from "../_lib/helpers";

/** Previous / next day links plus a date picker (GET form) that sets `?date=`. */
export function DateNav({ date, basePath, hidden = {} }: { date: Date; basePath: string; hidden?: Record<string, string | undefined> }) {
  const extra = Object.entries(hidden).filter(([, v]) => v);
  const extraQs = extra.map(([k, v]) => `&${k}=${encodeURIComponent(v!)}`).join("");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={`${basePath}?date=${shiftDate(date, -1)}${extraQs}`} className={buttonClasses("outline", "sm")} aria-label="Previous day">
        ←
      </Link>
      <form method="get" action={basePath} className="flex items-center gap-2">
        {extra.map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
        <Input type="date" name="date" defaultValue={ymd(date)} className="w-auto" aria-label="Date" />
        <button type="submit" className={buttonClasses("secondary", "sm")}>
          Go
        </button>
      </form>
      <Link href={`${basePath}?date=${shiftDate(date, 1)}${extraQs}`} className={buttonClasses("outline", "sm")} aria-label="Next day">
        →
      </Link>
      <Link href={`${basePath}?date=${ymd(new Date())}${extraQs}`} className="text-sm text-brand-700 hover:underline">
        Today
      </Link>
      <span className="text-sm text-slate-500">{fmtLongDate(date)}</span>
    </div>
  );
}

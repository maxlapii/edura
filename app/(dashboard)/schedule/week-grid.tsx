import Link from "next/link";
import type { weeklySchedule } from "@/modules/timetable";
import { DAY_SHORT } from "@/lib/format";

type Slot = Awaited<ReturnType<typeof weeklySchedule>>[number];
type Period = { id: string; name: string; order: number; startTime: string; endTime: string };

/** Days × periods grid. Cells link to the class hub for teachers. */
export function WeekGrid({ slots, periods, linkCourses, highlightDay }: { slots: Slot[]; periods: Period[]; linkCourses: boolean; highlightDay?: number }) {
  const maxDay = Math.max(5, ...slots.map((s) => s.dayOfWeek));
  const days = Array.from({ length: maxDay }, (_, i) => i + 1);
  const rows: Period[] = periods.length ? periods : [...new Map(slots.map((s) => [s.period.id, s.period])).values()].sort((a, b) => a.order - b.order);
  const byKey = new Map<string, Slot[]>();
  for (const s of slots) {
    const k = `${s.dayOfWeek}:${s.period.id}`;
    byKey.set(k, [...(byKey.get(k) ?? []), s]);
  }
  if (rows.length === 0) return <p className="text-sm text-slate-500">No timetable has been published yet.</p>;
  return (
    <div className="overflow-x-auto rounded-card bg-white shadow-card">
      <table className="min-w-full text-xs">
        <thead className="bg-slate-50 text-left font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-2 py-2">Period</th>
            {days.map((d) => (
              <th key={d} className={`px-2 py-2 ${d === highlightDay ? "text-brand-700" : ""}`}>
                {DAY_SHORT[d]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((p) => (
            <tr key={p.id}>
              <td className="whitespace-nowrap px-2 py-2 align-top text-slate-600">
                <div className="font-medium text-slate-800">{p.name}</div>
                {p.startTime}–{p.endTime}
              </td>
              {days.map((d) => {
                const cell = byKey.get(`${d}:${p.id}`) ?? [];
                return (
                  <td key={d} className={`min-w-[8rem] px-2 py-2 align-top ${d === highlightDay ? "bg-brand-50/40" : ""}`}>
                    {cell.map((s) => {
                      const body = (
                        <>
                          <div className="font-medium text-slate-900">{s.course.subject.name}</div>
                          <div className="text-slate-500">
                            {s.course.class.name}
                            {s.room ? ` · ${s.room.name}` : ""}
                          </div>
                          {!linkCourses && <div className="text-slate-500">{s.course.teacher.user.name}</div>}
                        </>
                      );
                      return linkCourses ? (
                        <Link key={s.id} href={`/classes/${s.course.id}`} className="block rounded-md border border-slate-200 bg-slate-50 px-2 py-1 hover:border-brand-300 hover:bg-brand-50">
                          {body}
                        </Link>
                      ) : (
                        <div key={s.id} className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1">
                          {body}
                        </div>
                      );
                    })}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

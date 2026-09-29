import Link from "next/link";
import type { ReactNode } from "react";
import { DAY_SHORT } from "@/lib/format";
import { ActionButton } from "./action-button";

export interface GridPeriod {
  id: string;
  name: string;
  order: number;
  startTime: string;
  endTime: string;
}

export interface GridSlot {
  id: string;
  dayOfWeek: number;
  periodId: string;
  room: { id: string; name: string } | null;
  course: {
    id: string;
    subject: { id: string; name: string; code: string };
    class: { id: string; name: string; _count?: { students: number } };
    teacher: { id: string; user: { id: string; name: string } };
  };
}

/**
 * Week grid (periods × days). Cells link to the class / teacher timetable views.
 * `editable` adds a delete button per lesson (DELETE /api/timetable/[id]).
 */
export function ScheduleGrid({ slots, periods, show = ["subject", "class", "teacher", "room"], editable, days, empty }: { slots: GridSlot[]; periods: GridPeriod[]; show?: Array<"subject" | "class" | "teacher" | "room">; editable?: boolean; days?: number[]; empty?: ReactNode }) {
  const maxDay = Math.max(5, ...slots.map((s) => s.dayOfWeek));
  const dayList = days ?? Array.from({ length: maxDay }, (_, i) => i + 1);
  const usedPeriods = periods.length ? periods : [];
  if (!slots.length && empty) return <>{empty}</>;
  return (
    <div className="overflow-x-auto rounded-card bg-white shadow-card">
      <table className="min-w-full text-xs">
        <thead className="bg-slate-50 text-left font-semibold uppercase tracking-wide text-slate-500">
          <tr>
            <th className="w-28 px-2 py-2">Period</th>
            {dayList.map((d) => (
              <th key={d} className="px-2 py-2">
                {DAY_SHORT[d]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {usedPeriods.map((p) => (
            <tr key={p.id} className="align-top">
              <td className="px-2 py-2 text-slate-600">
                <div className="font-medium text-slate-800">{p.name}</div>
                <div>
                  {p.startTime}–{p.endTime}
                </div>
              </td>
              {dayList.map((d) => {
                const cell = slots.filter((s) => s.dayOfWeek === d && s.periodId === p.id);
                return (
                  <td key={d} className="px-2 py-2">
                    {cell.map((s) => (
                      <div key={s.id} className="mb-1 rounded-md border border-brand-100 bg-brand-50 px-2 py-1 last:mb-0" data-testid="slot" data-id={s.id}>
                        {show.includes("subject") && <div className="font-medium text-brand-900">{s.course.subject.name}</div>}
                        {show.includes("class") && (
                          <Link href={`/admin/classes/${s.course.class.id}`} className="block text-slate-700 hover:underline">
                            {s.course.class.name}
                            {s.course.class._count ? ` · ${s.course.class._count.students} students` : ""}
                          </Link>
                        )}
                        {show.includes("teacher") && (
                          <Link href={`/admin/teachers/${s.course.teacher.id}`} className="block text-slate-600 hover:underline">
                            {s.course.teacher.user.name}
                          </Link>
                        )}
                        {show.includes("room") && <div className="text-slate-500">{s.room ? s.room.name : "No room"}</div>}
                        {editable && <ActionButton action={`/api/timetable/${s.id}`} method="DELETE" label="Remove" variant="ghost" confirm="Remove this lesson from the timetable?" testId="delete-slot" className="mt-1 inline-flex flex-col" />}
                      </div>
                    ))}
                  </td>
                );
              })}
            </tr>
          ))}
          {usedPeriods.length === 0 && (
            <tr>
              <td colSpan={dayList.length + 1} className="px-3 py-6 text-center text-slate-500">
                No periods defined. Add periods under School settings first.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

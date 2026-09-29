import Link from "next/link";
import type { teacherDashboard } from "@/modules/dashboards/service";
import { BarRow, DeltaPill, LegendRow, StatCard, StatusBadge } from "@/components/ui";
import { DonutChart, StackBars } from "@/components/ui/charts";
import { fmtDate, fmtDateTime, fmtLongDate } from "@/lib/format";
import { Bot, CheckSquare, ClipboardCheck, GraduationCap } from "lucide-react";
import { AttendanceBars, CountCard, DarkTrendCard, DashboardGreeting, ListCard, OceanCard, PeriodChip, rateAverage } from "./widgets";

type Data = Awaited<ReturnType<typeof teacherDashboard>>;

const STATUS_COLORS = { PRESENT: "#222026", LATE: "#43E7D4", ABSENT: "#1B87E1", EXCUSED: "#b9c2cf" };
const DOTS = ["#1B87E1", "#43E7D4", "#7fbbf0", "#222026"];

export function TeacherDashboard({ data, name }: { data: Data; name: string }) {
  const next = data.nextLesson;
  const own = data.schedule.lessons.filter((l) => !(l.kind === "OWN" && l.coveredBy));
  const recorded = own.filter((l) => l.attendanceSession?.status === "SUBMITTED").length;
  const recordedPct = own.length ? Math.round((recorded / own.length) * 100) : 100;
  const toGrade = data.pendingGrading.reduce((s, r) => s + r.pending, 0);
  const avg = rateAverage(data.attendanceTrend);
  const s = data.attendanceStatus;
  const statusTotal = s.PRESENT + s.LATE + s.ABSENT + s.EXCUSED;
  const totals = data.attendanceTrend.filter((t) => t.total > 0);
  const studentsTotal = data.myClasses.reduce((acc, c) => acc + c.students, 0);
  const classBars = data.myClasses.map((c) => ({ label: c.className, value: c.students }));
  const topGrading = data.pendingGrading.slice(0, 3);

  return (
    <div className="space-y-5">
      <DashboardGreeting name={name} subtitle={`What do I need to do today? · ${fmtLongDate(data.today)}`}>
        {next ? (
          <Link href={`/classes/${next.slot.course.id}`} className="flex items-center gap-3 rounded-full bg-white py-1.5 pl-1.5 pr-4 shadow-card hover:bg-slate-50">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-500 text-xs font-semibold text-white">{next.slot.period.startTime}</span>
            <span className="text-sm leading-tight">
              <span className="block text-[11px] text-muted">Next lesson</span>
              <span className="block font-medium text-ink">
                {next.slot.course.subject.name} · {next.slot.course.class.name}
              </span>
            </span>
          </Link>
        ) : (
          <span className="rounded-full bg-white px-4 py-2 text-sm text-muted shadow-card">No more lessons today</span>
        )}
      </DashboardGreeting>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(280px,340px)]">
        {/* Row 1 */}
        <StatCard label="Attendance taken today" value={`${recordedPct}%`} hint={`${recorded}/${own.length} lessons`} tone={data.pendingAttendance.length ? "warn" : "good"} icon={<ClipboardCheck />} progress={recordedPct} aside={data.pendingAttendance.length ? `${data.pendingAttendance.length} to take` : "All recorded"} href="/attendance" />
        <StatCard label="Waiting to grade" value={toGrade} hint={`${data.pendingGrading.length} assignment${data.pendingGrading.length === 1 ? "" : "s"}`} tone={toGrade ? "info" : "good"} icon={<GraduationCap />} progress={data.missingSubmissions ? Math.min(100, (toGrade / (toGrade + data.missingSubmissions)) * 100) : toGrade ? 100 : 0} aside={`${data.missingSubmissions} missing`} href="/grades" />
        <div className="xl:row-span-3">
          <div className="grid h-full grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-1 xl:grid-rows-[minmax(260px,1fr)_auto_auto]">
            <OceanCard title="My students" value={studentsTotal} sub={`${data.myClasses.length} course${data.myClasses.length === 1 ? "" : "s"}`} delta={avg !== null ? `${avg}% attendance` : undefined} bars={classBars.length ? classBars : [{ label: "—", value: 0 }]} href="/classes" />
            <CountCard icon={<CheckSquare />} title="Open tasks" value={data.tasks.length} sub={data.overdueTasks ? `${data.overdueTasks} overdue` : "on track"} actionHref="/tasks" actionLabel="Add a task" />
            <DarkTrendCard title="Attendance records" value={totals.reduce((acc, t) => acc + t.total, 0).toLocaleString("en-GB")} sub="in your classes" delta={avg !== null ? `${avg}% avg` : undefined} chip="14 days" points={totals.map((t) => t.total)} labels={totals.map((t, i) => (i === 0 || i === totals.length - 1 ? fmtDate(t.date).slice(5).replace("-", "/") : ""))} />
          </div>
        </div>

        {/* Row 2 */}
        <ListCard title="Today's classes" action={<Link href="/schedule" className="text-xs font-medium text-brand-600 hover:underline">Schedule ›</Link>}>
          {data.schedule.lessons.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted">No lessons today.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.schedule.lessons.slice(0, 4).map((l, i) => {
                const covered = l.kind === "OWN" && l.coveredBy;
                const done = l.attendanceSession?.status === "SUBMITTED";
                return (
                  <BarRow
                    key={`${l.kind}-${l.slot.id}`}
                    index={i}
                    meta={`${l.slot.period.startTime} – ${l.slot.period.endTime} · ${l.slot.room?.name ?? "No room"}`}
                    title={`${l.slot.course.subject.name} · ${l.slot.course.class.name}`}
                    subtitle={l.kind === "SUBSTITUTION" ? `Covering for ${l.coveringFor.user.name}` : covered ? `Covered by ${l.coveredBy!.user.name}` : undefined}
                    action={
                      done ? (
                        <StatusBadge status="SUBMITTED" />
                      ) : covered ? (
                        <StatusBadge status="ASSIGNED" />
                      ) : (
                        <Link href={`/attendance/take?courseId=${l.slot.course.id}&slotId=${l.slot.id}&date=${fmtDate(data.today)}`} className="rounded-full bg-ink px-3 py-1 text-xs font-medium text-white hover:bg-black">
                          Attendance
                        </Link>
                      )
                    }
                  />
                );
              })}
            </div>
          )}
        </ListCard>
        <ListCard title="My attendance by status" action={<PeriodChip>Last 30 days</PeriodChip>}>
          {statusTotal === 0 ? (
            <p className="py-8 text-center text-sm text-muted">No attendance recorded yet.</p>
          ) : (
            <div className="flex items-center gap-5">
              <DonutChart segments={(Object.keys(STATUS_COLORS) as Array<keyof typeof STATUS_COLORS>).map((k) => ({ label: k, value: s[k], color: STATUS_COLORS[k] }))} size={140} />
              <div className="min-w-0 flex-1">
                <LegendRow color={STATUS_COLORS.PRESENT} label="Present" hint={<DeltaPill>{Math.round((s.PRESENT / statusTotal) * 100)}%</DeltaPill>} />
                <LegendRow color={STATUS_COLORS.LATE} label="Late" hint={<DeltaPill tone="mint">{s.LATE}</DeltaPill>} />
                <LegendRow color={STATUS_COLORS.ABSENT} label="Absent" hint={<DeltaPill tone="rose">{s.ABSENT}</DeltaPill>} />
                <LegendRow color={STATUS_COLORS.EXCUSED} label="Excused" hint={<DeltaPill tone="gray">{s.EXCUSED}</DeltaPill>} />
              </div>
            </div>
          )}
        </ListCard>

        {/* Row 3 */}
        <ListCard title="Attendance by day" className="xl:col-span-2" action={<PeriodChip>Last 14 days</PeriodChip>}>
          <AttendanceBars trend={data.attendanceTrend} />
        </ListCard>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
        <ListCard title="Grading queue" action={<Link href="/grades" className="text-xs font-medium text-brand-600 hover:underline">Gradebook ›</Link>}>
          {topGrading.length === 0 ? (
            <p className="text-sm text-muted">Nothing to grade.</p>
          ) : (
            <div className="flex gap-4">
              <StackBars values={topGrading.map((r) => r.pending)} colors={DOTS} />
              <ul className="min-w-0 flex-1 space-y-2.5">
                {topGrading.map((r, i) => (
                  <li key={r.assignment.id} className="flex items-center gap-2.5 text-sm">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: DOTS[i] }} />
                    <Link href={`/assignments/${r.assignment.id}`} className="min-w-0 flex-1 truncate text-ink hover:text-brand-600">
                      {r.assignment.title} <span className="text-muted">· {r.assignment.course.class.name}</span>
                    </Link>
                    <span className="tabular-nums text-ink">{r.pending}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </ListCard>
        <ListCard title="Upcoming" action={<Link href="/calendar" className="text-xs font-medium text-brand-600 hover:underline">Calendar ›</Link>}>
          <div className="divide-y divide-slate-100">
            {data.meetings.slice(0, 3).map((m, i) => (
              <BarRow key={m.id} index={i} meta={fmtDateTime(m.startsAt)} title={m.title} subtitle="Meeting" href={`/meetings/${m.id}`} />
            ))}
            {data.announcements.slice(0, 2).map((a, i) => (
              <BarRow key={a.id} index={i + 3} meta={fmtDate(a.publishAt)} title={a.title} subtitle="Announcement" href={`/announcements/${a.id}`} />
            ))}
            {data.meetings.length + data.announcements.length === 0 && <p className="text-sm text-muted">Nothing upcoming.</p>}
          </div>
        </ListCard>
        <ListCard title="Leave & cover" action={<Link href="/leave" className="text-xs font-medium text-brand-600 hover:underline">Leave ›</Link>}>
          <ul className="divide-y divide-slate-100 text-sm">
            {data.leave.slice(0, 2).map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2 py-2.5">
                <Link href={`/leave/${l.id}`} className="truncate text-ink hover:text-brand-600">
                  {fmtDate(l.startDate)} → {fmtDate(l.endDate)}
                </Link>
                <StatusBadge status={l.status} />
              </li>
            ))}
            {data.substitutions.slice(0, 3).map((x) => (
              <li key={x.id} className="flex items-center justify-between gap-2 py-2.5">
                <Link href={`/substitutions/${x.id}`} className="truncate text-ink hover:text-brand-600">
                  {fmtDate(x.date)} · {x.timetableSlot.course.subject.name} {x.timetableSlot.course.class.name}
                </Link>
                <StatusBadge status={x.status} />
              </li>
            ))}
            {data.leave.length + data.substitutions.length === 0 && <li className="py-2 text-muted">No leave or cover this week.</li>}
          </ul>
        </ListCard>
        <Link href="/ai" className="flex flex-col rounded-card bg-ink p-5 text-white shadow-card transition hover:bg-black">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10">
            <Bot className="h-5 w-5" />
          </span>
          <span className="mt-4 font-display text-xl">AI assistant</span>
          <span className="mt-1 text-sm text-white/70">Draft a lesson plan, rewrite a parent message or summarise your pending work.</span>
          <span className="mt-auto pt-4 text-xs font-medium text-accent-400">Open assistant ›</span>
        </Link>
      </div>
    </div>
  );
}

import Link from "next/link";
import type { adminDashboard, principalDashboard } from "@/modules/dashboards/service";
import { Avatar, BarRow, DeltaPill, LegendRow, StatCard, StatusBadge } from "@/components/ui";
import { DonutChart, StackBars } from "@/components/ui/charts";
import { fmtDate, fmtDateTime, fmtLongDate } from "@/lib/format";
import { ClipboardCheck, Repeat, ShieldCheck } from "lucide-react";
import { AttendanceBars, CountCard, DarkTrendCard, DashboardGreeting, ListCard, OceanCard, PeriodChip, rateAverage } from "./widgets";

type Admin = Awaited<ReturnType<typeof adminDashboard>>;
type Principal = Awaited<ReturnType<typeof principalDashboard>>;

const STATUS_COLORS = { PRESENT: "#222026", LATE: "#43E7D4", ABSENT: "#1B87E1", EXCUSED: "#b9c2cf" };

export function AdminDashboard({ data, principal, name }: { data: Admin | Principal; principal?: boolean; name?: string }) {
  const p = principal ? (data as Principal) : null;
  const att = data.attendanceToday.byStatus;
  const attTotal = Object.values(att).reduce((s, n) => s + n, 0);
  const presentToday = (att.PRESENT ?? 0) + (att.LATE ?? 0);
  const avg = rateAverage(data.attendanceTrend);
  const todayRate = attTotal ? Math.round((presentToday / attTotal) * 1000) / 10 : null;
  const latest = [...data.attendanceTrend].reverse().find((t) => t.rate !== null);
  const shownRate = todayRate ?? latest?.rate ?? null;
  const delta = shownRate !== null && avg !== null ? Math.round((shownRate - avg) * 10) / 10 : null;
  const s = data.attendanceStatus;
  const statusTotal = s.PRESENT + s.LATE + s.ABSENT + s.EXCUSED;
  const covered = data.lessonsToday ? Math.max(0, data.lessonsToday - data.substitutionsNeeded.filter((x) => fmtDate(x.date) === fmtDate(data.today)).length) : 0;
  const workload = [...data.workload.all].sort((a, b) => b.utilization - a.utilization);
  const topLoad = workload.slice(0, 3);
  const dots = ["#1B87E1", "#43E7D4", "#7fbbf0"];
  const trendTotals = data.attendanceTrend.filter((t) => t.total > 0);
  const recordsTotal = data.attendanceTrend.reduce((acc, t) => acc + t.total, 0);

  return (
    <div className="space-y-5">
      <DashboardGreeting name={name ?? "there"} subtitle={`${principal ? "Principal overview" : "Your latest school updates here"} · ${fmtLongDate(data.today)}`}>
        {[
          ["Teachers", data.counts.teachers, "/admin/teachers"],
          ["Students", data.counts.students, "/admin/students"],
          ["Classes", data.counts.classes, "/admin/classes"],
        ].map(([k, v, href]) => (
          <Link key={String(k)} href={String(href)} className="rounded-full bg-white px-4 py-2 text-sm shadow-card hover:bg-slate-50">
            <span className="font-display text-base tabular-nums text-ink">{v}</span> <span className="text-muted">{k}</span>
          </Link>
        ))}
      </DashboardGreeting>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(280px,340px)]">
        {/* Row 1 */}
        <StatCard label="Attendance rate" value={shownRate !== null ? `${shownRate}%` : "—"} hint={delta !== null ? `${delta >= 0 ? "+" : ""}${delta}% vs avg` : undefined} tone={shownRate !== null && shownRate < 90 ? "warn" : "good"} icon={<ClipboardCheck />} progress={shownRate ?? 0} aside={todayRate !== null ? `${att.ABSENT ?? 0} absent today` : "latest school day"} href="/admin/attendance" />
        <StatCard label="Lessons covered today" value={data.lessonsToday} hint={`${data.substitutionsNeeded.length} need cover`} tone={data.substitutionsNeeded.length ? "info" : "good"} icon={<Repeat />} progress={data.lessonsToday ? (covered / data.lessonsToday) * 100 : 100} aside={`${data.absentTeachers.length} teacher${data.absentTeachers.length === 1 ? "" : "s"} absent`} href="/admin/substitutions" />
        <div className="xl:row-span-3">
          <div className="grid h-full grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-1 xl:grid-rows-[minmax(260px,1fr)_auto_auto]">
            <OceanCard title="Students" value={data.counts.students} sub={`${data.counts.classes} classes`} delta={`${data.counts.teachers} teachers`} bars={data.classSizes.slice(0, 10).map((c) => ({ label: c.name, value: c.students }))} href="/admin/classes" />
            <div className="flex flex-col gap-4">
              <CountCard icon={<ShieldCheck />} title="Leave to review" value={data.pendingLeave.length} sub={data.pendingLeave.length === 1 ? "request" : "requests"} actionHref="/admin/leave" actionLabel="Review leave requests" />
            </div>
            <DarkTrendCard title="Attendance records" value={recordsTotal.toLocaleString("en-GB")} sub={`${data.attendanceToday.sessions} sessions today`} delta={avg !== null ? `${avg}% avg` : undefined} chip="14 days" points={trendTotals.map((t) => t.total)} labels={trendTotals.map((t, i) => (i === 0 || i === trendTotals.length - 1 ? fmtDate(t.date).slice(5).replace("-", "/") : ""))} />
          </div>
        </div>

        {/* Row 2 */}
        <ListCard title="Teacher workload" action={<PeriodChip>This week</PeriodChip>}>
          <div className="flex gap-4">
            <StackBars values={topLoad.map((w) => w.utilization)} colors={dots} />
            <ul className="min-w-0 flex-1 space-y-2.5">
              {topLoad.map((w, i) => (
                <li key={w.teacherId} className="flex items-center gap-2.5 text-sm">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: dots[i] }} />
                  <span className="min-w-0 flex-1 truncate text-ink">{w.name}</span>
                  <span className="hidden text-xs text-muted sm:inline">{w.teachingPeriods}p</span>
                  <span className="w-14 text-right tabular-nums text-ink">{w.utilization}%</span>
                </li>
              ))}
              <li className="flex items-center gap-2.5 text-sm">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full border border-slate-300" />
                <span className="min-w-0 flex-1 truncate text-ink">Others</span>
                <span className="w-14 text-right tabular-nums text-ink">{Math.max(0, workload.length - topLoad.length)}</span>
              </li>
            </ul>
          </div>
          <Link href="/admin/workload" className="mt-3 inline-block text-xs font-medium text-brand-600 hover:underline">
            {data.workload.overloaded.length} above capacity · view workload ›
          </Link>
        </ListCard>
        <ListCard title="Attendance by status" action={<PeriodChip>Last 30 days</PeriodChip>}>
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
                <p className="mt-1 text-right text-[11px] text-muted">{statusTotal.toLocaleString("en-GB")} records</p>
              </div>
            </div>
          )}
        </ListCard>

        {/* Row 3 */}
        <ListCard
          title="Attendance by day"
          className="xl:col-span-2"
          action={
            <span className="flex items-center gap-4">
              <span className="hidden items-center gap-4 text-[11px] text-muted sm:flex">
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full border border-brand-300" /> Absent / excused
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2 w-2 rounded-full bg-brand-300" /> Present
                </span>
              </span>
              <PeriodChip>Last 14 days</PeriodChip>
            </span>
          }
        >
          <AttendanceBars trend={data.attendanceTrend} />
        </ListCard>
      </div>

      {/* Operations */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-4">
        <ListCard title="Substitutions needed" action={<Link href="/admin/substitutions" className="text-xs font-medium text-brand-600 hover:underline">Manage ›</Link>}>
          {data.substitutionsNeeded.length === 0 ? (
            <p className="text-sm text-muted">All lessons are covered.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {data.substitutionsNeeded.slice(0, 5).map((x, i) => (
                <BarRow key={x.id} index={i} meta={`${fmtDate(x.date)} · ${x.timetableSlot.period.name}`} title={`${x.timetableSlot.course.subject.name} · ${x.timetableSlot.course.class.name}`} subtitle={`Absent: ${x.absentTeacher.user.name}`} action={<Link href={`/admin/substitutions/${x.id}`} className="rounded-full bg-ink px-3 py-1 text-xs font-medium text-white hover:bg-black">Cover</Link>} />
              ))}
            </div>
          )}
        </ListCard>
        <ListCard title="Pending leave" action={<Link href="/admin/leave" className="text-xs font-medium text-brand-600 hover:underline">Review ›</Link>}>
          {data.pendingLeave.length === 0 ? (
            <p className="text-sm text-muted">No pending requests.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {data.pendingLeave.slice(0, 5).map((l) => (
                <li key={l.id} className="flex items-center gap-3 py-2.5">
                  <Avatar name={l.requester.name} size="sm" />
                  <Link href={`/admin/leave/${l.id}`} className="min-w-0 flex-1 hover:text-brand-600">
                    <span className="block truncate font-medium text-ink">{l.requester.name}</span>
                    <span className="block truncate text-xs text-muted">
                      {l.type.toLowerCase()} · {fmtDate(l.startDate)} → {fmtDate(l.endDate)}
                    </span>
                  </Link>
                  <StatusBadge status={l.status} />
                </li>
              ))}
            </ul>
          )}
        </ListCard>
        <ListCard title="Attendance alerts" action={<Link href="/admin/attendance" className="text-xs font-medium text-brand-600 hover:underline">All ›</Link>}>
          {data.attendanceAlerts.length === 0 ? (
            <p className="text-sm text-muted">No repeated absences.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {data.attendanceAlerts.slice(0, 5).map((a) => (
                <li key={a.student.id} className="flex items-center gap-3 py-2.5">
                  <Avatar name={`${a.student.firstName} ${a.student.lastName}`} size="sm" />
                  <Link href={`/students/${a.student.id}`} className="min-w-0 flex-1 truncate text-ink hover:text-brand-600">
                    {a.student.firstName} {a.student.lastName} <span className="text-muted">· {a.student.class?.name}</span>
                  </Link>
                  <DeltaPill tone="rose">{a.absences}</DeltaPill>
                </li>
              ))}
            </ul>
          )}
        </ListCard>
        <ListCard title="Upcoming" action={<Link href="/calendar" className="text-xs font-medium text-brand-600 hover:underline">Calendar ›</Link>}>
          <div className="divide-y divide-slate-100">
            {[...data.upcomingEvents.slice(0, 3).map((e) => ({ id: e.id, href: `/events/${e.id}`, title: e.title, at: e.startsAt, kind: "Event" })), ...data.meetings.slice(0, 3).map((m) => ({ id: m.id, href: `/meetings/${m.id}`, title: m.title, at: m.startsAt, kind: "Meeting" }))]
              .sort((a, b) => a.at.getTime() - b.at.getTime())
              .slice(0, 5)
              .map((u, i) => (
                <BarRow key={u.id} index={i} meta={fmtDateTime(u.at)} title={u.title} subtitle={u.kind} href={u.href} />
              ))}
            {data.upcomingEvents.length + data.meetings.length === 0 && <p className="text-sm text-muted">Nothing scheduled.</p>}
          </div>
        </ListCard>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Pending grades" value={data.pendingGrades.length} hint="courses" tone={data.pendingGrades.length ? "warn" : "good"} href="/admin/reports/grading-status" progress={data.counts.classes ? Math.min(100, (data.pendingGrades.length / Math.max(1, data.pendingGrades.length + data.counts.classes)) * 100) : 0} />
        <StatCard label="Open maintenance" value={data.maintenance.open} hint={`${data.maintenance.overdueCount} overdue`} tone={data.maintenance.overdueCount ? "bad" : "default"} href="/maintenance" />
        <StatCard label="Open tasks" value={data.tasks.open} hint={`${data.tasks.overdue.length} overdue`} tone={data.tasks.overdue.length ? "warn" : "default"} href="/admin/tasks" />
      </div>

      {p && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <StatCard label="Attendance (30 days)" value={`${p.attendance30Days.rate}%`} hint={`${p.attendance30Days.total} records`} tone="good" progress={p.attendance30Days.rate} />
          <StatCard label="Teachers absent today" value={data.absentTeachers.length} href="/admin/leave" tone={data.absentTeachers.length ? "warn" : "good"} />
          <StatCard label="Average score" value={p.academic.averageScore ?? "—"} hint={`${p.academic.gradedItems} graded`} tone="info" />
        </div>
      )}
    </div>
  );
}

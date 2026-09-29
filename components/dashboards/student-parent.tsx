import Link from "next/link";
import type { parentDashboard, staffDashboard, studentDashboard } from "@/modules/dashboards/service";
import { Card, StatCard, StatusBadge } from "@/components/ui";
import { fmtDate, fmtDateTime, fmtLongDate } from "@/lib/format";

export function StudentDashboard({ data }: { data: Awaited<ReturnType<typeof studentDashboard>> }) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium text-muted">{fmtLongDate(data.today)} · Class {data.student.class?.name ?? "—"}</p>
        <h1 className="font-display text-[30px] leading-tight text-ink sm:text-[34px]">Hello, {data.student.firstName}</h1>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Lessons today" value={data.todayLessons.length} href="/schedule" tone="info" />
        <StatCard label="Upcoming assignments" value={data.upcomingAssignments.length} href="/assignments" />
        <StatCard label="Attendance" value={`${data.attendance.stats.attendanceRate}%`} tone={data.attendance.flagged ? "bad" : "good"} />
        <StatCard label="Overall average" value={data.grades.overall ?? "—"} href="/grades" tone="warn" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Today's lessons">
          {data.todayLessons.length === 0 ? <p className="text-sm text-slate-500">No lessons today.</p> : (
            <ul className="divide-y divide-slate-100 text-sm">{data.todayLessons.map((l) => <li key={l.id} className="flex justify-between py-2"><span><span className="text-slate-500">{l.period.startTime}</span> {l.course.subject.name}</span><span className="text-xs text-slate-500">{l.course.teacher.user.name} · {l.room?.name ?? ""}</span></li>)}</ul>
          )}
        </Card>
        <Card title="Assignments due">
          {data.upcomingAssignments.length === 0 ? <p className="text-sm text-slate-500">Nothing due.</p> : (
            <ul className="divide-y divide-slate-100 text-sm">{data.upcomingAssignments.map((a) => <li key={a.id} className="flex justify-between py-2"><Link href={`/assignments/${a.id}`} className="hover:text-brand-700">{a.title} <span className="text-slate-500">· {a.course.subject.name}</span></Link><span className="text-xs text-slate-500">{fmtDate(a.dueDate)}</span></li>)}</ul>
          )}
        </Card>
        <Card title="Grades">
          {data.grades.courses.length === 0 ? <p className="text-sm text-slate-500">No grades published yet.</p> : (
            <ul className="divide-y divide-slate-100 text-sm">{data.grades.courses.map((c) => <li key={c.courseId} className="flex justify-between py-2"><span>{c.subject}</span><span>{c.summary.average ?? "—"}% {c.summary.letter && <StatusBadge status={c.summary.letter} />}</span></li>)}</ul>
          )}
        </Card>
        <Card title="Events & announcements">
          <ul className="space-y-2 text-sm">
            {data.events.slice(0, 4).map((e) => <li key={e.id}><Link href={`/events/${e.id}`} className="font-medium hover:text-brand-700">{e.title}</Link><div className="text-xs text-slate-500">{fmtDateTime(e.startsAt)}</div></li>)}
            {data.announcements.slice(0, 4).map((a) => <li key={a.id}><Link href={`/announcements/${a.id}`} className="hover:text-brand-700">{a.title}</Link></li>)}
            {data.events.length + data.announcements.length === 0 && <li className="text-slate-500">Nothing new.</li>}
          </ul>
        </Card>
      </div>
    </div>
  );
}

export function ParentDashboard({ data }: { data: Awaited<ReturnType<typeof parentDashboard>> }) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium text-muted">{fmtLongDate(data.today)}</p>
        <h1 className="font-display text-[30px] leading-tight text-ink sm:text-[34px]">Family overview</h1>
      </div>
      {data.children.length === 0 && <p className="text-sm text-slate-500">No children are linked to your account yet. Please contact the school office.</p>}
      {data.children.map(({ child, attendance, grades, todayLessons, assignments }) => (
        <Card key={child.id} title={`${child.firstName} ${child.lastName}`} description={`Class ${child.class?.name ?? "—"}`} actions={<Link href={`/students/${child.id}`} className="text-sm text-brand-700 hover:underline">Full profile</Link>}>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Attendance" value={`${attendance.stats.attendanceRate}%`} hint={attendance.flagged ? `${attendance.recentAbsences} recent absences` : undefined} tone={attendance.flagged ? "bad" : "good"} />
            <StatCard label="Average" value={grades.overall ?? "—"} />
            <StatCard label="Lessons today" value={todayLessons.length} />
            <StatCard label="Assignments due" value={assignments.length} hint={`${assignments.filter((a) => a.submissions.length === 0).length} not submitted`} />
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2 text-sm">
            <div>
              <div className="mb-1 text-xs font-medium uppercase text-slate-500">Upcoming assignments</div>
              {assignments.length === 0 ? <p className="text-slate-500">None.</p> : assignments.slice(0, 5).map((a) => <div key={a.id} className="flex justify-between py-1"><span>{a.title} <span className="text-slate-500">· {a.course.subject.name}</span></span><span className="text-xs text-slate-500">{fmtDate(a.dueDate)} {a.submissions.length ? "✓" : ""}</span></div>)}
            </div>
            <div>
              <div className="mb-1 text-xs font-medium uppercase text-slate-500">Subject averages</div>
              {grades.courses.length === 0 ? <p className="text-slate-500">No grades yet.</p> : grades.courses.map((c) => <div key={c.subject} className="flex justify-between py-1"><span>{c.subject}</span><span>{c.average ?? "—"}% {c.letter ?? ""}</span></div>)}
            </div>
          </div>
        </Card>
      ))}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="School events">{data.events.length === 0 ? <p className="text-sm text-slate-500">No upcoming events.</p> : <ul className="space-y-2 text-sm">{data.events.map((e) => <li key={e.id}><Link href={`/events/${e.id}`} className="font-medium hover:text-brand-700">{e.title}</Link><div className="text-xs text-slate-500">{fmtDateTime(e.startsAt)}</div></li>)}</ul>}</Card>
        <Card title="Announcements">{data.announcements.length === 0 ? <p className="text-sm text-slate-500">No announcements.</p> : <ul className="space-y-2 text-sm">{data.announcements.map((a) => <li key={a.id}><Link href={`/announcements/${a.id}`} className="hover:text-brand-700">{a.title}</Link></li>)}</ul>}</Card>
      </div>
    </div>
  );
}

export function StaffDashboard({ data, name }: { data: Awaited<ReturnType<typeof staffDashboard>>; name: string }) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-medium text-muted">{fmtLongDate(data.today)}</p>
        <h1 className="font-display text-[30px] leading-tight text-ink sm:text-[34px]">Good day, {name.split(" ")[0]}</h1>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Open tasks" value={data.tasks.length} href="/tasks" />
        <StatCard label="Meetings this week" value={data.meetings.length} href="/meetings" />
        {data.maintenance && <StatCard label="Open maintenance" value={data.maintenance.open} hint={`${data.maintenance.overdueCount} overdue`} href="/maintenance" />}
        <StatCard label="Unread notifications" value={data.notifications.length} href="/notifications" />
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="My tasks">{data.tasks.length === 0 ? <p className="text-sm text-slate-500">No open tasks.</p> : <ul className="divide-y divide-slate-100 text-sm">{data.tasks.slice(0, 8).map((t) => <li key={t.id} className="flex justify-between py-2"><span>{t.title}</span><span className="text-xs text-slate-500">{t.dueDate ? fmtDate(t.dueDate) : ""}</span></li>)}</ul>}</Card>
        <Card title="Announcements & events">
          <ul className="space-y-2 text-sm">
            {data.announcements.map((a) => <li key={a.id}><Link href={`/announcements/${a.id}`} className="hover:text-brand-700">{a.title}</Link></li>)}
            {data.events.slice(0, 4).map((e) => <li key={e.id}><Link href={`/events/${e.id}`} className="font-medium hover:text-brand-700">{e.title}</Link><div className="text-xs text-slate-500">{fmtDateTime(e.startsAt)}</div></li>)}
          </ul>
        </Card>
      </div>
    </div>
  );
}

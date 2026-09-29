import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { departmentDashboard } from "@/modules/dashboards";
import { Alert, Card, EmptyState, PageHeader, StatCard, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { fmtDate, fmtDateTime, humanize } from "@/lib/format";
import { load } from "@/components/work/guard";

export const dynamic = "force-dynamic";

export default async function DepartmentDashboardPage() {
  const user = await requireCurrentUser();
  const result = await load(() => departmentDashboard(user));
  if (result.error || !result.data) {
    return (
      <div>
        <PageHeader title="Department dashboard" />
        <Alert tone="error">{result.error}</Alert>
      </div>
    );
  }
  const d = result.data;
  const workloadByTeacher = new Map(d.workload.map((w) => [w.teacherId, w]));
  const overloaded = d.workload.filter((w) => w.level === "OVERLOADED" || w.level === "HIGH").length;
  const openTasks = d.tasks.length;
  const overdueTasks = d.tasks.filter((t) => t.dueDate && t.dueDate < new Date()).length;
  const curriculumTotal = Object.values(d.curriculum).reduce((s, n) => s + n, 0);

  return (
    <div className="space-y-6">
      <PageHeader title={d.department?.name ?? "Department"} description={`Department dashboard${d.department?.headTeacher ? ` · Head: ${d.department.headTeacher.user.name}` : ""}`} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Teachers" value={d.teachers.length} />
        <StatCard label="Courses" value={d.courses.length} />
        <StatCard label="Subjects" value={d.department?.subjects.length ?? 0} />
        <StatCard label="Pending grades" value={d.pendingGrades.length} hint="courses with draft grades" tone={d.pendingGrades.length ? "warn" : "good"} />
        <StatCard label="Heavy workload" value={overloaded} hint="teachers high/overloaded" tone={overloaded ? "bad" : "good"} />
        <StatCard label="Open tasks" value={openTasks} hint={overdueTasks ? `${overdueTasks} overdue` : undefined} tone={overdueTasks ? "bad" : "default"} href="/tasks" />
      </div>

      <Card title="Teachers & workload" description="Weekly teaching periods and overall utilization." padded={false}>
        {d.teachers.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No teachers in this department" />
          </div>
        ) : (
          <Table className="border-0">
            <THead>
              <tr>
                <TH>Teacher</TH>
                <TH>Status</TH>
                <TH>Courses</TH>
                <TH>Teaching periods</TH>
                <TH>Substitutions</TH>
                <TH>Total / max</TH>
                <TH>Utilization</TH>
              </tr>
            </THead>
            <TBody>
              {d.teachers.map((t) => {
                const w = workloadByTeacher.get(t.id);
                return (
                  <TR key={t.id} data-testid="row" data-id={t.id}>
                    <TD>
                      <div className="font-medium text-slate-900">{t.user.name}</div>
                      <div className="text-xs text-slate-500">{t.user.email}</div>
                    </TD>
                    <TD>
                      <StatusBadge status={t.status} />
                    </TD>
                    <TD>{t._count.courses}</TD>
                    <TD>{w?.teachingPeriods ?? "—"}</TD>
                    <TD>{w?.substitutionPeriods ?? "—"}</TD>
                    <TD>{w ? `${w.totalPeriods} / ${w.maxWeeklyPeriods}` : "—"}</TD>
                    <TD>
                      {w ? (
                        <span className="inline-flex items-center gap-2">
                          <span className="tabular-nums">{w.utilization}%</span>
                          <StatusBadge status={w.level} />
                        </span>
                      ) : (
                        "—"
                      )}
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Courses & grading" description="Grade submission status per course." padded={false}>
          {d.gradeStatus.length === 0 ? (
            <p className="px-4 py-3 text-sm text-slate-500">No courses in this department.</p>
          ) : (
            <ul className="divide-y divide-slate-100 text-sm">
              {d.gradeStatus.map((g) => (
                <li key={g.course.id} className="flex items-center justify-between gap-3 px-4 py-2">
                  <div>
                    <Link href={`/classes/${g.course.id}`} className="text-slate-900 hover:text-brand-700">
                      {g.course.subject.name} · {g.course.class.name}
                    </Link>
                    <div className="text-xs text-slate-500">
                      {g.course.teacher.user.name}
                      {g.total > 0 && ` · ${g.counts.DRAFT} draft / ${g.counts.SUBMITTED} submitted / ${g.counts.LOCKED} locked`}
                    </div>
                  </div>
                  <StatusBadge status={g.status === "NONE" ? "MISSING" : g.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          <Card title="Curriculum progress" description="Lesson plans by status across the department's courses.">
            {curriculumTotal === 0 ? (
              <p className="text-sm text-slate-500">No lesson plans yet.</p>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {(["DRAFT", "READY", "COMPLETED"] as const).map((s) => (
                  <div key={s} className="rounded-md border border-slate-200 p-3 text-center">
                    <div className="text-xl font-semibold text-slate-900">{d.curriculum[s] ?? 0}</div>
                    <div className="text-xs text-slate-500">{humanize(s)}</div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Upcoming meetings" padded={false}>
            {d.meetings.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-500">No meetings in the next 14 days.</p>
            ) : (
              <ul className="divide-y divide-slate-100 text-sm">
                {d.meetings.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 px-4 py-2">
                    <Link href={`/meetings/${m.id}`} className="text-slate-900 hover:text-brand-700">
                      {m.title}
                      <div className="text-xs text-slate-500">{m.room?.name ?? "No room"} · {m._count.participants} participants</div>
                    </Link>
                    <span className="text-xs text-slate-500">{fmtDateTime(m.startsAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <Card title="Open department tasks" padded={false}>
        {d.tasks.length === 0 ? (
          <p className="px-4 py-3 text-sm text-slate-500">No open tasks.</p>
        ) : (
          <ul className="divide-y divide-slate-100 text-sm">
            {d.tasks.slice(0, 20).map((t) => {
              const overdue = !!t.dueDate && t.dueDate < new Date();
              return (
                <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-2">
                  <Link href={`/tasks/${t.id}`} className="text-slate-900 hover:text-brand-700">
                    {t.title}
                    <div className="text-xs text-slate-500">{t.assignee.name}</div>
                  </Link>
                  <span className={overdue ? "text-xs font-medium text-red-700" : "text-xs text-slate-500"}>
                    {fmtDate(t.dueDate)}
                    {overdue && " · overdue"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

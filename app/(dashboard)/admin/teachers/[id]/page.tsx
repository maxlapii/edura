import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db";
import { getTeacher } from "@/modules/teachers";
import { listPeriods, teacherWorkload, weeklySchedule } from "@/modules/timetable";
import { Alert, Badge, Card, DescriptionList, LinkButton, PageHeader, StatCard, StatusBadge, Table, Tabs, TBody, TD, TH, THead, TR } from "@/components/ui";
import { DAY_NAMES, fmtDate, humanize } from "@/lib/format";
import { ActionButton } from "../../_components/action-button";
import { EntityForm } from "../../_components/entity-form";
import { ScheduleGrid } from "../../_components/schedule-grid";
import { TemporaryPasswordNotice } from "../../_components/temporary-password";
import { guarded, optional, str } from "../../_lib/guard";
import { departmentOptions, enumOptions, periodOptions, subjectOptions } from "../../_lib/options";
import type { PageProps } from "../../_lib/types";
import { teacherFields } from "../_fields";
import { AvailabilityEditor } from "./availability-editor";

export const dynamic = "force-dynamic";

const TABS = ["overview", "timetable", "workload", "availability", "duties", "development", "leave"] as const;
type Tab = (typeof TABS)[number];

export default async function TeacherDetailPage({ params, searchParams }: PageProps<{ id: string }>) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const user = await requireCurrentUser();
  const tabParam = str(sp, "tab");
  const tab: Tab = (TABS as readonly string[]).includes(tabParam ?? "") ? (tabParam as Tab) : "overview";
  const res = await guarded(() => getTeacher(user, id));
  if (!res.ok) return <Alert tone="error">{res.error}</Alert>;
  const teacher = res.data;
  const base = `/admin/teachers/${teacher.id}`;
  const tabs = [
    { href: base, label: "Overview" },
    { href: `${base}?tab=timetable`, label: "Timetable" },
    { href: `${base}?tab=workload`, label: "Workload" },
    { href: `${base}?tab=availability`, label: "Availability" },
    { href: `${base}?tab=duties`, label: "Duties", count: teacher.duties.length },
    { href: `${base}?tab=development`, label: "Professional development" },
    { href: `${base}?tab=leave`, label: "Leave" },
  ];
  const current = tab === "overview" ? base : `${base}?tab=${tab}`;

  return (
    <div className="space-y-4">
      <TemporaryPasswordNotice entityId={teacher.id} password={str(sp, "tempPassword")} />
      <PageHeader
        title={teacher.user.name}
        description={`${teacher.employeeNumber} · ${teacher.department?.name ?? "No department"} · ${teacher.position ?? humanize(teacher.employmentType)}`}
        breadcrumb={
          <Link href="/admin/teachers" className="hover:underline">
            Teachers
          </Link>
        }
        actions={
          <>
            <StatusBadge status={teacher.status} />
            <LinkButton href={`/admin/timetable?view=teacher&id=${teacher.id}`} variant="outline" size="sm">
              Timetable editor
            </LinkButton>
            <LinkButton href={`/admin/users/${teacher.user.id}`} variant="outline" size="sm">
              Login &amp; password
            </LinkButton>
          </>
        }
      />
      <Tabs items={tabs} current={current} />
      {tab === "overview" && <OverviewTab teacher={teacher} user={user} />}
      {tab === "timetable" && <TimetableTab teacherId={teacher.id} user={user} />}
      {tab === "workload" && <WorkloadTab teacherId={teacher.id} user={user} />}
      {tab === "availability" && <AvailabilityTab teacher={teacher} user={user} />}
      {tab === "duties" && <DutiesTab teacher={teacher} user={user} />}
      {tab === "development" && <DevelopmentTab teacher={teacher} />}
      {tab === "leave" && <LeaveTab teacherId={teacher.id} />}
    </div>
  );
}

type User = Awaited<ReturnType<typeof requireCurrentUser>>;
type Teacher = Awaited<ReturnType<typeof getTeacher>>;

async function OverviewTab({ teacher, user }: { teacher: Teacher; user: User }) {
  const [departments, subjects] = await Promise.all([departmentOptions(user), subjectOptions(user)]);
  const initial = { ...teacher, name: teacher.user.name, phone: teacher.user.phone, subjectIds: teacher.subjects.map((s) => s.subject.id) } as unknown as Record<string, unknown>;
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        <Card title="Profile">
          <EntityForm testId="teacher-form" method="PATCH" action={`/api/teachers/${teacher.id}`} initial={initial} fields={teacherFields({ departments, subjects, mode: "edit" })} />
        </Card>
      </div>
      <div className="space-y-6">
        <Card title="Account">
          <DescriptionList
            items={[
              { label: "Email", value: teacher.user.email },
              { label: "Login", value: <StatusBadge status={teacher.user.isActive ? "ACTIVE" : "INACTIVE"} /> },
              { label: "Hired", value: fmtDate(teacher.hireDate) },
              { label: "Head of", value: teacher.headOfDepartment?.name ?? "—" },
            ]}
          />
        </Card>
        <Card title={`Courses (${teacher.courses.length})`}>
          <ul className="divide-y divide-slate-100 text-sm">
            {teacher.courses.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-1.5">
                <span>
                  {c.subject.name} · <Link href={`/admin/classes/${c.class.id}`} className="text-brand-700 hover:underline">{c.class.name}</Link>
                </span>
                <span className="text-xs text-slate-500">{c.class._count.students} students</span>
              </li>
            ))}
            {teacher.courses.length === 0 && <li className="py-1.5 text-slate-500">No courses assigned.</li>}
          </ul>
        </Card>
        {teacher.homeroomClasses.length > 0 && (
          <Card title="Homeroom">
            <ul className="text-sm">
              {teacher.homeroomClasses.map((c) => (
                <li key={c.id}>
                  <Link href={`/admin/classes/${c.id}`} className="text-brand-700 hover:underline">
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}

async function TimetableTab({ teacherId, user }: { teacherId: string; user: User }) {
  const [slots, periods] = await Promise.all([optional(() => weeklySchedule(user, { teacherId }), []), optional(() => listPeriods(user), [])]);
  return (
    <Card title="Weekly timetable" description={`${slots.length} lessons per week`} actions={<LinkButton href={`/admin/timetable?view=teacher&id=${teacherId}`} variant="outline" size="sm">Edit in timetable</LinkButton>}>
      <ScheduleGrid slots={slots} periods={periods} show={["subject", "class", "room"]} />
    </Card>
  );
}

async function WorkloadTab({ teacherId, user }: { teacherId: string; user: User }) {
  const res = await guarded(() => teacherWorkload(user, teacherId));
  if (!res.ok) return <Alert tone="error">{res.error}</Alert>;
  const w = res.data;
  const tone = w.level === "OVERLOADED" ? "bad" : w.level === "HIGH" || w.level === "UNDERUTILIZED" ? "warn" : "good";
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Utilization" value={`${w.utilization}%`} hint={<StatusBadge status={w.level} />} tone={tone} />
        <StatCard label="Total workload" value={`${w.totalPeriods} / ${w.maxWeeklyPeriods}`} hint="periods per week" />
        <StatCard label="Teaching periods" value={w.teachingPeriods} hint={`${w.classes} classes · ${w.subjects} subjects`} />
        <StatCard label="Preparation periods" value={w.preparationPeriods} />
        <StatCard label="Substitutions this week" value={w.substitutionPeriods} />
        <StatCard label="Meetings" value={`${w.meetingHours.toFixed(1)} h`} hint="this week" />
        <StatCard label="Duties" value={`${w.dutyHours} h`} hint="per week" />
        <StatCard label="Homeroom classes" value={w.homeroomClasses} hint={w.leaveDays ? `${w.leaveDays} leave days this week` : undefined} />
      </div>
      <p className="text-xs text-slate-500">Thresholds: under 60% underutilized · 95% high · 110% overloaded. Meetings and duties are converted to 45-minute periods.</p>
    </div>
  );
}

async function AvailabilityTab({ teacher, user }: { teacher: Teacher; user: User }) {
  const periods = await optional(() => listPeriods(user), []);
  return (
    <Card title="Availability" description="Used when suggesting substitutes. Whole-day entries apply to every period of that day.">
      <AvailabilityEditor teacherId={teacher.id} periods={periods} entries={teacher.availability.map((a) => ({ dayOfWeek: a.dayOfWeek, periodId: a.periodId, type: a.type, note: a.note }))} />
    </Card>
  );
}

async function DutiesTab({ teacher, user }: { teacher: Teacher; user: User }) {
  const periods = await periodOptions(user);
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Table>
          <THead>
            <TR>
              <TH>Duty</TH>
              <TH>When</TH>
              <TH>Hours/week</TH>
              <TH className="text-right">Actions</TH>
            </TR>
          </THead>
          <TBody>
            {teacher.duties.map((d) => (
              <TR key={d.id} data-testid="duty-row" data-id={d.id}>
                <TD>
                  <div className="font-medium">{d.name}</div>
                  {d.description && <div className="text-xs text-slate-500">{d.description}</div>}
                </TD>
                <TD>
                  {d.dayOfWeek ? DAY_NAMES[d.dayOfWeek] : "Any day"}
                  {d.period ? ` · ${d.period.name}` : ""}
                </TD>
                <TD>{d.weeklyHours}</TD>
                <TD className="text-right">
                  <ActionButton action={`/api/duties/${d.id}`} method="DELETE" label="Remove" variant="danger" confirm={`Remove duty ${d.name}?`} testId="delete-duty" />
                </TD>
              </TR>
            ))}
            {teacher.duties.length === 0 && (
              <TR>
                <TD colSpan={4} className="text-center text-slate-500">
                  No duties.
                </TD>
              </TR>
            )}
          </TBody>
        </Table>
      </div>
      <Card title="Add duty">
        <EntityForm
          testId="duty-form"
          action={`/api/teachers/${teacher.id}/duties`}
          submitLabel="Add duty"
          resetOnSuccess
          columns={1}
          compact
          initial={{ weeklyHours: 1 }}
          fields={[
            { name: "name", label: "Duty", required: true, placeholder: "Playground supervision" },
            { name: "description", label: "Description", type: "textarea", rows: 2 },
            { name: "dayOfWeek", label: "Day", type: "select", options: [1, 2, 3, 4, 5, 6, 7].map((d) => ({ value: String(d), label: DAY_NAMES[d] })) },
            { name: "periodId", label: "Period", type: "select", options: periods },
            { name: "weeklyHours", label: "Hours per week", type: "number", min: 0, max: 40, step: 0.5, required: true },
          ]}
        />
      </Card>
    </div>
  );
}

function DevelopmentTab({ teacher }: { teacher: Teacher }) {
  const today = new Date();
  const soon = new Date(today.getTime() + 30 * 86_400_000);
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Certifications" padded={false}>
            <Table className="rounded-none border-0">
              <THead>
                <TR>
                  <TH>Certification</TH>
                  <TH>Issuer</TH>
                  <TH>Issued</TH>
                  <TH>Expires</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {teacher.certifications.map((c) => {
                  const expired = c.expiresAt && c.expiresAt < today;
                  const expiring = c.expiresAt && !expired && c.expiresAt <= soon;
                  return (
                    <TR key={c.id} data-testid="certification-row" data-id={c.id}>
                      <TD className="font-medium">{c.name}</TD>
                      <TD>{c.issuer ?? "—"}</TD>
                      <TD>{fmtDate(c.issuedAt)}</TD>
                      <TD>
                        {fmtDate(c.expiresAt)} {expired && <Badge tone="red">Expired</Badge>} {expiring && <Badge tone="amber">Expiring soon</Badge>}
                      </TD>
                      <TD className="text-right">
                        <ActionButton action={`/api/certifications/${c.id}`} method="DELETE" label="Remove" variant="danger" confirm={`Remove ${c.name}?`} testId="delete-certification" />
                      </TD>
                    </TR>
                  );
                })}
                {teacher.certifications.length === 0 && (
                  <TR>
                    <TD colSpan={5} className="text-center text-slate-500">
                      No certifications recorded.
                    </TD>
                  </TR>
                )}
              </TBody>
            </Table>
          </Card>
        </div>
        <Card title="Add certification">
          <EntityForm
            testId="certification-form"
            action={`/api/teachers/${teacher.id}/certifications`}
            submitLabel="Add certification"
            resetOnSuccess
            columns={1}
            compact
            fields={[
              { name: "name", label: "Name", required: true },
              { name: "issuer", label: "Issuer" },
              { name: "issuedAt", label: "Issued", type: "date" },
              { name: "expiresAt", label: "Expires", type: "date" },
            ]}
          />
        </Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title="Training, workshops, goals & observations" padded={false}>
            <Table className="rounded-none border-0">
              <THead>
                <TR>
                  <TH>Type</TH>
                  <TH>Title</TH>
                  <TH>Date</TH>
                  <TH>Hours</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {teacher.professionalDev.map((p) => (
                  <TR key={p.id} data-testid="pd-row" data-id={p.id}>
                    <TD>{humanize(p.type)}</TD>
                    <TD>
                      <div className="font-medium">{p.title}</div>
                      {p.notes && <div className="text-xs text-slate-500">{p.notes}</div>}
                    </TD>
                    <TD>{fmtDate(p.date)}</TD>
                    <TD>{p.hours ?? "—"}</TD>
                    <TD>
                      <StatusBadge status={p.status} />
                    </TD>
                  </TR>
                ))}
                {teacher.professionalDev.length === 0 && (
                  <TR>
                    <TD colSpan={5} className="text-center text-slate-500">
                      Nothing recorded yet.
                    </TD>
                  </TR>
                )}
              </TBody>
            </Table>
          </Card>
        </div>
        <Card title="Add professional development">
          <EntityForm
            testId="professional-development-form"
            action={`/api/teachers/${teacher.id}/professional-development`}
            submitLabel="Add record"
            resetOnSuccess
            columns={1}
            compact
            initial={{ type: "TRAINING", status: "PLANNED" }}
            fields={[
              { name: "type", label: "Type", type: "select", options: enumOptions(["TRAINING", "WORKSHOP", "COURSE", "OBSERVATION", "GOAL", "DEVELOPMENT_PLAN"]), required: true },
              { name: "title", label: "Title", required: true },
              { name: "date", label: "Date", type: "date" },
              { name: "hours", label: "Hours", type: "number", min: 0, step: 0.5 },
              { name: "status", label: "Status", type: "select", options: enumOptions(["PLANNED", "IN_PROGRESS", "COMPLETED"]), required: true },
              { name: "notes", label: "Notes", type: "textarea", rows: 2 },
            ]}
          />
        </Card>
      </div>
    </div>
  );
}

async function LeaveTab({ teacherId }: { teacherId: string }) {
  const leaves = await prisma.leaveRequest.findMany({ where: { teacherId }, orderBy: { startDate: "desc" }, take: 100, include: { _count: { select: { substitutions: true } } } });
  return (
    <Table>
      <THead>
        <TR>
          <TH>Type</TH>
          <TH>From</TH>
          <TH>To</TH>
          <TH>Reason</TH>
          <TH>Substitutions</TH>
          <TH>Status</TH>
        </TR>
      </THead>
      <TBody>
        {leaves.map((l) => (
          <TR key={l.id} data-testid="leave-row" data-id={l.id}>
            <TD>
              <Link href={`/admin/leave/${l.id}`} className="font-medium text-brand-700 hover:underline">
                {humanize(l.type)}
              </Link>
            </TD>
            <TD>{fmtDate(l.startDate)}</TD>
            <TD>{fmtDate(l.endDate)}</TD>
            <TD className="max-w-xs truncate">{l.reason ?? "—"}</TD>
            <TD>{l._count.substitutions}</TD>
            <TD>
              <StatusBadge status={l.status} />
            </TD>
          </TR>
        ))}
        {leaves.length === 0 && (
          <TR>
            <TD colSpan={6} className="text-center text-slate-500">
              No leave requests.
            </TD>
          </TR>
        )}
      </TBody>
    </Table>
  );
}

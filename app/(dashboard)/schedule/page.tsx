import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/permissions";
import { dayOfWeek } from "@/lib/utils/dates";
import { listPeriods, teacherDaySchedule, weeklySchedule } from "@/modules/timetable";
import { myChildren } from "@/modules/guardians";
import { Alert, Card, EmptyState, LinkButton, PageHeader, StatusBadge } from "@/components/ui";
import { ChildSelector } from "../_components/child-selector";
import { DateNav } from "../_components/date-nav";
import { ServiceError } from "../_components/service-error";
import { load } from "../_lib/load";
import { dateParam, param, ymd, type SearchParams } from "../_lib/helpers";
import { WeekGrid } from "./week-grid";

export const dynamic = "force-dynamic";

type Slots = Awaited<ReturnType<typeof weeklySchedule>>;
type Children = Awaited<ReturnType<typeof myChildren>>;
type Day = Awaited<ReturnType<typeof teacherDaySchedule>>;

export default async function SchedulePage(props: { searchParams: Promise<SearchParams> }) {
  const sp = await props.searchParams;
  const user = await requireCurrentUser();
  const date = dateParam(sp);
  const dow = dayOfWeek(date);

  const periodsResult = await load(() => listPeriods(user));
  if (!periodsResult.ok) return <ServiceError error={periodsResult.error} />;
  const periods = periodsResult.data;

  // ── Parent: child selector → class schedule ──
  if (user.guardianId) {
    const result = await load(async () => {
      const children: Children = await myChildren(user);
      const current = children.find((c) => c.id === param(sp, "studentId")) ?? children[0] ?? null;
      const slots: Slots = current?.classId ? await weeklySchedule(user, { classId: current.classId }) : [];
      return { children, current, slots };
    });
    if (!result.ok) return <ServiceError error={result.error} />;
    const { children, current, slots } = result.data;
    return (
      <div>
        <PageHeader title="Schedule" description="Weekly timetable for your child's class." />
        <ChildSelector items={children} current={current?.id ?? null} basePath="/schedule" />
        {current && !current.classId && <Alert tone="info">{current.firstName} is not assigned to a class yet.</Alert>}
        {current && <WeekGrid slots={slots} periods={periods} linkCourses={false} highlightDay={dow} />}
      </div>
    );
  }

  // ── Student: own class schedule ──
  if (user.studentId) {
    const result = await load(() => weeklySchedule(user, {}));
    if (!result.ok) return <ServiceError error={result.error} />;
    return (
      <div>
        <PageHeader title="My schedule" description="Your class timetable for the week." />
        <WeekGrid slots={result.data} periods={periods} linkCourses={false} highlightDay={dow} />
      </div>
    );
  }

  // ── No teaching profile (admin / staff) ──
  if (!user.teacherId) {
    return (
      <div>
        <PageHeader title="Schedule" />
        <Alert tone="info">
          Your account has no teaching profile.{" "}
          {isAdmin(user) && (
            <Link href="/admin/timetable" className="underline">
              Open the school timetable
            </Link>
          )}
        </Alert>
      </div>
    );
  }

  // ── Teacher / department head: own week + day view with substitutions ──
  const teacherId = user.teacherId;
  const result = await load(async () => {
    const [slots, day] = await Promise.all([weeklySchedule(user, { teacherId }), teacherDaySchedule(user, teacherId, date)]);
    return { slots, day };
  });
  if (!result.ok) return <ServiceError error={result.error} />;
  const { slots, day } = result.data;

  return (
    <div className="space-y-6">
      <PageHeader title="My schedule" description={`${slots.length} teaching periods per week`} actions={<DateNav date={date} basePath="/schedule" />} />

      <Card title={`Lessons on ${ymd(date)}`} description="Includes lessons you cover as a substitute and your lessons covered by others.">
        <DayLessons day={day} date={date} />
      </Card>

      <Card title="Week" padded={false}>
        <div className="p-2">
          <WeekGrid slots={slots} periods={periods} linkCourses highlightDay={dow} />
        </div>
      </Card>
    </div>
  );
}

function DayLessons({ day, date }: { day: Day; date: Date }) {
  if (day.lessons.length === 0) return <EmptyState title="No lessons on this day" />;
  return (
    <ul className="divide-y divide-slate-100">
      {day.lessons.map((l) => {
        const covered = l.kind === "OWN" && !!l.coveredBy;
        return (
          <li key={`${l.kind}-${l.slot.id}`} className="flex flex-wrap items-center justify-between gap-3 py-2" data-testid="row" data-id={l.slot.id}>
            <div className="flex items-center gap-3">
              <div className="w-24 text-xs text-slate-500">
                <div className="font-medium text-slate-700">{l.slot.period.name}</div>
                {l.slot.period.startTime}–{l.slot.period.endTime}
              </div>
              <div>
                <Link href={`/classes/${l.slot.course.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                  {l.slot.course.subject.name} · {l.slot.course.class.name}
                </Link>
                <div className="text-xs text-slate-500">
                  {l.slot.room?.name ?? "No room"} · {l.slot.course.class._count.students} students
                  {l.kind === "SUBSTITUTION" && <span className="ml-2 text-amber-700">Covering for {l.coveringFor.user.name}</span>}
                  {l.kind === "OWN" && l.coveredBy && <span className="ml-2 text-amber-700">Covered by {l.coveredBy.user.name}</span>}
                  {l.kind === "OWN" && l.substitutionStatus === "PENDING" && <span className="ml-2 text-amber-700">Substitute pending</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {l.attendanceSession?.status === "SUBMITTED" ? (
                <Link href={`/attendance/sessions/${l.attendanceSession.id}`}>
                  <StatusBadge status="SUBMITTED" />
                </Link>
              ) : !covered ? (
                <LinkButton href={`/attendance/take?courseId=${l.slot.course.id}&slotId=${l.slot.id}&date=${ymd(date)}`} size="sm" variant="outline">
                  Take attendance
                </LinkButton>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

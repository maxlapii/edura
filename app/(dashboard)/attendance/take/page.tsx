import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { openSession } from "@/modules/attendance";
import { Alert, PageHeader, StatusBadge } from "@/components/ui";
import { fmtLongDate } from "@/lib/format";
import { ServiceError } from "../../_components/service-error";
import { load } from "../../_lib/load";
import { dateParam, param, type SearchParams } from "../../_lib/helpers";
import { AttendanceForm, type AttendanceStatus, type RosterRow } from "./attendance-form";

export const dynamic = "force-dynamic";

export default async function TakeAttendancePage(props: { searchParams: Promise<SearchParams> }) {
  const sp = await props.searchParams;
  const user = await requireCurrentUser();
  const courseId = param(sp, "courseId");
  const slotId = param(sp, "slotId");
  const periodId = param(sp, "periodId");
  const date = dateParam(sp);

  if (!courseId) {
    return (
      <div>
        <PageHeader title="Take attendance" />
        <Alert tone="error">
          No course selected.{" "}
          <Link href="/attendance" className="underline">
            Back to attendance
          </Link>
        </Alert>
      </div>
    );
  }

  const result = await load(() => openSession(user, { courseId, date, timetableSlotId: slotId ?? null, periodId: periodId ?? null }));
  if (!result.ok) return <ServiceError error={result.error} />;
  const { session, roster } = result.data;
  const existing = new Map(session.records.map((r) => [r.studentId, r]));
  const rows: RosterRow[] = roster.map((s) => {
    const rec = existing.get(s.id);
    return { id: s.id, firstName: s.firstName, lastName: s.lastName, studentNumber: s.studentNumber, status: (rec?.status ?? "PRESENT") as AttendanceStatus, note: rec?.note ?? "" };
  });

  return (
    <div>
      <PageHeader
        title={`Attendance · ${session.course.subject.name} · ${session.course.class.name}`}
        breadcrumb={
          <>
            <Link href="/attendance" className="hover:underline">
              Attendance
            </Link>{" "}
            /{" "}
            <Link href={`/classes/${session.courseId}/attendance`} className="hover:underline">
              {session.course.class.name}
            </Link>
          </>
        }
        description={
          <>
            {fmtLongDate(session.date)}
            {session.period ? ` · ${session.period.name} (${session.period.startTime}–${session.period.endTime})` : ""} · {roster.length} students
          </>
        }
        actions={<StatusBadge status={session.status} />}
      />
      {session.status === "SUBMITTED" && <div className="mb-4"><Alert tone="info">This session was already submitted. Saving again will update the records.</Alert></div>}
      {roster.length === 0 ? <Alert tone="warning">This class has no active students.</Alert> : <AttendanceForm sessionId={session.id} initialRows={rows} />}
    </div>
  );
}

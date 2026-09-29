import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { getSubstitution } from "@/modules/substitution";
import { Alert, Card, DescriptionList, LinkButton, PageHeader, StatusBadge } from "@/components/ui";
import { DAY_SHORT, fmtDate, fmtLongDate } from "@/lib/format";
import { ActionButton } from "../../_components/action-button";
import { ServiceError } from "../../_components/service-error";
import { load } from "../../_lib/load";
import { ymd } from "../../_lib/helpers";

export const dynamic = "force-dynamic";

export default async function SubstitutionPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const user = await requireCurrentUser();
  const result = await load(() => getSubstitution(user, id));
  if (!result.ok) return <ServiceError error={result.error} />;
  const s = result.data;
  const isSubstitute = !!user.teacherId && s.substituteTeacherId === user.teacherId;
  const isAbsent = !!user.teacherId && s.absentTeacherId === user.teacherId;
  const slot = s.timetableSlot;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${slot.course.subject.name} · ${slot.course.class.name}`}
        breadcrumb={
          <Link href="/substitutions" className="hover:underline">
            Substitutions
          </Link>
        }
        description={`${fmtLongDate(s.date)} · ${slot.period.name} (${slot.period.startTime}–${slot.period.endTime})${slot.room ? ` · ${slot.room.name}` : ""}`}
        actions={
          <>
            <StatusBadge status={s.status} />
            {isSubstitute && s.status === "ASSIGNED" && (
              <>
                <LinkButton href={`/attendance/take?courseId=${slot.course.id}&slotId=${slot.id}&date=${ymd(s.date)}`} size="sm" variant="outline">
                  Take attendance
                </LinkButton>
                <ActionButton method="PATCH" path={`/api/substitutions/${s.id}`} json={{ status: "DECLINED" }} label="Decline" busyLabel="Declining…" variant="danger" confirmText="Decline this substitution? The administrator will be asked to find another teacher." testId="decline-substitution" />
              </>
            )}
          </>
        }
      />

      {isSubstitute && s.status === "ASSIGNED" && <Alert tone="info">You are covering this lesson for {s.absentTeacher.user.name}. Open the class hub for the roster, lesson plans and attendance.</Alert>}
      {isAbsent && !s.substituteTeacher && s.status === "PENDING" && <Alert tone="warning">A substitute has not been assigned yet.</Alert>}

      <Card title="Details">
        <DescriptionList
          items={[
            { label: "Absent teacher", value: s.absentTeacher.user.name },
            { label: "Substitute", value: s.substituteTeacher?.user.name ?? "Not assigned" },
            { label: "Timetable slot", value: `${DAY_SHORT[slot.dayOfWeek]} · ${slot.period.name}` },
            { label: "Class", value: <Link href={`/classes/${slot.course.id}`} className="text-brand-700 hover:underline">{slot.course.subject.name} · {slot.course.class.name}</Link> },
            { label: "Leave", value: s.leaveRequest ? <Link href={`/leave/${s.leaveRequest.id}`} className="text-brand-700 hover:underline">{s.leaveRequest.type.toLowerCase()} · {fmtDate(s.leaveRequest.startDate)} → {fmtDate(s.leaveRequest.endDate)}</Link> : "—" },
            { label: "Note", value: s.note ?? "—" },
          ]}
        />
      </Card>
    </div>
  );
}

import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { listSubstitutions } from "@/modules/substitution";
import { Alert, Card, EmptyState, PageHeader, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { DAY_SHORT, fmtDate } from "@/lib/format";
import { ServiceError } from "../_components/service-error";
import { load } from "../_lib/load";

export const dynamic = "force-dynamic";

type Sub = Awaited<ReturnType<typeof listSubstitutions>>[number];

export default async function SubstitutionsPage() {
  const user = await requireCurrentUser();
  const result = await load(() => listSubstitutions(user, {}));
  if (!result.ok) return <ServiceError error={result.error} />;
  const all = result.data;
  const tid = user.teacherId;
  const covering = all.filter((s) => s.substituteTeacherId === tid);
  const covered = all.filter((s) => s.absentTeacherId === tid);
  const department = all.filter((s) => s.substituteTeacherId !== tid && s.absentTeacherId !== tid);

  return (
    <div className="space-y-6">
      <PageHeader title="Substitutions" description="Lessons you cover for colleagues, and your own lessons covered while you are away." />
      {!tid && <Alert tone="info">Your account has no teaching profile. Administrators manage substitutions under Administration → Substitutions.</Alert>}
      <SubTable title="Covering for others" description="Assigned to you as a substitute." items={covering} mode="covering" />
      <SubTable title="My lessons covered" description="Your lessons during approved leave." items={covered} mode="covered" />
      {user.role === "DEPARTMENT_HEAD" && department.length > 0 && <SubTable title="Department" description="Substitutions for teachers in your department." items={department} mode="department" />}
    </div>
  );
}

function SubTable({ title, description, items, mode }: { title: string; description: string; items: Sub[]; mode: "covering" | "covered" | "department" }) {
  return (
    <Card title={title} description={description} padded={false}>
      {items.length === 0 ? (
        <div className="p-4">
          <EmptyState title="Nothing here" />
        </div>
      ) : (
        <Table className="rounded-t-none border-0">
          <THead>
            <tr>
              <TH>Date</TH>
              <TH>Period</TH>
              <TH>Lesson</TH>
              {mode !== "covered" && <TH>Absent teacher</TH>}
              {mode !== "covering" && <TH>Substitute</TH>}
              <TH>Status</TH>
            </tr>
          </THead>
          <TBody>
            {items.map((s) => (
              <TR key={s.id} data-testid="row" data-id={s.id}>
                <TD className="whitespace-nowrap">
                  <Link href={`/substitutions/${s.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                    {DAY_SHORT[s.timetableSlot.dayOfWeek]} {fmtDate(s.date)}
                  </Link>
                </TD>
                <TD>{s.timetableSlot.period.name}</TD>
                <TD>
                  {s.timetableSlot.course.subject.name} · {s.timetableSlot.course.class.name}
                  {s.timetableSlot.room && <span className="ml-1 text-xs text-slate-500">· {s.timetableSlot.room.name}</span>}
                </TD>
                {mode !== "covered" && <TD>{s.absentTeacher.user.name}</TD>}
                {mode !== "covering" && <TD>{s.substituteTeacher?.user.name ?? <span className="text-slate-400">Not assigned</span>}</TD>}
                <TD>
                  <StatusBadge status={s.status} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </Card>
  );
}

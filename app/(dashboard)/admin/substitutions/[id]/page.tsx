import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { suggestSubstitutes } from "@/modules/substitution";
import { Alert, Badge, Card, DescriptionList, PageHeader, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { DAY_NAMES, fmtDate, humanize } from "@/lib/format";
import { ActionButton } from "../../_components/action-button";
import { guarded } from "../../_lib/guard";
import type { PageProps } from "../../_lib/types";

export const dynamic = "force-dynamic";

export default async function SubstitutionDetailPage({ params }: PageProps<{ id: string }>) {
  const { id } = await params;
  const user = await requireCurrentUser();
  const res = await guarded(() => suggestSubstitutes(user, id));
  if (!res.ok) return <Alert tone="error">{res.error}</Alert>;
  const { substitution: sub, candidates } = res.data;
  const slot = sub.timetableSlot;
  const open = sub.status === "PENDING" || sub.status === "DECLINED";
  const eligible = candidates.filter((c) => c.eligible);
  return (
    <div className="space-y-6">
      <PageHeader
        title={`${slot.course.subject.name} · ${slot.course.class.name}`}
        description={`${DAY_NAMES[slot.dayOfWeek]} ${fmtDate(sub.date)} · ${slot.period.name} (${slot.period.startTime}–${slot.period.endTime}) · covering for ${sub.absentTeacher.user.name}`}
        breadcrumb={
          <Link href="/admin/substitutions" className="hover:underline">
            Substitutions
          </Link>
        }
        actions={
          <>
            <StatusBadge status={sub.status} />
            {sub.status === "ASSIGNED" && <ActionButton action={`/api/substitutions/${sub.id}`} method="PATCH" body={{ status: "COMPLETED" }} label="Mark completed" testId="complete" />}
            {sub.status !== "CANCELLED" && sub.status !== "COMPLETED" && <ActionButton action={`/api/substitutions/${sub.id}`} method="PATCH" body={{ status: "CANCELLED" }} label="Cancel" variant="danger" confirm="Cancel this substitution need?" testId="cancel" />}
            {sub.status === "CANCELLED" && <ActionButton action={`/api/substitutions/${sub.id}`} method="PATCH" body={{ status: "PENDING" }} label="Reopen" testId="reopen" />}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Candidates" description={open ? `${eligible.length} eligible of ${candidates.length} teachers, ranked by availability, subject and department match, workload and fairness.` : "The need is no longer open; candidates are shown for reference."} padded={false}>
            <Table className="rounded-none border-0">
              <THead>
                <TR>
                  <TH>Teacher</TH>
                  <TH>Score</TH>
                  <TH>Reasons</TH>
                  <TH>Utilization</TH>
                  <TH>Subs this week</TH>
                  <TH className="text-right">Assign</TH>
                </TR>
              </THead>
              <TBody>
                {candidates.map((c) => (
                  <TR key={c.teacherId} data-testid="candidate" data-id={c.teacherId} data-eligible={c.eligible ? "true" : "false"} className={c.eligible ? undefined : "opacity-60"}>
                    <TD>
                      <Link href={`/admin/teachers/${c.teacherId}`} className="font-medium text-brand-700 hover:underline">
                        {c.name}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {c.subjectMatch && <Badge tone="green">Subject</Badge>}
                        {c.departmentMatch && <Badge tone="blue">Department</Badge>}
                        {!c.eligible && <Badge tone="red">Not eligible</Badge>}
                      </div>
                    </TD>
                    <TD>{c.eligible ? c.score : "—"}</TD>
                    <TD className="max-w-md text-xs">
                      {c.conflicts.length > 0 && (
                        <ul className="list-disc pl-4 text-red-700">
                          {c.conflicts.map((r, i) => (
                            <li key={i}>{r}</li>
                          ))}
                        </ul>
                      )}
                      {c.reasons.length > 0 && (
                        <ul className="list-disc pl-4 text-slate-600">
                          {c.reasons.map((r, i) => (
                            <li key={i}>{r}</li>
                          ))}
                        </ul>
                      )}
                    </TD>
                    <TD>
                      <span className={c.utilization >= 110 ? "text-red-700" : c.utilization >= 95 ? "text-amber-700" : ""}>{c.utilization}%</span>
                    </TD>
                    <TD>{c.substitutionsThisWeek}</TD>
                    <TD className="text-right">{c.eligible && open && <ActionButton action={`/api/substitutions/${sub.id}/assign`} method="POST" body={{ substituteTeacherId: c.teacherId }} label="Assign" variant="primary" testId="assign" />}</TD>
                  </TR>
                ))}
                {candidates.length === 0 && (
                  <TR>
                    <TD colSpan={6} className="text-center text-slate-500">
                      No teachers found.
                    </TD>
                  </TR>
                )}
              </TBody>
            </Table>
          </Card>
        </div>
        <div className="space-y-6">
          <Card title="Substitution">
            <DescriptionList
              items={[
                { label: "Absent teacher", value: <Link href={`/admin/teachers/${sub.absentTeacher.id}`} className="text-brand-700 hover:underline">{sub.absentTeacher.user.name}</Link> },
                { label: "Substitute", value: sub.substituteTeacher ? <Link href={`/admin/teachers/${sub.substituteTeacher.id}`} className="text-brand-700 hover:underline">{sub.substituteTeacher.user.name}</Link> : "—" },
                { label: "Class", value: <Link href={`/admin/classes/${slot.course.class.id}`} className="text-brand-700 hover:underline">{slot.course.class.name}</Link> },
                { label: "Room", value: slot.room?.name ?? "—" },
                { label: "Leave request", value: sub.leaveRequest ? <Link href={`/admin/leave/${sub.leaveRequest.id}`} className="text-brand-700 hover:underline">{humanize(sub.leaveRequest.type)} · {fmtDate(sub.leaveRequest.startDate)} → {fmtDate(sub.leaveRequest.endDate)}</Link> : "—" },
                { label: "Note", value: sub.note ?? "—" },
              ]}
            />
          </Card>
          {sub.status === "ASSIGNED" && (
            <Card title="Reassign">
              <p className="mb-2 text-sm text-slate-600">To pick a different teacher, decline the current assignment first.</p>
              <ActionButton action={`/api/substitutions/${sub.id}`} method="PATCH" body={{ status: "DECLINED" }} label="Decline current assignment" variant="outline" testId="decline" />
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

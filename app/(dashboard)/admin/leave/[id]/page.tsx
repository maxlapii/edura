import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { getLeaveRequest } from "@/modules/leave";
import { Alert, Badge, Card, DescriptionList, LinkButton, PageHeader, StatCard, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { DAY_SHORT, fmtDate, fmtDateTime, humanize } from "@/lib/format";
import { ActionButton } from "../../_components/action-button";
import { guarded } from "../../_lib/guard";
import type { PageProps } from "../../_lib/types";
import { LeaveReviewForm } from "./review-form";

export const dynamic = "force-dynamic";

export default async function LeaveDetailPage({ params }: PageProps<{ id: string }>) {
  const { id } = await params;
  const user = await requireCurrentUser();
  const res = await guarded(() => getLeaveRequest(user, id));
  if (!res.ok) return <Alert tone="error">{res.error}</Alert>;
  const leave = res.data;
  const impact = leave.impact;
  const name = leave.teacher?.user.name ?? leave.requester.name;
  return (
    <div className="space-y-6">
      <PageHeader
        title={`${name} · ${humanize(leave.type)} leave`}
        description={`${fmtDate(leave.startDate)} → ${fmtDate(leave.endDate)} · ${impact.days} days (${impact.workingDays} working days)`}
        breadcrumb={
          <Link href="/admin/leave" className="hover:underline">
            Leave requests
          </Link>
        }
        actions={
          <>
            <StatusBadge status={leave.status} />
            {leave.teacher && (
              <LinkButton href={`/admin/teachers/${leave.teacher.id}`} variant="outline" size="sm">
                Teacher profile
              </LinkButton>
            )}
          </>
        }
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Lessons affected" value={impact.lessons} tone={impact.lessons ? "warn" : "good"} />
        <StatCard label="Classes affected" value={impact.classesAffected} />
        <StatCard label="Students affected" value={impact.studentsAffected} />
        <StatCard label="Cover arranged" value={`${impact.affected.filter((a) => a.substitution?.status === "ASSIGNED" || a.substitution?.status === "COMPLETED").length} / ${impact.lessons}`} tone={impact.lessons && impact.affected.some((a) => !a.substitution || a.substitution.status === "PENDING") ? "warn" : "good"} />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="Affected lessons" description={leave.status === "APPROVED" ? "Substitution needs were created on approval." : "Substitution needs are created when the leave is approved."} padded={false}>
            <Table className="rounded-none border-0">
              <THead>
                <TR>
                  <TH>Date</TH>
                  <TH>Period</TH>
                  <TH>Lesson</TH>
                  <TH>Students</TH>
                  <TH>Cover</TH>
                  <TH>Top suggestions</TH>
                </TR>
              </THead>
              <TBody>
                {impact.affected.map((a) => (
                  <TR key={`${a.slot.id}-${a.date.toISOString()}`} data-testid="affected-row" data-id={a.slot.id}>
                    <TD>
                      {DAY_SHORT[a.slot.dayOfWeek]} {fmtDate(a.date)}
                    </TD>
                    <TD>
                      {a.slot.period.name}
                      <div className="text-xs text-slate-500">
                        {a.slot.period.startTime}–{a.slot.period.endTime}
                      </div>
                    </TD>
                    <TD>
                      {a.slot.course.subject.name} · <Link href={`/admin/classes/${a.slot.course.class.id}`} className="hover:underline">{a.slot.course.class.name}</Link>
                      <div className="text-xs text-slate-500">{a.slot.room?.name ?? "No room"}</div>
                    </TD>
                    <TD>{a.slot.course.class._count.students}</TD>
                    <TD>
                      {a.substitution ? (
                        <Link href={`/admin/substitutions/${a.substitution.id}`} className="inline-flex flex-col gap-0.5 hover:underline" data-testid="substitution-link">
                          <StatusBadge status={a.substitution.status} />
                          {a.substitution.substituteTeacher && <span className="text-xs">{a.substitution.substituteTeacher.user.name}</span>}
                        </Link>
                      ) : (
                        <span className="text-xs text-slate-400">not yet created</span>
                      )}
                    </TD>
                    <TD>
                      {a.suggestions.length ? (
                        <ul className="space-y-0.5 text-xs">
                          {a.suggestions.slice(0, 3).map((s) => (
                            <li key={s.teacherId} title={s.reasons.join("; ")}>
                              <span className="font-medium">{s.name}</span> <Badge tone="green">{s.score}</Badge>
                              <span className="text-slate-500"> · {s.reasons.slice(0, 2).join(", ")}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="text-xs text-slate-400">{a.substitution && a.substitution.status !== "PENDING" ? "—" : "no eligible teacher"}</span>
                      )}
                    </TD>
                  </TR>
                ))}
                {impact.affected.length === 0 && (
                  <TR>
                    <TD colSpan={6} className="text-center text-slate-500">
                      No timetabled lessons fall within this leave.
                    </TD>
                  </TR>
                )}
              </TBody>
            </Table>
          </Card>
          {leave.substitutions.length > 0 && (
            <Card title="Substitutions">
              <ul className="divide-y divide-slate-100 text-sm">
                {leave.substitutions.map((s) => (
                  <li key={s.id} className="flex items-center justify-between py-2" data-testid="substitution-row" data-id={s.id}>
                    <Link href={`/admin/substitutions/${s.id}`} className="hover:text-brand-700">
                      {fmtDate(s.date)} · {s.timetableSlot.period.name} · {s.timetableSlot.course.subject.name} {s.timetableSlot.course.class.name}
                      {s.substituteTeacher && <span className="text-slate-500"> → {s.substituteTeacher.user.name}</span>}
                    </Link>
                    <StatusBadge status={s.status} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        <div className="space-y-6">
          <Card title="Request">
            <DescriptionList
              items={[
                { label: "Requested by", value: leave.requester.name },
                { label: "Submitted", value: fmtDateTime(leave.createdAt) },
                { label: "Reason", value: leave.reason ?? "—" },
                { label: "Department", value: leave.teacher?.department?.name ?? "—" },
                { label: "Reviewed by", value: leave.reviewedBy?.name ?? "—" },
                { label: "Decision", value: leave.reviewedAt ? fmtDateTime(leave.reviewedAt) : "—" },
                { label: "Review comment", value: leave.reviewComment ?? "—" },
              ]}
            />
          </Card>
          {leave.status === "PENDING" ? (
            <Card title="Review">
              <LeaveReviewForm leaveId={leave.id} />
            </Card>
          ) : (
            leave.status === "APPROVED" && (
              <Card title="Actions">
                <ActionButton action={`/api/leave/${leave.id}`} method="DELETE" label="Cancel leave" variant="danger" confirm="Cancel this approved leave? Pending substitutions will be cancelled." testId="cancel-leave" />
              </Card>
            )
          )}
        </div>
      </div>
    </div>
  );
}

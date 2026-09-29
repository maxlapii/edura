import { notFound } from "next/navigation";
import { requireCurrentUser } from "@/lib/auth/session";
import { getReportCard } from "@/modules/reportCards";
import { isAdmin } from "@/lib/permissions";
import { Alert, Card, DescriptionList, PageHeader, StatCard, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { fmtDate } from "@/lib/format";
import { isAppError } from "@/lib/utils/errors";
import { ReportCardActions } from "./actions";

export const dynamic = "force-dynamic";

export default async function ReportCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireCurrentUser();
  let card: Awaited<ReturnType<typeof getReportCard>> | null = null;
  let error: string | null = null;
  try {
    card = await getReportCard(user, id);
  } catch (e) {
    if (isAppError(e) && e.code === "NOT_FOUND") notFound();
    error = isAppError(e) ? e.message : "Could not load report card";
  }
  if (error || !card) return <Alert tone="error">{error ?? "Not found"}</Alert>;
  const canEdit = card.status === "DRAFT" && (isAdmin(user) || !!user.teacherId);
  return (
    <div className="space-y-6" data-testid="report-card" data-id={card.id} data-status={card.status}>
      <PageHeader title={`${card.student.firstName} ${card.student.lastName}`} description={`${card.term.name} · ${card.term.academicYear.name} · Class ${card.student.class?.name ?? "—"}`} actions={<StatusBadge status={card.status} />} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Overall average" value={card.data.overall ?? "—"} />
        <StatCard label="Attendance" value={`${card.data.attendance.attendanceRate}%`} hint={`${card.data.attendance.absent} absent · ${card.data.attendance.late} late`} tone={card.data.attendance.attendanceRate < 90 ? "warn" : "good"} />
        <StatCard label="Subjects" value={card.data.courses.length} />
        <StatCard label="Published" value={fmtDate(card.publishedAt)} hint={card.publishedBy?.name} />
      </div>
      <Card title="Subjects">
        <Table>
          <THead>
            <TR>
              <TH>Subject</TH>
              <TH>Teacher</TH>
              <TH>Average</TH>
              <TH>Grade</TH>
              <TH>Graded items</TH>
            </TR>
          </THead>
          <TBody>
            {card.data.courses.map((c) => (
              <TR key={c.courseId} data-testid="subject-row">
                <TD>{c.subject}</TD>
                <TD>{c.teacher}</TD>
                <TD>{c.average ?? "—"}%</TD>
                <TD>{c.letter ? <StatusBadge status={c.letter} /> : "—"}</TD>
                <TD>{c.graded}</TD>
              </TR>
            ))}
            {card.data.courses.length === 0 && (
              <TR>
                <TD colSpan={5} className="text-slate-500">
                  No published grades for this term yet.
                </TD>
              </TR>
            )}
          </TBody>
        </Table>
      </Card>
      <Card title="Comments">
        <DescriptionList items={[{ label: "Homeroom teacher", value: card.teacherComment ?? "—" }, { label: "Principal", value: card.principalComment ?? "—" }]} />
      </Card>
      {(canEdit || (card.status === "DRAFT" && isAdmin(user))) && <ReportCardActions card={{ id: card.id, teacherComment: card.teacherComment, principalComment: card.principalComment }} canPublish={isAdmin(user)} canPrincipalComment={isAdmin(user)} />}
    </div>
  );
}

import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { getCourse } from "@/modules/classes";
import { listAssignments } from "@/modules/assignments";
import { Card, EmptyState, LinkButton, StatusBadge, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { fmtDateTime } from "@/lib/format";
import { ServiceError } from "../../../_components/service-error";
import { load } from "../../../_lib/load";
import { CourseHub } from "../../_components/course-hub";

export const dynamic = "force-dynamic";

export default async function CourseAssignmentsPage(props: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await props.params;
  const user = await requireCurrentUser();
  const result = await load(async () => {
    const course = await getCourse(user, courseId);
    const assignments = await listAssignments(user, { courseId });
    return { course, assignments };
  });
  if (!result.ok) return <ServiceError error={result.error} />;
  const { course, assignments } = result.data;
  const canManage = user.teacherId === course.teacherId || user.role === "SCHOOL_ADMIN" || user.role === "SUPER_ADMIN" || user.role === "PRINCIPAL";

  return (
    <div>
      <CourseHub
        course={course}
        tab="assignments"
        actions={
          canManage ? (
            <LinkButton href={`/assignments/new?courseId=${course.id}`} size="sm" data-testid="new-assignment">
              New assignment
            </LinkButton>
          ) : undefined
        }
      />
      {assignments.length === 0 ? (
        <EmptyState title="No assignments yet" action={canManage ? <LinkButton href={`/assignments/new?courseId=${course.id}`}>Create the first assignment</LinkButton> : undefined} />
      ) : (
        <Card padded={false}>
          <Table className="border-0">
            <THead>
              <tr>
                <TH>Title</TH>
                <TH>Due</TH>
                <TH>Max score</TH>
                <TH>Status</TH>
                <TH>Submissions</TH>
              </tr>
            </THead>
            <TBody>
              {assignments.map((a) => (
                <TR key={a.id} data-testid="row" data-id={a.id}>
                  <TD>
                    <Link href={`/assignments/${a.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                      {a.title}
                    </Link>
                  </TD>
                  <TD className={a.dueDate < new Date() ? "text-slate-500" : ""}>{fmtDateTime(a.dueDate)}</TD>
                  <TD>{a.maxScore}</TD>
                  <TD>
                    <StatusBadge status={a.status} />
                  </TD>
                  <TD>{a._count.submissions}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { getCourse } from "@/modules/classes";
import { classRoster } from "@/modules/students/service";
import { Alert, Card, EmptyState, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { ServiceError } from "../../_components/service-error";
import { load } from "../../_lib/load";
import { CourseHub } from "../_components/course-hub";

export const dynamic = "force-dynamic";

export default async function CourseStudentsPage(props: { params: Promise<{ courseId: string }> }) {
  const { courseId } = await props.params;
  const user = await requireCurrentUser();
  const rosterVisible = !user.studentId && !user.guardianId;
  const result = await load(async () => {
    const course = await getCourse(user, courseId);
    const roster = rosterVisible ? await classRoster(course.classId) : [];
    return { course, roster };
  });
  if (!result.ok) return <ServiceError error={result.error} />;
  const { course, roster } = result.data;

  return (
    <div>
      <CourseHub course={course} tab="students" />
      {!rosterVisible ? (
        <Alert tone="info">The class roster is only visible to school staff.</Alert>
      ) : roster.length === 0 ? (
        <EmptyState title="No students in this class" />
      ) : (
        <Card title="Students" description={`${roster.length} active students`} padded={false}>
          <Table className="rounded-t-none border-0">
            <THead>
              <tr>
                <TH>Name</TH>
                <TH>Student number</TH>
              </tr>
            </THead>
            <TBody>
              {roster.map((s) => (
                <TR key={s.id} data-testid="row" data-id={s.id}>
                  <TD>
                    <Link href={`/students/${s.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                      {s.lastName}, {s.firstName}
                    </Link>
                  </TD>
                  <TD className="text-slate-500">{s.studentNumber}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

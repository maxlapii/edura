import Link from "next/link";
import { requireCurrentUser } from "@/lib/auth/session";
import { getClass } from "@/modules/classes";
import { Alert, Card, LinkButton, PageHeader, Table, TBody, TD, TH, THead, TR } from "@/components/ui";
import { ActionButton } from "../../_components/action-button";
import { EntityForm } from "../../_components/entity-form";
import { guarded } from "../../_lib/guard";
import { allTeacherOptions, roomOptions, studentOptions, subjectOptions, teacherOptions } from "../../_lib/options";
import type { PageProps } from "../../_lib/types";
import { CourseTeacherForm } from "./course-teacher-form";

export const dynamic = "force-dynamic";

export default async function ClassDetailPage({ params }: PageProps<{ id: string }>) {
  const { id } = await params;
  const user = await requireCurrentUser();
  const res = await guarded(() => getClass(user, id));
  if (!res.ok) return <Alert tone="error">{res.error}</Alert>;
  const cls = res.data;
  const [teachers, activeTeachers, rooms, subjects, candidates] = await Promise.all([allTeacherOptions(user), teacherOptions(user), roomOptions(user), subjectOptions(user), studentOptions(user, { excludeClassId: cls.id })]);
  const usedSubjects = new Set(cls.courses.map((c) => c.subjectId));
  return (
    <div className="space-y-6">
      <PageHeader
        title={cls.name}
        description={`${cls.academicYear.name}${cls.gradeLevel !== null ? ` · Grade ${cls.gradeLevel}` : ""} · ${cls.students.length} students${cls.capacity ? ` / ${cls.capacity}` : ""}`}
        breadcrumb={
          <Link href="/admin/classes" className="hover:underline">
            Classes
          </Link>
        }
        actions={
          <>
            <LinkButton href={`/admin/timetable?view=class&id=${cls.id}`} variant="outline" size="sm" data-testid="class-timetable">
              Timetable
            </LinkButton>
            <LinkButton href={`/admin/attendance?classId=${cls.id}`} variant="outline" size="sm">
              Attendance
            </LinkButton>
            <ActionButton action={`/api/classes/${cls.id}`} method="DELETE" label="Delete class" variant="danger" confirm={`Delete class ${cls.name}?`} redirectTo="/admin/classes" testId="delete" />
          </>
        }
      />
      <Card title="Class details">
        <EntityForm
          testId="class-form"
          method="PATCH"
          action={`/api/classes/${cls.id}`}
          initial={cls as unknown as Record<string, unknown>}
          columns={3}
          fields={[
            { name: "name", label: "Class name", required: true },
            { name: "gradeLevel", label: "Grade level", type: "number", min: 0, max: 20, nullable: true },
            { name: "capacity", label: "Capacity", type: "number", min: 1, max: 500, nullable: true },
            { name: "homeroomTeacherId", label: "Homeroom teacher", type: "select", options: teachers, nullable: true },
            { name: "roomId", label: "Room", type: "select", options: rooms, nullable: true },
          ]}
        />
      </Card>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title={`Courses (${cls.courses.length})`} description="A course is a subject taught to this class by one teacher." padded={false}>
            <Table className="rounded-none border-0">
              <THead>
                <TR>
                  <TH>Subject</TH>
                  <TH>Teacher</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {cls.courses.map((c) => (
                  <TR key={c.id} data-testid="course-row" data-id={c.id}>
                    <TD>
                      <div className="font-medium">{c.subject.name}</div>
                      <div className="text-xs text-slate-500">{c.name ?? c.subject.code}</div>
                    </TD>
                    <TD>
                      <CourseTeacherForm courseId={c.id} teacherId={c.teacherId} teachers={teachers} />
                    </TD>
                    <TD className="text-right">
                      <ActionButton action={`/api/courses/${c.id}`} method="DELETE" label="Delete" variant="danger" confirm={`Delete course ${c.subject.name}?`} testId="delete-course" />
                    </TD>
                  </TR>
                ))}
                {cls.courses.length === 0 && (
                  <TR>
                    <TD colSpan={3} className="text-center text-slate-500">
                      No courses yet. Add one on the right.
                    </TD>
                  </TR>
                )}
              </TBody>
            </Table>
          </Card>
        </div>
        <Card title="Add course">
          <EntityForm
            testId="course-form"
            action="/api/courses"
            submitLabel="Add course"
            resetOnSuccess
            columns={1}
            compact
            initial={{ classId: cls.id }}
            fields={[
              { name: "classId", label: "Class", type: "hidden" },
              { name: "subjectId", label: "Subject", type: "select", options: subjects.map((s) => (usedSubjects.has(s.value) ? { ...s, label: `${s.label} (already added)` } : s)), required: true, placeholder: "Select a subject…" },
              { name: "teacherId", label: "Teacher", type: "select", options: activeTeachers, required: true, placeholder: "Select a teacher…" },
            ]}
          />
        </Card>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card title={`Students (${cls.students.length})`} padded={false}>
            <Table className="rounded-none border-0">
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Student #</TH>
                  <TH>Gender</TH>
                </TR>
              </THead>
              <TBody>
                {cls.students.map((s) => (
                  <TR key={s.id} data-testid="student-row" data-id={s.id}>
                    <TD>
                      <Link href={`/admin/students/${s.id}`} className="font-medium text-brand-700 hover:underline">
                        {s.lastName}, {s.firstName}
                      </Link>
                    </TD>
                    <TD>{s.studentNumber}</TD>
                    <TD>{s.gender ?? "—"}</TD>
                  </TR>
                ))}
                {cls.students.length === 0 && (
                  <TR>
                    <TD colSpan={3} className="text-center text-slate-500">
                      No students in this class yet.
                    </TD>
                  </TR>
                )}
              </TBody>
            </Table>
          </Card>
        </div>
        <Card title="Add students" description="Students without a class or currently in another class.">
          <EntityForm testId="assign-students-form" action={`/api/classes/${cls.id}/students`} submitLabel="Add to class" resetOnSuccess columns={1} compact fields={[{ name: "studentIds", label: "Students", type: "multiselect", options: candidates }]} />
        </Card>
      </div>
    </div>
  );
}

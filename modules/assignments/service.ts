import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { AuthUser } from "@/lib/auth/types";
import { assertPermission, assertSchoolAccess, isAdmin, resolveSchoolId } from "@/lib/permissions";
import { AppError } from "@/lib/utils/errors";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { dispatch } from "@/lib/workflows/engine";
import { assertCourseAccess } from "@/modules/classes/service";
import { classRoster, guardianUserIdsForStudent } from "@/modules/students/service";
import type { AssignmentFilter, CreateAssignmentInput, SubmitAssignmentInput, UpdateAssignmentInput } from "./schema";

const assignmentInclude = {
  course: { include: { subject: { select: { id: true, name: true } }, class: { select: { id: true, name: true } }, teacher: { include: { user: { select: { id: true, name: true } } } } } },
  _count: { select: { submissions: true } },
} satisfies Prisma.AssignmentInclude;

async function assertCanManage(user: AuthUser, course: { id: string; teacherId: string; classId: string; schoolId: string; subjectId: string }) {
  assertPermission(user, "assignments:manage");
  assertSchoolAccess(user, course.schoolId);
  if (isAdmin(user) || (user.teacherId && course.teacherId === user.teacherId)) return;
  throw AppError.forbidden("Only the course teacher can manage assignments");
}

export async function createAssignment(user: AuthUser, input: CreateAssignmentInput) {
  const course = await prisma.course.findUnique({ where: { id: input.courseId }, include: { subject: true, class: true } });
  if (!course) throw AppError.notFound("Course");
  await assertCanManage(user, course);
  const assignment = await prisma.assignment.create({
    data: { schoolId: course.schoolId, courseId: course.id, title: input.title, description: input.description ?? null, dueDate: input.dueDate, maxScore: input.maxScore, attachments: input.attachments, rubric: input.rubric ?? undefined, status: input.status },
    include: assignmentInclude,
  });
  await audit({ user, schoolId: course.schoolId, action: "assignment.create", entityType: "Assignment", entityId: assignment.id, after: assignment });
  if (assignment.status === "PUBLISHED") await notifyStudentsOfAssignment(assignment.id, course.classId, `New assignment: ${assignment.title}`, `${course.subject.name} – due ${assignment.dueDate.toISOString().slice(0, 10)}`);
  return assignment;
}

async function notifyStudentsOfAssignment(assignmentId: string, classId: string, title: string, body: string) {
  const roster = await classRoster(classId);
  const schoolId = (await prisma.assignment.findUniqueOrThrow({ where: { id: assignmentId }, select: { schoolId: true } })).schoolId;
  for (const s of roster) {
    if (s.userId) await notify({ schoolId, userId: s.userId, type: "ASSIGNMENT_CREATED", title, body, link: `/assignments/${assignmentId}` });
  }
}

export async function updateAssignment(user: AuthUser, id: string, input: UpdateAssignmentInput) {
  const before = await prisma.assignment.findUnique({ where: { id }, include: { course: { include: { subject: true } } } });
  if (!before) throw AppError.notFound("Assignment");
  await assertCanManage(user, before.course);
  const assignment = await prisma.assignment.update({ where: { id }, data: { ...input, rubric: input.rubric === undefined ? undefined : (input.rubric ?? undefined) }, include: assignmentInclude });
  await audit({ user, schoolId: before.schoolId, action: "assignment.update", entityType: "Assignment", entityId: id, before, after: assignment });
  if (before.status === "DRAFT" && assignment.status === "PUBLISHED") await notifyStudentsOfAssignment(id, before.course.classId, `New assignment: ${assignment.title}`, `${before.course.subject.name} – due ${assignment.dueDate.toISOString().slice(0, 10)}`);
  return assignment;
}

export async function deleteAssignment(user: AuthUser, id: string) {
  const before = await prisma.assignment.findUnique({ where: { id }, include: { course: true, _count: { select: { grades: true } } } });
  if (!before) throw AppError.notFound("Assignment");
  await assertCanManage(user, before.course);
  if (before._count.grades > 0) throw AppError.conflict("Assignment already has grades");
  await prisma.assignment.delete({ where: { id } });
  await audit({ user, schoolId: before.schoolId, action: "assignment.delete", entityType: "Assignment", entityId: id, before });
}

/** Assignments visible to the caller with quick filters. */
export async function listAssignments(user: AuthUser, opts: { courseId?: string; filter?: AssignmentFilter } = {}) {
  assertPermission(user, "assignments:read");
  const schoolId = resolveSchoolId(user);
  const where: Prisma.AssignmentWhereInput = { schoolId, courseId: opts.courseId };
  const now = new Date();
  if (user.studentId) {
    where.status = { not: "DRAFT" };
    where.course = { class: { students: { some: { id: user.studentId } } } };
    if (opts.filter === "missing" || opts.filter === "overdue") where.submissions = { none: { studentId: user.studentId } };
    if (opts.filter === "overdue") where.dueDate = { lt: now };
    if (opts.filter === "submitted") where.submissions = { some: { studentId: user.studentId } };
    if (opts.filter === "late") where.submissions = { some: { studentId: user.studentId, isLate: true } };
    if (opts.filter === "graded") where.submissions = { some: { studentId: user.studentId, status: "GRADED" } };
    if (opts.filter === "upcoming") where.dueDate = { gte: now };
  } else if (user.guardianId) {
    where.status = { not: "DRAFT" };
    where.course = { class: { students: { some: { guardians: { some: { guardianId: user.guardianId } } } } } };
    if (opts.filter === "overdue") where.dueDate = { lt: now };
    if (opts.filter === "upcoming") where.dueDate = { gte: now };
  } else if (!isAdmin(user) && user.teacherId) {
    where.course = { OR: [{ teacherId: user.teacherId }, { class: { homeroomTeacherId: user.teacherId } }, ...(user.role === "DEPARTMENT_HEAD" && user.departmentId ? [{ subject: { departmentId: user.departmentId } }] : [])] };
  }
  if (!user.studentId && !user.guardianId) {
    if (opts.filter === "submitted") where.submissions = { some: { status: "SUBMITTED" } };
    if (opts.filter === "graded") where.submissions = { some: { status: "GRADED" } };
    if (opts.filter === "late") where.submissions = { some: { isLate: true } };
    if (opts.filter === "overdue") where.dueDate = { lt: now };
    if (opts.filter === "upcoming") where.dueDate = { gte: now };
  }
  const assignments = await prisma.assignment.findMany({ where, include: { ...assignmentInclude, submissions: user.studentId ? { where: { studentId: user.studentId } } : false }, orderBy: { dueDate: "desc" }, take: 200 });
  if (opts.filter === "missing" && !user.studentId && !user.guardianId) {
    // Teachers: assignments (past due) that still have missing submissions.
    const out = [];
    for (const a of assignments) {
      if (a.dueDate >= now) continue;
      const rosterCount = await prisma.student.count({ where: { classId: a.course.class.id, status: "ACTIVE" } });
      if (a._count.submissions < rosterCount) out.push(a);
    }
    return out;
  }
  return assignments;
}

/** Assignment detail with per-student submission status (teachers) or own submission (students). */
export async function getAssignment(user: AuthUser, id: string) {
  assertPermission(user, "assignments:read");
  const assignment = await prisma.assignment.findUnique({ where: { id }, include: { ...assignmentInclude, submissions: { include: { student: { select: { id: true, firstName: true, lastName: true, studentNumber: true } } } }, grades: true } });
  if (!assignment) throw AppError.notFound("Assignment");
  await assertCourseAccess(user, assignment.course);
  if (assignment.status === "DRAFT" && (user.studentId || user.guardianId)) throw AppError.notFound("Assignment");
  if (user.studentId) {
    return { ...assignment, submissions: assignment.submissions.filter((s) => s.studentId === user.studentId), grades: assignment.grades.filter((g) => g.studentId === user.studentId && g.status !== "DRAFT"), roster: [] };
  }
  if (user.guardianId) {
    const links = await prisma.studentGuardian.findMany({ where: { guardianId: user.guardianId }, select: { studentId: true } });
    const ids = new Set(links.map((l) => l.studentId));
    return { ...assignment, submissions: assignment.submissions.filter((s) => ids.has(s.studentId)), grades: assignment.grades.filter((g) => ids.has(g.studentId) && g.status !== "DRAFT"), roster: [] };
  }
  const roster = await classRoster(assignment.course.class.id);
  const now = new Date();
  const rows = roster.map((s) => {
    const submission = assignment.submissions.find((x) => x.studentId === s.id) ?? null;
    const grade = assignment.grades.find((g) => g.studentId === s.id) ?? null;
    const state = grade ? "GRADED" : submission ? (submission.isLate ? "LATE" : "SUBMITTED") : assignment.dueDate < now ? "MISSING" : "PENDING";
    return { student: s, submission, grade, state };
  });
  const counts = rows.reduce((acc, r) => ({ ...acc, [r.state]: (acc[r.state] ?? 0) + 1 }), {} as Record<string, number>);
  return { ...assignment, roster: rows, counts };
}

export async function submitAssignment(user: AuthUser, assignmentId: string, input: SubmitAssignmentInput) {
  assertPermission(user, "assignments:submit");
  if (!user.studentId) throw AppError.forbidden("Only students can submit assignments");
  const assignment = await prisma.assignment.findUnique({ where: { id: assignmentId }, include: { course: { include: { teacher: { select: { userId: true } }, subject: { select: { name: true } } } } } });
  if (!assignment) throw AppError.notFound("Assignment");
  await assertCourseAccess(user, assignment.course);
  if (assignment.status !== "PUBLISHED") throw AppError.conflict("Assignment is not open for submissions");
  const existingGrade = await prisma.grade.findUnique({ where: { assignmentId_studentId: { assignmentId, studentId: user.studentId } } });
  if (existingGrade) throw AppError.conflict("Assignment has already been graded");
  const now = new Date();
  const submission = await prisma.submission.upsert({
    where: { assignmentId_studentId: { assignmentId, studentId: user.studentId } },
    update: { content: input.content ?? null, attachments: input.attachments, submittedAt: now, isLate: now > assignment.dueDate, status: "SUBMITTED" },
    create: { schoolId: assignment.schoolId, assignmentId, studentId: user.studentId, content: input.content ?? null, attachments: input.attachments, submittedAt: now, isLate: now > assignment.dueDate, status: "SUBMITTED" },
  });
  await audit({ user, schoolId: assignment.schoolId, action: "assignment.submit", entityType: "Submission", entityId: submission.id, after: submission });
  await notify({ schoolId: assignment.schoolId, userId: assignment.course.teacher.userId, type: "GENERIC", title: `New submission: ${assignment.title}`, body: `${user.name} submitted ${assignment.title}${submission.isLate ? " (late)" : ""}.`, link: `/assignments/${assignmentId}` });
  return submission;
}

export async function getSubmission(user: AuthUser, submissionId: string) {
  const submission = await prisma.submission.findUnique({ where: { id: submissionId }, include: { assignment: { include: { course: true } }, student: { select: { id: true, firstName: true, lastName: true } } } });
  if (!submission) throw AppError.notFound("Submission");
  await assertCourseAccess(user, submission.assignment.course);
  if (user.studentId && submission.studentId !== user.studentId) throw AppError.forbidden();
  return submission;
}

/**
 * Scheduled job: for every published assignment past its due date, emit ASSIGNMENT_OVERDUE
 * for students without a submission (once per student/assignment, tracked via notifications).
 */
export async function processOverdueAssignments(schoolId: string, now = new Date()) {
  const assignments = await prisma.assignment.findMany({
    where: { schoolId, status: "PUBLISHED", dueDate: { lt: now, gte: new Date(now.getTime() - 14 * 86_400_000) } },
    include: { course: { include: { subject: { select: { name: true } }, class: { select: { id: true, name: true } }, teacher: { select: { userId: true } } } }, submissions: { select: { studentId: true } } },
  });
  let emitted = 0;
  for (const a of assignments) {
    const submitted = new Set(a.submissions.map((s) => s.studentId));
    const roster = await classRoster(a.course.class.id);
    for (const s of roster) {
      if (submitted.has(s.id)) continue;
      const already = await prisma.workflowRun.findFirst({ where: { schoolId, trigger: "ASSIGNMENT_OVERDUE", payload: { path: ["assignmentId"], equals: a.id }, AND: { payload: { path: ["studentId"], equals: s.id } } } });
      if (already) continue;
      await dispatch("ASSIGNMENT_OVERDUE", schoolId, {
        sourceId: a.id,
        assignmentId: a.id,
        assignmentTitle: a.title,
        courseName: `${a.course.subject.name} (${a.course.class.name})`,
        dueDate: a.dueDate,
        studentId: s.id,
        studentName: `${s.firstName} ${s.lastName}`,
        studentUserId: s.userId,
        guardianUserIds: await guardianUserIdsForStudent(s.id),
        teacherUserId: a.course.teacher.userId,
      });
      emitted++;
    }
  }
  return { assignments: assignments.length, emitted };
}

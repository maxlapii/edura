import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { AuthUser } from "@/lib/auth/types";
import { assertPermission, assertSchoolAccess, hasPermission, isAdmin, resolveSchoolId } from "@/lib/permissions";
import { AppError } from "@/lib/utils/errors";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { assertCourseAccess } from "@/modules/classes/service";
import { assertStudentAccess, classRoster } from "@/modules/students/service";
import { getCurrentTerm } from "@/modules/academic/service";
import { letterGrade, overallAverage, percentage, summarizeCourse, validateScore } from "./calculations";
import type { z } from "zod";
import type { CreateAssessmentInput, EnterGradesInput, updateGradeSchema } from "./schema";

const gradeInclude = {
  student: { select: { id: true, firstName: true, lastName: true, studentNumber: true } },
  assignment: { select: { id: true, title: true, maxScore: true, dueDate: true } },
  assessment: { select: { id: true, title: true, maxScore: true, weight: true, type: true } },
  gradedBy: { select: { id: true, name: true } },
} satisfies Prisma.GradeInclude;

/** Only the course teacher (or admin) may enter grades. Department heads may view. */
async function assertCanGrade(user: AuthUser, course: { id: string; teacherId: string; classId: string; schoolId: string; subjectId: string }) {
  assertPermission(user, "grades:manage");
  assertSchoolAccess(user, course.schoolId);
  if (isAdmin(user)) return;
  if (user.teacherId && course.teacherId === user.teacherId) return;
  throw AppError.forbidden("Only the course teacher can enter grades");
}

// ───────────── Assessments ─────────────

export async function createAssessment(user: AuthUser, input: CreateAssessmentInput) {
  const course = await prisma.course.findUnique({ where: { id: input.courseId } });
  if (!course) throw AppError.notFound("Course");
  await assertCanGrade(user, course);
  if (input.termId) {
    const term = await prisma.term.findUnique({ where: { id: input.termId } });
    if (!term || term.schoolId !== course.schoolId) throw AppError.validation("Term must belong to the same school");
  }
  const assessment = await prisma.assessment.create({ data: { schoolId: course.schoolId, courseId: course.id, termId: input.termId ?? null, title: input.title, type: input.type, date: input.date ?? null, maxScore: input.maxScore, weight: input.weight } });
  await audit({ user, schoolId: course.schoolId, action: "assessment.create", entityType: "Assessment", entityId: assessment.id, after: assessment });
  return assessment;
}

export async function listAssessments(user: AuthUser, courseId: string) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) throw AppError.notFound("Course");
  await assertCourseAccess(user, course);
  return prisma.assessment.findMany({ where: { courseId }, orderBy: { date: "asc" }, include: { _count: { select: { grades: true } } } });
}

// ───────────── Grade entry ─────────────

/** Enters (or updates) grades for many students at once. Locked grades are never modified. */
export async function enterGrades(user: AuthUser, input: EnterGradesInput) {
  const target = input.assignmentId
    ? await prisma.assignment.findUnique({ where: { id: input.assignmentId }, include: { course: true } })
    : await prisma.assessment.findUnique({ where: { id: input.assessmentId! }, include: { course: true } });
  if (!target) throw AppError.notFound(input.assignmentId ? "Assignment" : "Assessment");
  await assertCanGrade(user, target.course);
  const roster = await classRoster(target.course.classId);
  const rosterIds = new Set(roster.map((s) => s.id));
  const errors: Array<{ studentId: string; error: string }> = [];
  for (const g of input.grades) {
    if (!rosterIds.has(g.studentId)) errors.push({ studentId: g.studentId, error: "Student is not in this class" });
    const err = validateScore(g.score, target.maxScore);
    if (err) errors.push({ studentId: g.studentId, error: err });
  }
  if (errors.length) throw AppError.validation("Invalid grades", errors);
  const termId = input.termId ?? ("termId" in target ? target.termId : null) ?? (await getCurrentTerm(target.course.schoolId))?.id ?? null;

  const results = await prisma.$transaction(async (tx) => {
    const out = [];
    for (const g of input.grades) {
      const where = input.assignmentId ? { assignmentId_studentId: { assignmentId: input.assignmentId, studentId: g.studentId } } : { assessmentId_studentId: { assessmentId: input.assessmentId!, studentId: g.studentId } };
      const existing = await tx.grade.findUnique({ where });
      if (existing?.status === "LOCKED") throw AppError.conflict(`Grade for student ${g.studentId} is locked`);
      const letter = letterGrade(percentage(g.score, target.maxScore));
      const grade = existing
        ? await tx.grade.update({ where: { id: existing.id }, data: { score: g.score, maxScore: target.maxScore, letter, comment: g.comment ?? existing.comment, gradedById: user.id, status: existing.status === "SUBMITTED" ? "SUBMITTED" : "DRAFT" } })
        : await tx.grade.create({
            data: { schoolId: target.schoolId, studentId: g.studentId, courseId: target.courseId, termId, assignmentId: input.assignmentId ?? null, assessmentId: input.assessmentId ?? null, score: g.score, maxScore: target.maxScore, letter, comment: g.comment ?? null, gradedById: user.id, status: "DRAFT" },
          });
      await tx.gradeHistory.create({ data: { gradeId: grade.id, previousScore: existing?.score ?? null, newScore: g.score, previousStatus: existing?.status ?? null, newStatus: grade.status, changedById: user.id, reason: existing ? "Updated" : "Entered" } });
      if (input.assignmentId) {
        await tx.submission.updateMany({ where: { assignmentId: input.assignmentId, studentId: g.studentId }, data: { status: "GRADED", feedback: g.comment ?? undefined } });
      }
      out.push(grade);
    }
    return out;
  });
  await audit({ user, schoolId: target.schoolId, action: "grades.enter", entityType: input.assignmentId ? "Assignment" : "Assessment", entityId: target.id, metadata: { count: results.length } });

  // Notify students/guardians that a grade was posted.
  for (const grade of results) {
    const student = roster.find((s) => s.id === grade.studentId);
    const title = "title" in target ? target.title : "Assessment";
    if (student?.userId) await notify({ schoolId: target.schoolId, userId: student.userId, type: "ASSIGNMENT_GRADED", title: `Grade posted: ${title}`, body: `You scored ${grade.score}/${grade.maxScore}.`, link: `/grades` });
  }
  return results;
}

export async function updateGrade(user: AuthUser, gradeId: string, input: z.infer<typeof updateGradeSchema>) {
  const grade = await prisma.grade.findUnique({ where: { id: gradeId }, include: { course: true } });
  if (!grade) throw AppError.notFound("Grade");
  await assertCanGrade(user, grade.course);
  if (grade.status === "LOCKED") throw AppError.conflict("Grade is locked");
  if (input.score !== undefined) {
    const err = validateScore(input.score, grade.maxScore);
    if (err) throw AppError.validation(err);
  }
  const updated = await prisma.$transaction(async (tx) => {
    const g = await tx.grade.update({ where: { id: gradeId }, data: { score: input.score, letter: input.score !== undefined ? letterGrade(percentage(input.score, grade.maxScore)) : undefined, comment: input.comment, gradedById: user.id }, include: gradeInclude });
    if (input.score !== undefined && input.score !== grade.score) {
      await tx.gradeHistory.create({ data: { gradeId, previousScore: grade.score, newScore: input.score, previousStatus: grade.status, newStatus: g.status, changedById: user.id, reason: input.reason ?? "Updated" } });
    }
    return g;
  });
  await audit({ user, schoolId: grade.schoolId, action: "grade.update", entityType: "Grade", entityId: gradeId, before: grade, after: updated });
  return updated;
}

/** SUBMIT (teacher), LOCK / UNLOCK (admin) all grades of a course (+ term). */
export async function changeGradeStatus(user: AuthUser, courseId: string, action: "SUBMIT" | "LOCK" | "UNLOCK", termId?: string | null) {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) throw AppError.notFound("Course");
  if (action === "SUBMIT") await assertCanGrade(user, course);
  else {
    assertPermission(user, "grades:lock");
    assertSchoolAccess(user, course.schoolId);
  }
  const where: Prisma.GradeWhereInput = { courseId, termId: termId ?? undefined };
  const data: Prisma.GradeUpdateManyMutationInput =
    action === "SUBMIT" ? { status: "SUBMITTED", submittedAt: new Date() } : action === "LOCK" ? { status: "LOCKED", lockedAt: new Date() } : { status: "SUBMITTED", lockedAt: null };
  if (action === "SUBMIT") where.status = "DRAFT";
  if (action === "LOCK") where.status = { in: ["DRAFT", "SUBMITTED"] };
  if (action === "UNLOCK") where.status = "LOCKED";
  const result = await prisma.grade.updateMany({ where, data });
  await audit({ user, schoolId: course.schoolId, action: `grades.${action.toLowerCase()}`, entityType: "Course", entityId: courseId, metadata: { termId, count: result.count } });
  return { updated: result.count };
}

export async function gradeHistory(user: AuthUser, gradeId: string) {
  const grade = await prisma.grade.findUnique({ where: { id: gradeId }, include: { course: true } });
  if (!grade) throw AppError.notFound("Grade");
  assertPermission(user, "grades:read");
  await assertCourseAccess(user, grade.course);
  if ((user.studentId && grade.studentId !== user.studentId) || user.guardianId) await assertStudentAccess(user, grade.studentId);
  return prisma.gradeHistory.findMany({ where: { gradeId }, orderBy: { createdAt: "desc" }, include: { changedBy: { select: { id: true, name: true } } } });
}

// ───────────── Views ─────────────

/** Gradebook: rows = students, columns = assignments + assessments. */
export async function courseGradebook(user: AuthUser, courseId: string, termId?: string | null) {
  assertPermission(user, "grades:read");
  const course = await prisma.course.findUnique({ where: { id: courseId }, include: { subject: true, class: { select: { id: true, name: true } } } });
  if (!course) throw AppError.notFound("Course");
  await assertCourseAccess(user, course);
  if (user.studentId || user.guardianId) throw AppError.forbidden("Use the student grade view");
  const [students, assignments, assessments, grades] = await Promise.all([
    classRoster(course.classId),
    prisma.assignment.findMany({ where: { courseId, status: { not: "DRAFT" } }, orderBy: { dueDate: "asc" }, select: { id: true, title: true, maxScore: true, dueDate: true } }),
    prisma.assessment.findMany({ where: { courseId, termId: termId ?? undefined }, orderBy: { date: "asc" } }),
    prisma.grade.findMany({ where: { courseId, termId: termId ?? undefined } }),
  ]);
  const rows = students.map((s) => {
    const own = grades.filter((g) => g.studentId === s.id);
    const items = own.map((g) => ({ score: g.score, maxScore: g.maxScore, weight: g.assessmentId ? assessments.find((a) => a.id === g.assessmentId)?.weight ?? 1 : 1 }));
    return { student: s, grades: own, summary: summarizeCourse(items, assignments.length + assessments.length) };
  });
  const pending = grades.filter((g) => g.status === "DRAFT").length;
  const submitted = grades.filter((g) => g.status === "SUBMITTED").length;
  const locked = grades.filter((g) => g.status === "LOCKED").length;
  return { course, assignments, assessments, rows, status: { pending, submitted, locked, missing: students.length * (assignments.length + assessments.length) - grades.length } };
}

/** All grades for a student grouped by course, with averages. Visible to the student, their guardians and their teachers. */
export async function studentGrades(user: AuthUser, studentId: string, termId?: string | null) {
  assertPermission(user, "grades:read");
  await assertStudentAccess(user, studentId);
  const visibleStatuses: Prisma.GradeWhereInput["status"] = user.studentId || user.guardianId ? { in: ["SUBMITTED", "LOCKED"] } : undefined;
  const grades = await prisma.grade.findMany({ where: { studentId, termId: termId ?? undefined, status: visibleStatuses }, include: { ...gradeInclude, course: { include: { subject: { select: { id: true, name: true } }, teacher: { include: { user: { select: { name: true } } } } } } }, orderBy: { createdAt: "asc" } });
  const byCourse = new Map<string, typeof grades>();
  for (const g of grades) byCourse.set(g.courseId, [...(byCourse.get(g.courseId) ?? []), g]);
  const courses = [...byCourse.entries()].map(([courseId, gs]) => ({
    courseId,
    subject: gs[0].course.subject.name,
    teacher: gs[0].course.teacher.user.name,
    grades: gs,
    summary: summarizeCourse(gs.map((g) => ({ score: g.score, maxScore: g.maxScore, weight: g.assessment?.weight ?? 1 })), gs.length),
  }));
  return { studentId, courses, overall: overallAverage(courses.map((c) => c.summary.average)) };
}

/** Assignments with ungraded submissions for a teacher (or the whole school for admins). */
export async function pendingGrading(user: AuthUser, teacherId?: string) {
  assertPermission(user, "grades:read");
  const schoolId = resolveSchoolId(user);
  const tid = teacherId ?? user.teacherId ?? undefined;
  if (tid && tid !== user.teacherId && !isAdmin(user) && user.role !== "DEPARTMENT_HEAD") throw AppError.forbidden();
  const assignments = await prisma.assignment.findMany({
    where: { schoolId, status: { not: "DRAFT" }, course: tid ? { teacherId: tid } : undefined, submissions: { some: { status: "SUBMITTED" } } },
    include: { course: { include: { subject: { select: { name: true } }, class: { select: { id: true, name: true } }, teacher: { include: { user: { select: { id: true, name: true } } } } } }, _count: { select: { submissions: true } } },
    orderBy: { dueDate: "asc" },
  });
  const rows = await Promise.all(
    assignments.map(async (a) => ({ assignment: a, pending: await prisma.submission.count({ where: { assignmentId: a.id, status: "SUBMITTED" } }) })),
  );
  return rows.filter((r) => r.pending > 0);
}

/** Grade submission status per course for administrators. */
export async function gradeSubmissionStatus(user: AuthUser, termId?: string | null) {
  assertPermission(user, "reports:school");
  const schoolId = resolveSchoolId(user);
  const courses = await prisma.course.findMany({ where: { schoolId, ...(user.role === "DEPARTMENT_HEAD" ? { subject: { departmentId: user.departmentId ?? "__none__" } } : {}) }, include: { subject: { select: { name: true } }, class: { select: { name: true } }, teacher: { include: { user: { select: { id: true, name: true } } } } } });
  const grouped = await prisma.grade.groupBy({ by: ["courseId", "status"], where: { schoolId, termId: termId ?? undefined }, _count: { _all: true } });
  return courses.map((c) => {
    const counts = { DRAFT: 0, SUBMITTED: 0, LOCKED: 0 };
    for (const g of grouped) if (g.courseId === c.id) counts[g.status] = g._count._all;
    const total = counts.DRAFT + counts.SUBMITTED + counts.LOCKED;
    return { course: c, counts, total, status: total === 0 ? "NONE" : counts.DRAFT > 0 ? "PENDING" : counts.LOCKED === total ? "LOCKED" : "SUBMITTED" };
  });
}

export function canViewSensitiveGrades(user: AuthUser) {
  return hasPermission(user, "grades:manage");
}

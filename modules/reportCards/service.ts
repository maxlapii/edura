import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { AuthUser } from "@/lib/auth/types";
import { assertPermission, assertSchoolAccess, hasPermission, isAdmin, resolveSchoolId } from "@/lib/permissions";
import { AppError } from "@/lib/utils/errors";
import { audit } from "@/lib/audit";
import { notify } from "@/lib/notifications";
import { computeAttendanceStats } from "@/modules/attendance/stats";
import { overallAverage, summarizeCourse } from "@/modules/grades/calculations";
import { accessibleStudentWhere, assertStudentAccess, guardianUserIdsForStudent } from "@/modules/students/service";
import type { z } from "zod";
import type { GenerateReportCardsInput, updateReportCardSchema } from "./schema";

const include = {
  student: { select: { id: true, firstName: true, lastName: true, studentNumber: true, userId: true, class: { select: { id: true, name: true } } } },
  term: { select: { id: true, name: true, startDate: true, endDate: true, academicYear: { select: { name: true } } } },
  publishedBy: { select: { id: true, name: true } },
} satisfies Prisma.ReportCardInclude;

export interface ReportCardData {
  courses: Array<{ courseId: string; subject: string; teacher: string; average: number | null; letter: string | null; graded: number }>;
  overall: number | null;
  attendance: ReturnType<typeof computeAttendanceStats>;
  generatedAt: string;
}

/** Builds the report-card snapshot for one student and term from SUBMITTED/LOCKED grades and submitted attendance. */
export async function buildReportCardData(studentId: string, term: { id: string; startDate: Date; endDate: Date }): Promise<ReportCardData> {
  const [grades, records] = await Promise.all([
    prisma.grade.findMany({ where: { studentId, termId: term.id, status: { in: ["SUBMITTED", "LOCKED"] } }, include: { assessment: { select: { weight: true } }, course: { include: { subject: { select: { name: true } }, teacher: { include: { user: { select: { name: true } } } } } } } }),
    prisma.attendanceRecord.findMany({ where: { studentId, session: { status: "SUBMITTED" }, date: { gte: term.startDate, lte: term.endDate } }, select: { status: true } }),
  ]);
  const byCourse = new Map<string, typeof grades>();
  for (const g of grades) byCourse.set(g.courseId, [...(byCourse.get(g.courseId) ?? []), g]);
  const courses = [...byCourse.entries()].map(([courseId, gs]) => {
    const summary = summarizeCourse(gs.map((g) => ({ score: g.score, maxScore: g.maxScore, weight: g.assessment?.weight ?? 1 })), gs.length);
    return { courseId, subject: gs[0].course.subject.name, teacher: gs[0].course.teacher.user.name, average: summary.average, letter: summary.letter, graded: gs.length };
  });
  return { courses, overall: overallAverage(courses.map((c) => c.average)), attendance: computeAttendanceStats(records), generatedAt: new Date().toISOString() };
}

/** Creates or refreshes DRAFT report cards for a class or a student. Published cards are left untouched. */
export async function generateReportCards(user: AuthUser, input: GenerateReportCardsInput) {
  assertPermission(user, "report_cards:manage");
  const schoolId = resolveSchoolId(user);
  const term = await prisma.term.findUnique({ where: { id: input.termId } });
  if (!term || term.schoolId !== schoolId) throw AppError.notFound("Term");
  const students = await prisma.student.findMany({ where: { schoolId, status: "ACTIVE", ...(input.studentId ? { id: input.studentId } : { classId: input.classId }) }, select: { id: true } });
  if (students.length === 0) throw AppError.notFound("Students");
  let created = 0;
  let refreshed = 0;
  let skipped = 0;
  for (const s of students) {
    const existing = await prisma.reportCard.findUnique({ where: { studentId_termId: { studentId: s.id, termId: term.id } } });
    if (existing?.status === "PUBLISHED") {
      skipped++;
      continue;
    }
    const data = (await buildReportCardData(s.id, term)) as unknown as Prisma.InputJsonValue;
    if (existing) {
      await prisma.reportCard.update({ where: { id: existing.id }, data: { data } });
      refreshed++;
    } else {
      await prisma.reportCard.create({ data: { schoolId, studentId: s.id, termId: term.id, data } });
      created++;
    }
  }
  await audit({ user, schoolId, action: "report_card.generate", entityType: "ReportCard", metadata: { termId: term.id, classId: input.classId, studentId: input.studentId, created, refreshed, skipped } });
  return { created, refreshed, skipped };
}

export async function listReportCards(user: AuthUser, filter: { termId?: string; classId?: string; studentId?: string; status?: "DRAFT" | "PUBLISHED" } = {}) {
  assertPermission(user, "report_cards:read");
  const schoolId = resolveSchoolId(user);
  const where: Prisma.ReportCardWhereInput = { schoolId, termId: filter.termId, status: filter.status, student: { ...(await accessibleStudentWhere(user, schoolId)), classId: filter.classId, ...(filter.studentId ? { id: filter.studentId } : {}) } };
  // Students and parents only ever see published cards.
  if (!hasPermission(user, "report_cards:manage") && !user.teacherId) where.status = "PUBLISHED";
  return prisma.reportCard.findMany({ where, include, orderBy: [{ term: { startDate: "desc" } }, { student: { lastName: "asc" } }] });
}

export async function getReportCard(user: AuthUser, id: string) {
  assertPermission(user, "report_cards:read");
  const card = await prisma.reportCard.findUnique({ where: { id }, include });
  if (!card) throw AppError.notFound("Report card");
  assertSchoolAccess(user, card.schoolId);
  await assertStudentAccess(user, card.studentId);
  if (card.status !== "PUBLISHED" && (user.studentId || user.guardianId)) throw AppError.notFound("Report card");
  return { ...card, data: card.data as unknown as ReportCardData };
}

export async function updateReportCard(user: AuthUser, id: string, input: z.infer<typeof updateReportCardSchema>) {
  const before = await prisma.reportCard.findUnique({ where: { id }, include: { student: { select: { classId: true, class: { select: { homeroomTeacherId: true } } } } } });
  if (!before) throw AppError.notFound("Report card");
  assertSchoolAccess(user, before.schoolId);
  if (before.status === "PUBLISHED") throw AppError.conflict("Published report cards cannot be edited");
  const isHomeroom = user.teacherId && before.student.class?.homeroomTeacherId === user.teacherId;
  if (!isAdmin(user) && !isHomeroom) throw AppError.forbidden("Only the homeroom teacher or an administrator can edit report card comments");
  if (input.principalComment !== undefined && !isAdmin(user)) throw AppError.forbidden("Only administrators can write the principal's comment");
  const card = await prisma.reportCard.update({ where: { id }, data: input, include });
  await audit({ user, schoolId: before.schoolId, action: "report_card.update", entityType: "ReportCard", entityId: id, before, after: card });
  return card;
}

/** Publishes a report card: snapshot is refreshed, status PUBLISHED, student and guardians notified. */
export async function publishReportCard(user: AuthUser, id: string) {
  assertPermission(user, "report_cards:manage");
  const card = await prisma.reportCard.findUnique({ where: { id }, include: { term: true, student: { select: { id: true, userId: true, firstName: true, lastName: true } } } });
  if (!card) throw AppError.notFound("Report card");
  assertSchoolAccess(user, card.schoolId);
  if (card.status === "PUBLISHED") throw AppError.conflict("Report card is already published");
  const data = (await buildReportCardData(card.studentId, card.term)) as unknown as Prisma.InputJsonValue;
  const published = await prisma.$transaction(async (tx) => {
    const p = await tx.reportCard.update({ where: { id }, data: { data, status: "PUBLISHED", publishedAt: new Date(), publishedByUserId: user.id }, include });
    await tx.approval.updateMany({ where: { entityType: "ReportCard", entityId: id, status: "PENDING" }, data: { status: "APPROVED", approverUserId: user.id, decisionAt: new Date() } });
    return p;
  });
  await audit({ user, schoolId: card.schoolId, action: "report_card.publish", entityType: "ReportCard", entityId: id, after: published });
  const recipients = [...(await guardianUserIdsForStudent(card.studentId)), ...(card.student.userId ? [card.student.userId] : [])];
  for (const userId of new Set(recipients)) {
    await notify({ schoolId: card.schoolId, userId, type: "REPORT_CARD_PUBLISHED", title: `Report card published: ${card.student.firstName} ${card.student.lastName} – ${card.term.name}`, link: `/report-cards/${id}`, email: true });
  }
  return published;
}

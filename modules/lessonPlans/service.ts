import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { AuthUser } from "@/lib/auth/types";
import { assertPermission, assertSchoolAccess, isAdmin, resolveSchoolId } from "@/lib/permissions";
import { AppError } from "@/lib/utils/errors";
import { audit } from "@/lib/audit";
import { assertCourseAccess } from "@/modules/classes/service";
import type { z } from "zod";
import type { CreateLessonPlanInput, UpdateLessonPlanInput, copyLessonPlanSchema } from "./schema";

const include = {
  course: { include: { subject: { select: { id: true, name: true } }, class: { select: { id: true, name: true } } } },
  teacher: { include: { user: { select: { id: true, name: true } } } },
  timetableSlot: { include: { period: true } },
} satisfies Prisma.LessonPlanInclude;

async function assertOwner(user: AuthUser, plan: { teacherId: string; schoolId: string }) {
  assertPermission(user, "lesson_plans:manage");
  assertSchoolAccess(user, plan.schoolId);
  if (isAdmin(user) || user.teacherId === plan.teacherId) return;
  throw AppError.forbidden("You can only edit your own lesson plans");
}

export async function createLessonPlan(user: AuthUser, input: CreateLessonPlanInput) {
  assertPermission(user, "lesson_plans:manage");
  const course = await prisma.course.findUnique({ where: { id: input.courseId } });
  if (!course) throw AppError.notFound("Course");
  await assertCourseAccess(user, course);
  const teacherId = user.teacherId ?? course.teacherId;
  if (input.timetableSlotId) {
    const slot = await prisma.timetableSlot.findUnique({ where: { id: input.timetableSlotId } });
    if (!slot || slot.courseId !== course.id) throw AppError.validation("Timetable slot does not belong to this course");
  }
  const plan = await prisma.lessonPlan.create({ data: { ...input, schoolId: course.schoolId, teacherId, date: input.date ?? null, completedAt: input.status === "COMPLETED" ? new Date() : null }, include });
  await audit({ user, schoolId: course.schoolId, action: "lesson_plan.create", entityType: "LessonPlan", entityId: plan.id, after: plan });
  return plan;
}

export async function updateLessonPlan(user: AuthUser, id: string, input: UpdateLessonPlanInput) {
  const before = await prisma.lessonPlan.findUnique({ where: { id } });
  if (!before) throw AppError.notFound("Lesson plan");
  await assertOwner(user, before);
  const plan = await prisma.lessonPlan.update({ where: { id }, data: { ...input, completedAt: input.status === "COMPLETED" ? (before.completedAt ?? new Date()) : input.status ? null : undefined }, include });
  await audit({ user, schoolId: before.schoolId, action: "lesson_plan.update", entityType: "LessonPlan", entityId: id, before, after: plan });
  return plan;
}

export async function deleteLessonPlan(user: AuthUser, id: string) {
  const before = await prisma.lessonPlan.findUnique({ where: { id } });
  if (!before) throw AppError.notFound("Lesson plan");
  await assertOwner(user, before);
  await prisma.lessonPlan.delete({ where: { id } });
  await audit({ user, schoolId: before.schoolId, action: "lesson_plan.delete", entityType: "LessonPlan", entityId: id, before });
}

export async function getLessonPlan(user: AuthUser, id: string) {
  assertPermission(user, "lesson_plans:read");
  const plan = await prisma.lessonPlan.findUnique({ where: { id }, include });
  if (!plan) throw AppError.notFound("Lesson plan");
  await assertCourseAccess(user, { ...plan.course, teacherId: plan.course.teacherId, classId: plan.course.classId, schoolId: plan.schoolId, subjectId: plan.course.subjectId });
  return plan;
}

export async function listLessonPlans(user: AuthUser, filter: { courseId?: string; teacherId?: string; from?: Date; to?: Date; status?: string } = {}) {
  assertPermission(user, "lesson_plans:read");
  const schoolId = resolveSchoolId(user);
  const where: Prisma.LessonPlanWhereInput = { schoolId, courseId: filter.courseId, status: filter.status as Prisma.LessonPlanWhereInput["status"], date: { gte: filter.from, lte: filter.to } };
  if (!isAdmin(user) && user.role !== "DEPARTMENT_HEAD") where.teacherId = user.teacherId ?? "__none__";
  else if (filter.teacherId) where.teacherId = filter.teacherId;
  if (user.role === "DEPARTMENT_HEAD" && !filter.teacherId) where.OR = [{ teacherId: user.teacherId ?? "__none__" }, { course: { subject: { departmentId: user.departmentId ?? "__none__" } } }];
  return prisma.lessonPlan.findMany({ where, include, orderBy: [{ date: "desc" }, { createdAt: "desc" }], take: 200 });
}

/** Copies a lesson plan (optionally into another course the teacher teaches). */
export async function copyLessonPlan(user: AuthUser, id: string, input: z.infer<typeof copyLessonPlanSchema>) {
  const source = await prisma.lessonPlan.findUnique({ where: { id } });
  if (!source) throw AppError.notFound("Lesson plan");
  assertPermission(user, "lesson_plans:manage");
  assertSchoolAccess(user, source.schoolId);
  const courseId = input.courseId ?? source.courseId;
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) throw AppError.notFound("Course");
  await assertCourseAccess(user, course);
  const plan = await prisma.lessonPlan.create({
    data: {
      schoolId: source.schoolId,
      courseId,
      teacherId: user.teacherId ?? course.teacherId,
      title: input.title ?? `${source.title} (copy)`,
      date: input.date ?? null,
      curriculumTopic: source.curriculumTopic,
      objectives: source.objectives,
      activities: source.activities,
      materials: source.materials,
      homework: source.homework,
      notes: null,
      status: "DRAFT",
      aiGenerated: source.aiGenerated,
    },
    include,
  });
  await audit({ user, schoolId: source.schoolId, action: "lesson_plan.copy", entityType: "LessonPlan", entityId: plan.id, metadata: { sourceId: id } });
  return plan;
}

/** Curriculum progress: completed vs planned lesson plans per course. */
export async function curriculumProgress(user: AuthUser, courseId: string) {
  assertPermission(user, "lesson_plans:read");
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) throw AppError.notFound("Course");
  await assertCourseAccess(user, course);
  const grouped = await prisma.lessonPlan.groupBy({ by: ["status"], where: { courseId }, _count: { _all: true } });
  const counts = { DRAFT: 0, READY: 0, COMPLETED: 0 };
  for (const g of grouped) counts[g.status] = g._count._all;
  const total = counts.DRAFT + counts.READY + counts.COMPLETED;
  return { courseId, ...counts, total, completionRate: total === 0 ? 0 : Number(((counts.COMPLETED / total) * 100).toFixed(1)) };
}

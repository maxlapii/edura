import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import type { AuthUser } from "@/lib/auth/types";
import { assertPermission, assertSchoolAccess, resolveSchoolId } from "@/lib/permissions";
import { AppError } from "@/lib/utils/errors";
import { audit } from "@/lib/audit";
import { DEFAULT_WORKFLOW_RULES } from "@/lib/workflows/defaults";
import { schoolSettingsSchema, type CreateSchoolInput, type SchoolSettings, type UpdateSchoolInput } from "./schema";

export const DEFAULT_PERIODS = [
  { name: "Period 1", order: 1, startTime: "08:00", endTime: "08:45" },
  { name: "Period 2", order: 2, startTime: "08:50", endTime: "09:35" },
  { name: "Period 3", order: 3, startTime: "09:40", endTime: "10:25" },
  { name: "Period 4", order: 4, startTime: "10:45", endTime: "11:30" },
  { name: "Period 5", order: 5, startTime: "11:35", endTime: "12:20" },
  { name: "Period 6", order: 6, startTime: "13:10", endTime: "13:55" },
  { name: "Period 7", order: 7, startTime: "14:00", endTime: "14:45" },
  { name: "Period 8", order: 8, startTime: "14:50", endTime: "15:35" },
];

/** Installs default workflow rules and periods for a school (idempotent). */
export async function installSchoolDefaults(schoolId: string) {
  const existingRules = await prisma.workflowRule.count({ where: { schoolId } });
  if (existingRules === 0) {
    await prisma.workflowRule.createMany({
      data: DEFAULT_WORKFLOW_RULES.map((r) => ({
        schoolId,
        name: r.name,
        description: r.description,
        trigger: r.trigger,
        conditions: r.conditions as object,
        actions: r.actions as object[],
        isActive: true,
      })),
    });
  }
  const existingPeriods = await prisma.period.count({ where: { schoolId } });
  if (existingPeriods === 0) {
    await prisma.period.createMany({ data: DEFAULT_PERIODS.map((p) => ({ ...p, schoolId })) });
  }
}

export async function createSchool(user: AuthUser, input: CreateSchoolInput) {
  assertPermission(user, "school:manage");
  if (user.role !== "SUPER_ADMIN") throw AppError.forbidden("Only super administrators can create schools");
  const school = await prisma.school.create({ data: { ...input } });
  await installSchoolDefaults(school.id);
  await audit({ user, schoolId: school.id, action: "school.create", entityType: "School", entityId: school.id, after: school });
  return school;
}

export async function listSchools(user: AuthUser) {
  if (user.role === "SUPER_ADMIN") return prisma.school.findMany({ orderBy: { name: "asc" } });
  if (!user.schoolId) return [];
  return prisma.school.findMany({ where: { id: user.schoolId } });
}

export async function getSchool(user: AuthUser, schoolId: string) {
  assertSchoolAccess(user, schoolId);
  const school = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!school) throw AppError.notFound("School");
  return school;
}

export async function updateSchool(user: AuthUser, schoolId: string, input: UpdateSchoolInput) {
  assertPermission(user, "school:manage");
  assertSchoolAccess(user, schoolId);
  const before = await prisma.school.findUnique({ where: { id: schoolId } });
  if (!before) throw AppError.notFound("School");
  const { settings, ...rest } = input;
  const school = await prisma.school.update({
    where: { id: schoolId },
    data: { ...rest, ...(settings ? { settings: { ...(before.settings as Record<string, unknown>), ...settings } as Prisma.InputJsonValue } : {}) },
  });
  await audit({ user, schoolId, action: "school.update", entityType: "School", entityId: schoolId, before, after: school });
  return school;
}

export async function getSchoolSettings(schoolId: string): Promise<SchoolSettings> {
  const school = await prisma.school.findUnique({ where: { id: schoolId }, select: { settings: true } });
  return schoolSettingsSchema.parse(school?.settings ?? {});
}

export function currentSchoolId(user: AuthUser, explicit?: string | null) {
  return resolveSchoolId(user, explicit);
}

import { describe, expect, it } from "vitest";
import { api, asUser, createOtherSchool, createSchoolFixture, createUser, prisma, signIn } from "../helpers";
import { createSchool, DEFAULT_PERIODS, getSchoolSettings, updateSchool } from "@/modules/schools/service";
import { DEFAULT_WORKFLOW_RULES } from "@/lib/workflows/defaults";
import { POST as createSchoolRoute } from "@/app/api/schools/route";

describe("schools", () => {
  it("super admin creates a school with default workflow rules and 8 periods installed", async () => {
    const superAdmin = await asUser((await createUser("SUPER_ADMIN", null)).id);
    const school = await createSchool(superAdmin, { name: "Northside Academy", code: "NORTH", timezone: "UTC", address: null, phone: null, email: null });
    expect(school.code).toBe("NORTH");

    const rules = await prisma.workflowRule.findMany({ where: { schoolId: school.id } });
    expect(rules).toHaveLength(DEFAULT_WORKFLOW_RULES.length);
    expect(rules.every((r) => r.isActive)).toBe(true);
    expect(new Set(rules.map((r) => r.trigger))).toEqual(new Set(DEFAULT_WORKFLOW_RULES.map((r) => r.trigger)));

    const periods = await prisma.period.findMany({ where: { schoolId: school.id }, orderBy: { order: "asc" } });
    expect(periods).toHaveLength(8);
    expect(periods.map((p) => p.order)).toEqual(DEFAULT_PERIODS.map((p) => p.order));
    expect(periods[0]).toMatchObject({ name: "Period 1", startTime: "08:00", endTime: "08:45" });

    const audit = await prisma.auditLog.findFirst({ where: { action: "school.create", entityId: school.id } });
    expect(audit?.userId).toBe(superAdmin.id);
  });

  it("school admin cannot create schools (service and route)", async () => {
    const f = await createSchoolFixture();
    await expect(createSchool(f.admin, { name: "Rogue School", code: "ROGUE", timezone: "UTC", address: null, phone: null, email: null })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    await expect(createSchool(f.principal, { name: "Rogue School", code: "ROGUE", timezone: "UTC", address: null, phone: null, email: null })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const res = await api(createSchoolRoute, { cookie: await signIn(f.adminUser.email), body: { name: "Rogue School", code: "ROGUE" } });
    expect(res.status).toBe(403);
    expect(res.error?.code).toBe("FORBIDDEN");
    expect(await prisma.school.count({ where: { code: "ROGUE" } })).toBe(0);
  });

  it("super admin can create a school through the route and the code is upper-cased", async () => {
    const superAdmin = await createUser("SUPER_ADMIN", null);
    const res = await api(createSchoolRoute, { cookie: await signIn(superAdmin.email), body: { name: "Route School", code: "route-1" } });
    expect(res.status).toBe(201);
    expect(res.data).toMatchObject({ name: "Route School", code: "ROUTE-1" });
    expect(await prisma.workflowRule.count({ where: { schoolId: (res.data as { id: string }).id } })).toBe(DEFAULT_WORKFLOW_RULES.length);
  });

  it("updateSchool merges settings instead of replacing them", async () => {
    const f = await createSchoolFixture();
    await updateSchool(f.admin, f.school.id, { settings: { absenceThreshold: 5 } });
    const after = await updateSchool(f.admin, f.school.id, { settings: { absenceWindowDays: 14 }, phone: "+1 555 0100" });
    expect(after.settings).toEqual({ absenceThreshold: 5, absenceWindowDays: 14 });
    expect(after.phone).toBe("+1 555 0100");

    const settings = await getSchoolSettings(f.school.id);
    expect(settings).toEqual({ absenceThreshold: 5, absenceWindowDays: 14, gradeSubmissionReminderDays: 2, certificationExpiryWarningDays: 30, maxWeeklyPeriods: 25 });
    expect(await prisma.auditLog.count({ where: { schoolId: f.school.id, action: "school.update" } })).toBe(2);
  });

  it("getSchoolSettings returns defaults for a school without settings", async () => {
    const f = await createSchoolFixture();
    expect(await getSchoolSettings(f.school.id)).toEqual({ absenceThreshold: 3, absenceWindowDays: 30, gradeSubmissionReminderDays: 2, certificationExpiryWarningDays: 30, maxWeeklyPeriods: 25 });
  });

  it("a school admin cannot update another school", async () => {
    const f = await createSchoolFixture();
    const other = await createOtherSchool();
    await expect(updateSchool(f.admin, other.school.id, { name: "Hijacked" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await prisma.school.findUniqueOrThrow({ where: { id: other.school.id } })).name).toBe("Other School");
  });
});

import { describe, expect, it } from "vitest";
import { api, createOtherSchool, createSchoolFixture, prisma, signIn } from "../helpers";
import { createAcademicYear, createTerm, getCurrentTerm, updateAcademicYear, updateTerm } from "@/modules/academic/service";
import { createAcademicYearSchema, createTermSchema } from "@/modules/academic/schema";
import { POST as createYearRoute } from "@/app/api/academic-years/route";

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);

describe("academic years and terms", () => {
  it("creating a current academic year unsets the previous current year", async () => {
    const f = await createSchoolFixture();
    expect(f.year.isCurrent).toBe(true);
    const next = await createAcademicYear(f.admin, { name: "2027/2028", startDate: d("2027-09-01"), endDate: d("2028-06-30"), isCurrent: true });
    expect(next.isCurrent).toBe(true);
    expect((await prisma.academicYear.findUniqueOrThrow({ where: { id: f.year.id } })).isCurrent).toBe(false);

    const archive = await createAcademicYear(f.admin, { name: "2025/2026", startDate: d("2025-09-01"), endDate: d("2026-06-30"), isCurrent: false });
    expect(archive.isCurrent).toBe(false);
    expect(await prisma.academicYear.count({ where: { schoolId: f.school.id, isCurrent: true } })).toBe(1);

    await updateAcademicYear(f.admin, f.year.id, { isCurrent: true });
    expect((await prisma.academicYear.findUniqueOrThrow({ where: { id: next.id } })).isCurrent).toBe(false);
    expect(await prisma.academicYear.count({ where: { schoolId: f.school.id, isCurrent: true } })).toBe(1);
  });

  it("a term must fall within its academic year", async () => {
    const f = await createSchoolFixture();
    await expect(createTerm(f.admin, { academicYearId: f.year.id, name: "Early", startDate: d("2026-08-01"), endDate: d("2026-10-01"), isCurrent: false })).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 422 });
    await expect(createTerm(f.admin, { academicYearId: f.year.id, name: "Late", startDate: d("2027-05-01"), endDate: d("2027-07-15"), isCurrent: false })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const term = await createTerm(f.admin, { academicYearId: f.year.id, name: "Term 2", startDate: d("2027-01-05"), endDate: d("2027-03-26"), isCurrent: true });
    expect(term).toMatchObject({ schoolId: f.school.id, academicYearId: f.year.id, isCurrent: true });
    // Making it current unsets the fixture term.
    expect((await prisma.term.findUniqueOrThrow({ where: { id: f.term.id } })).isCurrent).toBe(false);
    await expect(createTerm(f.admin, { academicYearId: "missing", name: "X", startDate: d("2027-01-05"), endDate: d("2027-03-26"), isCurrent: false })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("validates that endDate is after startDate on create (schema/route) and update (service)", async () => {
    const f = await createSchoolFixture();
    const parsed = createAcademicYearSchema.safeParse({ name: "Backwards", startDate: "2027-09-01", endDate: "2027-01-01" });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(parsed.error.issues[0].path).toEqual(["endDate"]);
    expect(createTermSchema.safeParse({ academicYearId: "x", name: "T", startDate: "2027-01-01", endDate: "2027-01-01" }).success).toBe(false);

    const res = await api(createYearRoute, { cookie: await signIn(f.adminUser.email), body: { name: "Backwards", startDate: "2027-09-01", endDate: "2027-01-01" } });
    expect(res.status).toBe(422);
    expect(res.error?.code).toBe("VALIDATION_ERROR");

    await expect(updateAcademicYear(f.admin, f.year.id, { endDate: d("2026-08-01") })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    await expect(updateAcademicYear(f.admin, f.year.id, { startDate: d("2027-06-30") })).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    const ok = await updateAcademicYear(f.admin, f.year.id, { endDate: d("2027-07-15") });
    expect(ok.endDate).toEqual(d("2027-07-15"));
  });

  it("getCurrentTerm prefers the isCurrent flag and falls back to the date range", async () => {
    const f = await createSchoolFixture();
    const t2 = await createTerm(f.admin, { academicYearId: f.year.id, name: "Term 2", startDate: d("2027-01-05"), endDate: d("2027-03-26"), isCurrent: false });
    // Flagged term wins even when the date is inside another term.
    expect((await getCurrentTerm(f.school.id, d("2027-02-01")))?.id).toBe(f.term.id);

    await updateTerm(f.admin, f.term.id, { isCurrent: false });
    expect((await getCurrentTerm(f.school.id, d("2027-02-01")))?.id).toBe(t2.id);
    expect((await getCurrentTerm(f.school.id, d("2026-10-15")))?.id).toBe(f.term.id);
    expect(await getCurrentTerm(f.school.id, d("2027-08-01"))).toBeNull();
  });

  it("academic operations are school-scoped and permission-checked", async () => {
    const f = await createSchoolFixture();
    const other = await createOtherSchool();
    await expect(createTerm(f.admin, { academicYearId: other.year.id, name: "T", startDate: d("2026-09-01"), endDate: d("2026-10-01"), isCurrent: false })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(updateAcademicYear(f.admin, other.year.id, { name: "Hijacked" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createAcademicYear(f.teacher.auth, { name: "Nope", startDate: d("2027-09-01"), endDate: d("2028-06-30"), isCurrent: false })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

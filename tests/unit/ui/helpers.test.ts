import { describe, expect, it } from "vitest";
import { navForUser, homeForUser } from "@/lib/nav";
import { DAY_NAMES, DAY_SHORT, fmtDate, fmtDateTime, fmtLongDate, fmtTime, humanize, initials } from "@/lib/format";
import type { AuthUser } from "@/lib/auth/types";

const user = (role: AuthUser["role"]): AuthUser => ({ id: "u", email: "e", name: "N", role, schoolId: "s", isActive: true });

describe("navForUser", () => {
  it("shows administration only to administrators and teaching items to teachers", () => {
    const admin = navForUser(user("SCHOOL_ADMIN"));
    expect(admin.filter((s) => s.group === "Administration").map((s) => s.title)).toEqual(["People", "Academics", "Operations", "Student welfare", "Insights & settings"]);
    expect(admin.find((s) => s.title === "Teaching")?.items.map((i) => i.href) ?? []).not.toContain("/schedule");
    const teacher = navForUser(user("TEACHER"));
    expect(teacher.some((s) => s.group === "Administration")).toBe(false);
    expect(teacher.find((s) => s.title === "Teaching")?.items.map((i) => i.href)).toEqual(expect.arrayContaining(["/schedule", "/classes", "/attendance"]));
    expect(teacher.find((s) => s.title === "My work")?.items.map((i) => i.href)).toEqual(expect.arrayContaining(["/tasks", "/leave"]));
    const student = navForUser(user("STUDENT"));
    expect(student.flatMap((s) => s.items.map((i) => i.href))).toEqual(expect.arrayContaining(["/schedule", "/assignments", "/grades", "/report-cards"]));
    expect(student.flatMap((s) => s.items.map((i) => i.href))).not.toContain("/attendance");
    expect(navForUser(user("SUPER_ADMIN")).flatMap((s) => s.items.map((i) => i.href))).toContain("/admin/schools");
    expect(navForUser(user("SCHOOL_ADMIN")).flatMap((s) => s.items.map((i) => i.href))).not.toContain("/admin/schools");
    expect(navForUser(user("DEPARTMENT_HEAD")).flatMap((s) => s.items.map((i) => i.href))).toContain("/department");
  });
  it("routes admins to /admin and others to /dashboard", () => {
    expect(homeForUser(user("PRINCIPAL"))).toBe("/admin");
    expect(homeForUser(user("PARENT"))).toBe("/dashboard");
  });
});

describe("format helpers", () => {
  it("formats dates and handles empties", () => {
    expect(fmtDate(null)).toBe("—");
    expect(fmtDate("2026-09-28")).toBe("2026-09-28");
    expect(fmtDate(new Date("2026-09-28T23:30:00Z"))).toBe("2026-09-28");
    expect(fmtLongDate("2026-09-28")).toMatch(/Monday.*28 September 2026/);
    expect(fmtLongDate(undefined)).toBe("—");
    expect(fmtDateTime(null)).toBe("—");
    expect(fmtDateTime(new Date(2026, 8, 28, 9, 5))).toMatch(/28 Sept? 2026/);
    expect(fmtTime(new Date(2026, 8, 28, 9, 5))).toBe("09:05");
    expect(fmtTime(null)).toBe("—");
  });
  it("humanises enums and builds initials", () => {
    expect(humanize("IN_PROGRESS")).toBe("In Progress");
    expect(humanize(null)).toBe("—");
    expect(initials("Ada Lovelace")).toBe("AL");
    expect(initials("Plato")).toBe("P");
    expect(DAY_NAMES[1]).toBe("Monday");
    expect(DAY_SHORT[7]).toBe("Sun");
  });
});

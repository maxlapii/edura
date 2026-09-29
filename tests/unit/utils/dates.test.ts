import { describe, expect, it } from "vitest";
import { addDaysDateOnly, datesBetween, dayOfWeek, formatDate, formatDateTime, inclusiveDays, rangesOverlap, timeToMinutes, timesOverlap, toDateOnly, workingDays } from "@/lib/utils/dates";
import { AppError, isAppError } from "@/lib/utils/errors";
import { fullName, percent, pick } from "@/lib/utils";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

describe("date helpers", () => {
  it("uses ISO weekdays (Monday = 1)", () => {
    expect(dayOfWeek(d("2026-09-28"))).toBe(1);
    expect(dayOfWeek(d("2026-10-04"))).toBe(7);
  });
  it("normalises to UTC midnight", () => {
    expect(toDateOnly(new Date("2026-09-28T15:45:00Z")).toISOString()).toBe("2026-09-28T00:00:00.000Z");
    expect(toDateOnly("2026-09-28").toISOString()).toBe("2026-09-28T00:00:00.000Z");
    expect(addDaysDateOnly(d("2026-09-28"), 3).toISOString()).toBe("2026-10-01T00:00:00.000Z");
  });
  it("formats", () => {
    expect(formatDate("2026-09-28")).toBe("2026-09-28");
    expect(formatDateTime(new Date(2026, 8, 28, 9, 5))).toBe("2026-09-28 09:05");
  });
  it("computes ranges", () => {
    expect(datesBetween(d("2026-09-28"), d("2026-09-30"))).toHaveLength(3);
    expect(datesBetween(d("2026-09-30"), d("2026-09-28"))).toEqual([]);
    expect(inclusiveDays(d("2026-09-28"), d("2026-09-28"))).toBe(1);
    expect(workingDays(d("2026-09-28"), d("2026-10-04"))).toBe(5);
    expect(rangesOverlap(d("2026-09-01"), d("2026-09-05"), d("2026-09-05"), d("2026-09-09"))).toBe(true);
    expect(rangesOverlap(d("2026-09-01"), d("2026-09-04"), d("2026-09-05"), d("2026-09-09"))).toBe(false);
  });
  it("compares times", () => {
    expect(timeToMinutes("08:45")).toBe(525);
    expect(timesOverlap("08:00", "09:00", "08:30", "09:30")).toBe(true);
    expect(timesOverlap("08:00", "09:00", "09:00", "10:00")).toBe(false);
  });
});

describe("misc utils", () => {
  it("AppError carries code and status", () => {
    expect(AppError.notFound("Thing").status).toBe(404);
    expect(AppError.conflict("x").code).toBe("CONFLICT");
    expect(AppError.badRequest("x").status).toBe(400);
    expect(AppError.validation("x", { a: 1 }).details).toEqual({ a: 1 });
    expect(isAppError(new Error("x"))).toBe(false);
    expect(isAppError(AppError.unauthorized())).toBe(true);
  });
  it("pick, fullName, percent", () => {
    expect(pick({ a: 1, b: 2 }, ["a"])).toEqual({ a: 1 });
    expect(fullName({ firstName: "Ada", lastName: "Lovelace" })).toBe("Ada Lovelace");
    expect(percent(1, 3)).toBe(33.3);
    expect(percent(1, 0)).toBe(0);
  });
});

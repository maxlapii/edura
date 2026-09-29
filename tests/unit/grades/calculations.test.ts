import { describe, expect, it } from "vitest";
import { DEFAULT_GRADE_SCALE, letterGrade, overallAverage, percentage, summarizeCourse, validateScore, weightedAverage } from "@/modules/grades/calculations";

describe("percentage & letters", () => {
  it("computes percentages with two decimals and handles zero max", () => {
    expect(percentage(17, 20)).toBe(85);
    expect(percentage(1, 3)).toBe(33.33);
    expect(percentage(5, 0)).toBe(0);
  });
  it("maps percentages to letters with the default scale", () => {
    expect(letterGrade(95)).toBe("A");
    expect(letterGrade(90)).toBe("A");
    expect(letterGrade(89.9)).toBe("B");
    expect(letterGrade(70)).toBe("C");
    expect(letterGrade(60)).toBe("D");
    expect(letterGrade(0)).toBe("F");
  });
  it("supports custom scales", () => {
    const scale = [{ letter: "PASS", min: 50 }, { letter: "FAIL", min: 0 }];
    expect(letterGrade(50, scale)).toBe("PASS");
    expect(letterGrade(49, scale)).toBe("FAIL");
    expect(letterGrade(-5, scale)).toBe("FAIL");
    expect(DEFAULT_GRADE_SCALE.length).toBe(5);
  });
});

describe("validateScore", () => {
  it("rejects invalid scores", () => {
    expect(validateScore(Number.NaN, 10)).toMatch(/number/);
    expect(validateScore(5, 0)).toMatch(/positive/);
    expect(validateScore(-1, 10)).toMatch(/negative/);
    expect(validateScore(11, 10)).toMatch(/exceed/);
  });
  it("accepts valid scores", () => {
    expect(validateScore(0, 10)).toBeNull();
    expect(validateScore(10, 10)).toBeNull();
    expect(validateScore(7.5, 10)).toBeNull();
  });
});

describe("averages", () => {
  it("weights items and ignores zero-max entries", () => {
    expect(weightedAverage([{ score: 10, maxScore: 10 }, { score: 5, maxScore: 10 }])).toBe(75);
    expect(weightedAverage([{ score: 10, maxScore: 10, weight: 3 }, { score: 0, maxScore: 10, weight: 1 }])).toBe(75);
    expect(weightedAverage([{ score: 10, maxScore: 0 }])).toBeNull();
    expect(weightedAverage([])).toBeNull();
    expect(weightedAverage([{ score: 5, maxScore: 10, weight: 0 }])).toBeNull();
  });
  it("summarises a course", () => {
    expect(summarizeCourse([{ score: 18, maxScore: 20 }, { score: 40, maxScore: 50 }], 3)).toEqual({ average: 85, letter: "B", graded: 2, total: 3 });
    expect(summarizeCourse([], 2)).toEqual({ average: null, letter: null, graded: 0, total: 2 });
  });
  it("computes the overall average skipping empty courses", () => {
    expect(overallAverage([80, null, 90])).toBe(85);
    expect(overallAverage([null])).toBeNull();
  });
});
